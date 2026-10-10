/**
 * 访客统计（Cloudflare Worker + D1，零依赖）。
 *
 * 为什么自己搭：GitHub Pages 是纯静态，没有服务端，写不进任何访问日志；
 * 而 Cloudflare 免费版的 Web Analytics 只给国家、不给城市、也拿不到 IP。
 * 站点域名（newnju.github.io）走的是 GitHub 的 CDN，不经过你自己的 Cloudflare
 * zone，所以「开一个 Worker 反代整站」这条路也走不通 —— 只能由**页面里的
 * 第一方脚本**主动打点过来，也就是本站的 assets/js/visit.js。
 *
 * 端点：
 *   POST /api/visit    页面打点（无 cookie、无第三方脚本、带 DNT 判断）
 *   GET  /api/stats    统计 JSON（Bearer 令牌）
 *   GET  /api/summary  公开计数（免鉴权：只回 pv / 今日 pv·uv，带 ?path= 时
 *                      多回该页的累计阅读数 —— 页脚计数与文章页阅读数用它）
 *   GET  /stats        统计面板（公开，直接渲染 —— 站长要看就看，不再设密码；
 *                      旧链接 /login 一律 302 回这里；?lang=zh|en 与 ?theme=light|dark
 *                      会写 st_lang / st_theme 偏好 cookie 再 302 回干净地址）
 *   GET  /stats.csv    明细导出 CSV（公开，含 IP 与地址推断字段）
 *   GET  /login        旧地址兼容：一律 302 到 /stats（密码流程已下线）
 *   GET  /healthz      健康检查
 *
 * 变量（`npx wrangler secret put`）：
 *   STATS_TOKEN   /api/stats JSON 口的令牌（面板与 CSV 已公开，不再用它）
 *   ALLOWED_ORIGIN  允许打点的页面来源，默认 https://newnju.github.io
 *   IP_SALT        IP 哈希的盐；换掉它等于让所有历史去重失效
 *   RETENTION_DAYS  明细保留天数，默认 180
 *
 * ---------------------------------------------------------------------------
 * 隐私与数据口径：这是站长自用的访问日志（等价于自建服务器的 access log）
 * ---------------------------------------------------------------------------
 * · 打点侧不写 cookie、不用 localStorage、不做跨站跟踪、没有第三方脚本；
 *   面板只在用户点 ?lang= / ?theme= 时下发 st_lang、st_theme 两个偏好 cookie
 *   （存的是显示口味，不含身份、不进统计口径）；
 * · **存明文 IP**（`visits.ip`），用于事后回查；同时存
 *   ip_hash = SHA-256(IP + 当天日期 + IP_SALT) 的前 16 位，UV 去重靠它；
 * · 地址是 Cloudflare GeoIP 按 IP **推断**的（continent/country/region/
 *   city/postal/tz/lat/lon/asn/colo），不引入任何第三方 SDK，不是精确位置；
 * · 明细在公开的 /stats 面板与 /stats.csv 里可见（**面板不设密码**，这是
 *   站长的选择：口径等同把 access log 摆在自己域名下）；/api/summary 对外
 *   只回合计数，/api/stats 的 JSON 口仍要 STATS_TOKEN；
 *   超过 RETENTION_DAYS 由定时任务连行删除（删前按路径 rollup 进累计表）；
 * · referrer 只留域名（完整 URL 里常有搜索词），UA 只粗分成设备/浏览器；
 *   机器人（bot）再按公开特征串认一个家族名（Googlebot/Bingbot/…，存
 *   visits.bot_name），认不出的留空。页面/地域/来源等排行口径只算真人，
 *   PV/UV 指标与设备构成算全部、另给真人/机器人拆分；
 * · 前端尊重 Do Not Track 与 Global Privacy Control：命中就直接不上报。
 */

/** CORS 只对本站开放；所有响应都不缓存 */
function corsHeaders(env, request) {
  const origin = request.headers.get('origin') || '';
  const allowed = env.ALLOWED_ORIGIN || 'https://newnju.github.io';
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '86400',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
  };
}

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });

const sha16 = async (input) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
};

function dayKey(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

/* 爬虫按 UA 家族认名：只认公开特征串，认不出的机器人 bot_name 留空（面板显示
   「其他」）。名字只用于展示与分组，不改变「bot 就是 bot」的判定口径。 */
const BOT_NAMES = [
  ['Googlebot', /googlebot|storebot-google|google-inspectiontool|adsbot-google|mediapartners-google/],
  ['Bingbot', /bingbot|adidxbot/],
  ['BingPreview', /bingpreview/],
  ['Baiduspider', /baiduspider/],
  ['YandexBot', /yandex(?:bot|images|mobilebot|accessibilitybot)/],
  ['Sogou', /sogou\s*(?:web\s*spider|news|pic)/],
  ['Bytespider', /bytespider/],
  ['DuckDuckBot', /duckduckbot/],
  ['PetalBot', /petalbot/],
  ['Applebot', /applebot/],
  ['SemrushBot', /semrushbot/],
  ['AhrefsBot', /ahrefssitebot|ahrefsbot/],
  ['MJ12bot', /mj12bot/],
  ['DotBot', /dotbot/],
  ['Facebook', /facebookexternalhit|facebot/],
  ['Twitterbot', /twitterbot/],
  ['Slackbot', /slackbot/],
  ['Discordbot', /discordbot/],
  ['TelegramBot', /telegrambot/],
  ['WhatsApp', /whatsapp/],
  ['Pingdom', /pingdom/],
  ['UptimeRobot', /uptimerobot/],
];

/** UA 粗分：只留「桌面/移动/平板/机器人」与浏览器家族，不存原文。
 *  机器人再记一个家族名（Googlebot/Bingbot/…），认不出就留空。 */
function classify(ua) {
  const s = ua.toLowerCase();
  const bot = /bot|crawler|spider|crawling|slurp|bingpreview|semrush|ahrefs|headlesschrome|lighthouse|curl\/|wget\/|python-requests|axios/.test(
    s,
  );
  const browser = /edg\//.test(s)
    ? 'edge'
    : /opr\/|opera/.test(s)
      ? 'opera'
      : /chrome\//.test(s) && !/chromium/.test(s)
        ? 'chrome'
        : /firefox\//.test(s)
          ? 'firefox'
          : /safari\//.test(s)
            ? 'safari'
            : 'other';
  let device = 'desktop';
  if (bot) device = 'bot';
  else if (/ipad|tablet|playbook|silk/.test(s)) device = 'tablet';
  else if (/mobi|iphone|android.*mobile|windows phone/.test(s)) device = 'mobile';
  const botName = bot ? (BOT_NAMES.find(([, re]) => re.test(s))?.[0] ?? null) : null;
  return { browser, device, bot: device === 'bot' ? 1 : 0, botName };
}

/** referrer 只留域名 */
function refHost(referer) {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    if (!/^https?:$/.test(u.protocol)) return null;
    return u.host || null;
  } catch {
    return null;
  }
}

/**
 * D1 偶发 SQLITE_BUSY / 写锁冲突时等一拍再试一次（打点写入专用）。
 * 失败的 run() 意味着这条语句没提交，重试不会双写；极少数「网络断在提交
 * 之后」的模糊情形可能重出一行 —— 对个人站点统计，宁可偶尔多一个 PV，
 * 也不因一次锁冲突丢掉整条打点。
 */
async function runWithRetry(stmt, attempts = 2) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await stmt.run();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 80 * (i + 1)));
    }
  }
  throw lastErr;
}

async function handleVisit(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(env, request) });
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405, corsHeaders(env, request));

  if (!env.DB) return json({ error: 'D1 未绑定' }, 500, corsHeaders(env, request));

  // 站点开着 DNT 时前端会直接不发；这里也认一道 header，挡住手工绕过前端的调用
  if (request.headers.get('dnt') === '1') return json({ ok: true, skipped: 'dnt' }, 200, corsHeaders(env, request));

  const ip = request.headers.get('cf-connecting-ip') || '';
  if (!ip) return json({ error: 'no client ip' }, 400, corsHeaders(env, request));

  let body = {};
  try {
    body = await request.json();
  } catch {
    /* 空 body 就按空处理，打点不该因为格式问题整个丢掉 */
  }

  const cf = request.cf ?? {};
  const ts = Math.floor(Date.now() / 1000);
  const day = dayKey(ts);
  const ua = request.headers.get('user-agent') || '';
  const { browser, device, bot, botName } = classify(ua);
  const host = request.headers.get('host') || '';

  // 路径：只留路径部分，查询串（可能有搜索词）直接丢
  let path = '/';
  try {
    const u = new URL(String(body.p ?? '/'), 'https://x.invalid');
    path = (u.pathname + u.hash).slice(0, 300) || '/';
  } catch {
    /* 非法路径就记根，不因为一个脏值丢整条 */
  }

  const ipHash = await sha16(`${ip}|${day}|${env.IP_SALT || ''}`);
  const host_ = refHost(String(body.r ?? request.headers.get('referer') ?? ''));
  const num = (v) => (Number.isFinite(+v) && v !== '' && v !== null ? +v : null);

  const columns = [
    'ts', 'day', 'path', 'host', 'ip', 'ip_hash',
    'continent', 'country', 'region', 'region_code', 'city', 'postal', 'tz',
    'lat', 'lon', 'asn', 'colo',
    'device', 'browser', 'bot_name', 'ref_host', 'lang',
  ];
  const values = [
    ts, day, path, host, ip, ipHash,
    cf.continent ?? null, cf.country ?? null, cf.region ?? null,
    cf.regionCode ?? cf.region_code ?? null, cf.city ?? null,
    cf.postalCode ?? cf.postal_code ?? null, cf.timezone ?? null,
    num(cf.latitude), num(cf.longitude), num(cf.asn), cf.colo ?? null,
    device, browser, botName, host_, String(body.l ?? '').slice(0, 16) || null,
  ];

  await runWithRetry(
    env.DB.prepare(
      `INSERT INTO visits (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    ).bind(...values),
  );

  console.log(
    JSON.stringify({
      event: 'visit',
      path,
      day,
      ip,
      country: cf.country ?? null,
      region: cf.region ?? null,
      city: cf.city ?? null,
      device,
      bot,
      bot_name: botName,
      ip_hash: ipHash,
    }),
  );

  return json({ ok: true }, 200, corsHeaders(env, request));
}

async function stats(env, days) {
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args).all();
  const since = Date.now() / 1000 - days * 86400;
  // 口径分工：指标与趋势给「全部 + 真人/机器人拆分」两套数；维度列表（页面
  // 排行、地域、来源、浏览器、语言、覆盖面）只算真人 —— 那些表回答的是
  // 「谁在看站」，爬虫不是访客；设备构成仍算全部（机器人是构成的一部分），
  // 另给一张按 bot_name 分组的爬虫表；明细保留全部行、带 bot_name 可审计。
  const HUMAN = `device <> 'bot'`;
  const [totals, today, reach, daily, paths, countries, regions, cities, refs, devices, browsers, langs, bots, recent] =
    await Promise.all([
      q(
        `SELECT COUNT(*) AS pv, COUNT(DISTINCT ip_hash) AS uv, COUNT(DISTINCT day) AS days,
                SUM(device = 'bot') AS bot_pv, SUM(${HUMAN}) AS human_pv,
                COUNT(DISTINCT CASE WHEN ${HUMAN} THEN ip_hash END) AS human_uv
           FROM visits WHERE ts >= ?`,
        since,
      ),
      q(
        `SELECT COUNT(*) AS pv, COUNT(DISTINCT ip_hash) AS uv
           FROM visits WHERE day = ?`,
        dayKey(Math.floor(Date.now() / 1000)),
      ),
      // 覆盖面：多少个国家 / 省 / 城市 / 页面（真人）
      q(
        `SELECT COUNT(DISTINCT country) AS countries, COUNT(DISTINCT region) AS regions,
                COUNT(DISTINCT city) AS cities, COUNT(DISTINCT path) AS paths
           FROM visits WHERE ts >= ? AND ${HUMAN}`,
        since,
      ),
      q(
        `SELECT day, COUNT(*) AS pv, COUNT(DISTINCT ip_hash) AS uv,
                SUM(device = 'bot') AS bpv, SUM(${HUMAN}) AS hpv,
                COUNT(DISTINCT CASE WHEN ${HUMAN} THEN ip_hash END) AS huv
           FROM visits WHERE ts >= ? GROUP BY day ORDER BY day`,
        since,
      ),
      q(`SELECT path, COUNT(*) AS n FROM visits WHERE ts >= ? AND ${HUMAN} GROUP BY path ORDER BY n DESC LIMIT 25`, since),
      q(`SELECT COALESCE(country,'—') AS k, COUNT(*) AS n FROM visits WHERE ts >= ? AND ${HUMAN} GROUP BY k ORDER BY n DESC LIMIT 20`, since),
      q(`SELECT COALESCE(region,'—') AS k, COUNT(*) AS n FROM visits WHERE ts >= ? AND ${HUMAN} GROUP BY k ORDER BY n DESC LIMIT 20`, since),
      q(`SELECT COALESCE(city,'—') AS k, COUNT(*) AS n FROM visits WHERE ts >= ? AND ${HUMAN} GROUP BY k ORDER BY n DESC LIMIT 20`, since),
      q(`SELECT COALESCE(ref_host,'直接访问') AS k, COUNT(*) AS n FROM visits WHERE ts >= ? AND ${HUMAN} GROUP BY k ORDER BY n DESC LIMIT 15`, since),
      q(`SELECT device AS k, COUNT(*) AS n FROM visits WHERE ts >= ? GROUP BY k ORDER BY n DESC`, since),
      q(`SELECT browser AS k, COUNT(*) AS n FROM visits WHERE ts >= ? AND ${HUMAN} GROUP BY k ORDER BY n DESC`, since),
      q(`SELECT COALESCE(NULLIF(lang,''),'—') AS k, COUNT(*) AS n FROM visits WHERE ts >= ? AND ${HUMAN} GROUP BY k ORDER BY n DESC LIMIT 10`, since),
      // 机器人按家族分组；bot_name 为空（历史行或认不出）归到 '—'，面板显示「其他」
      q(`SELECT COALESCE(NULLIF(bot_name,''),'—') AS k, COUNT(*) AS n FROM visits WHERE ts >= ? AND device = 'bot' GROUP BY k ORDER BY n DESC LIMIT 10`, since),
      // 访客明细：IP 与地址推断字段都在这里（面板密码后面，不对外）
      q(
        `SELECT ts, day, path, ip, continent, country, region, city, postal, tz, lat, lon, asn, colo,
                device, browser, bot_name, ref_host, lang
           FROM visits WHERE ts >= ? ORDER BY ts DESC LIMIT 50`,
        since,
      ),
    ]);

  const rows = (r) => r.results ?? [];
  const t = rows(totals)[0] ?? { pv: 0, uv: 0, days: 0 };
  const td = rows(today)[0] ?? { pv: 0, uv: 0 };
  const reachRow = rows(reach)[0] ?? {};
  return {
    days,
    generated_at: new Date().toISOString(),
    totals: {
      ...t,
      bot_pv: t.bot_pv ?? 0,
      human_pv: t.human_pv ?? 0,
      human_uv: t.human_uv ?? 0,
      today_pv: td.pv ?? 0,
      today_uv: td.uv ?? 0,
    },
    reach: {
      countries: reachRow.countries ?? 0,
      regions: reachRow.regions ?? 0,
      cities: reachRow.cities ?? 0,
      paths: reachRow.paths ?? 0,
    },
    daily: rows(daily),
    paths: rows(paths),
    countries: rows(countries),
    regions: rows(regions),
    cities: rows(cities),
    referrers: rows(refs),
    devices: rows(devices),
    browsers: rows(browsers),
    languages: rows(langs),
    bots: rows(bots),
    recent: rows(recent),
  };
}

/** 明细 CSV（/stats.csv）：与面板同一套凭据，180 天保留期内全量可导 */
async function visitsCsv(env, days) {
  const since = Date.now() / 1000 - days * 86400;
  const res = await env.DB.prepare(
    `SELECT ts, day, path, ip, ip_hash, continent, country, region, region_code, city, postal, tz,
            lat, lon, asn, colo, device, browser, bot_name, ref_host, lang
       FROM visits WHERE ts >= ? ORDER BY ts DESC LIMIT 10000`,
  ).bind(since).all();
  const cols = [
    'ts', 'iso_time', 'day', 'path', 'ip', 'ip_hash', 'continent', 'country', 'region', 'region_code',
    'city', 'postal', 'tz', 'lat', 'lon', 'asn', 'colo', 'device', 'browser', 'bot_name', 'ref_host', 'lang',
  ];
  const cell = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(',')];
  for (const r of res.results ?? []) {
    lines.push([r.ts, new Date(r.ts * 1000).toISOString(), ...cols.slice(2).map((c) => r[c])].map(cell).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/** 公开计数：免鉴权，只回数字。绝不带国家/城市/来源这类维度 —— 这个接口给
 *  页脚「本站访问量」与文章页「本文阅读」直接从浏览器读，所以钥匙不进前端。 */
async function summary(env, url) {
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args).all();
  const [live, today, life] = await Promise.all([
    q('SELECT COUNT(*) AS n FROM visits'),
    q('SELECT COUNT(*) AS pv, COUNT(DISTINCT ip_hash) AS uv FROM visits WHERE day = ?', dayKey(Math.floor(Date.now() / 1000))),
    q('SELECT COALESCE(SUM(pv), 0) AS n FROM lifetime_path'),
  ]);
  const num = (r, k = 'n') => Number((r.results ?? [])[0]?.[k] ?? 0);
  const out = {
    pv: num(live) + num(life),
    today_pv: num(today, 'pv'),
    today_uv: num(today, 'uv'),
    generated_at: new Date().toISOString(),
  };
  const rawPath = url.searchParams.get('path');
  if (rawPath) {
    // 与打点同一套归一化：丢查询串、只留 pathname + hash，上限 300
    let p = '/';
    try {
      const u = new URL(String(rawPath), 'https://x.invalid');
      p = (u.pathname + u.hash).slice(0, 300) || '/';
    } catch {
      /* 脏值当根路径处理，不 500 */
    }
    const [pageLive, pageLife] = await Promise.all([
      q('SELECT COUNT(*) AS page_pv FROM visits WHERE path = ?', p),
      q('SELECT COALESCE(pv, 0) AS n FROM lifetime_path WHERE path = ?', p),
    ]);
    out.path = p;
    out.page_pv = num(pageLive, 'page_pv') + num(pageLife);
  }
  return out;
}

/** /api/stats JSON 口的钥匙：Bearer 头（给脚本）、HTTP Basic 的密码那半（curl -u）或 URL 上的 ?key=。
 *  面板与 CSV 已公开，不再走这里 */
function authorised(request, env, url) {
  if (!env.STATS_TOKEN) return false;
  const header = request.headers.get('authorization') || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(header)?.[1];
  if (bearer) return bearer === env.STATS_TOKEN;
  const basic = /^Basic\s+(\S+)$/i.exec(header)?.[1];
  if (basic) {
    // 浏览器对 401+WWW-Authenticate: Basic 会弹框，用户名随便、密码填 STATS_TOKEN；
    // 以前这里没解 Basic，弹了框也永远进不去（只认 Bearer 和 ?key=）。
    try {
      const decoded = atob(basic);
      return decoded.slice(decoded.indexOf(':') + 1) === env.STATS_TOKEN;
    } catch {
      return false;
    }
  }
  return url.searchParams.get('key') === env.STATS_TOKEN;
}

// ---------------------------------------------------------------------------
// 旧的 /login 密码流程已下线：面板与 CSV 公开，/login 一律 302 回 /stats
// ---------------------------------------------------------------------------

const redirect = (location) =>
  new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store' } });

const esc = (s) =>
  String(s ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/* ---------- 仪表盘：Mercator 分析工作台版式（服务端渲染、零 JS，CSP 仍 default-src 'none'） ---------- */

const COUNTRY_CN = {
  CN: '中国', TW: '中国台湾', HK: '中国香港', MO: '中国澳门', US: '美国', JP: '日本', KR: '韩国',
  SG: '新加坡', DE: '德国', GB: '英国', FR: '法国', CA: '加拿大', AU: '澳大利亚', NL: '荷兰',
  RU: '俄罗斯', IN: '印度', BR: '巴西', SE: '瑞典', CH: '瑞士', IE: '爱尔兰', IT: '意大利',
  ES: '西班牙', PL: '波兰', UA: '乌克兰', VN: '越南', TH: '泰国', MY: '马来西亚', ID: '印度尼西亚',
  PH: '菲律宾', NZ: '新西兰', AT: '奥地利', BE: '比利时', CZ: '捷克', DK: '丹麦', FI: '芬兰',
  IL: '以色列', MX: '墨西哥', NO: '挪威', PT: '葡萄牙', TR: '土耳其', ZA: '南非', AR: '阿根廷',
  CL: '智利', CO: '哥伦比亚', EG: '埃及', GH: '加纳', GR: '希腊', HU: '匈牙利', IS: '冰岛',
  LT: '立陶宛', RO: '罗马尼亚', SA: '沙特阿拉伯', RS: '塞尔维亚', KW: '科威特',
  LK: '斯里兰卡', PK: '巴基斯坦', BD: '孟加拉国', NG: '尼日利亚', KE: '肯尼亚', EE: '爱沙尼亚',
  LV: '拉脱维亚', SK: '斯洛伐克', SI: '斯洛文尼亚', HR: '克罗地亚', BG: '保加利亚', BY: '白俄罗斯',
  KZ: '哈萨克斯坦', MN: '蒙古', LA: '老挝', KH: '柬埔寨', MM: '缅甸', NP: '尼泊尔', IR: '伊朗',
  IQ: '伊拉克', JO: '约旦', LB: '黎巴嫩', AE: '阿联酋', QA: '卡塔尔', OM: '阿曼', BH: '巴林',
  UY: '乌拉圭', PE: '秘鲁', EC: '厄瓜多尔', VE: '委内瑞拉', BO: '玻利维亚', PY: '巴拉圭',
  CR: '哥斯达黎加', PA: '巴拿马', DO: '多米尼加', CU: '古巴', '—': '—',
};
const COUNTRY_EN = {
  CN: 'China', TW: 'Taiwan, China', HK: 'Hong Kong, China', MO: 'Macau, China',
  US: 'United States', JP: 'Japan', KR: 'South Korea', SG: 'Singapore', DE: 'Germany',
  GB: 'United Kingdom', FR: 'France', CA: 'Canada', AU: 'Australia', NL: 'Netherlands',
  RU: 'Russia', IN: 'India', BR: 'Brazil', SE: 'Sweden', CH: 'Switzerland', IE: 'Ireland',
  IT: 'Italy', ES: 'Spain', PL: 'Poland', UA: 'Ukraine', VN: 'Vietnam', TH: 'Thailand',
  MY: 'Malaysia', ID: 'Indonesia', PH: 'Philippines', NZ: 'New Zealand', AT: 'Austria',
  BE: 'Belgium', CZ: 'Czechia', DK: 'Denmark', FI: 'Finland', IL: 'Israel', MX: 'Mexico',
  NO: 'Norway', PT: 'Portugal', TR: 'Turkey', ZA: 'South Africa', AR: 'Argentina',
  CL: 'Chile', CO: 'Colombia', EG: 'Egypt', GH: 'Ghana', GR: 'Greece', HU: 'Hungary',
  IS: 'Iceland', LT: 'Lithuania', RO: 'Romania', SA: 'Saudi Arabia', RS: 'Serbia',
  KW: 'Kuwait', LK: 'Sri Lanka', PK: 'Pakistan', BD: 'Bangladesh', NG: 'Nigeria',
  KE: 'Kenya', EE: 'Estonia', LV: 'Latvia', SK: 'Slovakia', SI: 'Slovenia', HR: 'Croatia',
  BG: 'Bulgaria', BY: 'Belarus', KZ: 'Kazakhstan', MN: 'Mongolia', LA: 'Laos',
  KH: 'Cambodia', MM: 'Myanmar', NP: 'Nepal', IR: 'Iran', IQ: 'Iraq', JO: 'Jordan',
  LB: 'Lebanon', AE: 'United Arab Emirates', QA: 'Qatar', OM: 'Oman', BH: 'Bahrain',
  UY: 'Uruguay', PE: 'Peru', EC: 'Ecuador', VE: 'Venezuela', BO: 'Bolivia', PY: 'Paraguay',
  CR: 'Costa Rica', PA: 'Panama', DO: 'Dominican Republic', CU: 'Cuba', '—': '—',
};

/* 语言 / 明暗偏好（面板自己的小状态机，零 JS，CSP 不允许脚本）：
   ?lang= / ?theme= 合法值 → Set-Cookie 后 302 回干净地址（PRG，刷新不重放参数），
   之后每次渲染只认 cookie —— 所以时间范围这类链接保持原样，偏好不会被冲掉。
   没点过切换的浏览器不收任何 cookie（/stats 裸开依然零 Set-Cookie）。 */
const PREF_VALUES = { st_lang: ['zh', 'en'], st_theme: ['dark', 'light'] };
const prefCookie = (name, value) => `${name}=${value}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;

function prefsFromCookies(request) {
  const out = {};
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const key = part.slice(0, i).trim();
    if (key in PREF_VALUES) {
      const v = part.slice(i + 1).trim();
      if (PREF_VALUES[key].includes(v)) out[key] = v;
    }
  }
  return out;
}

/* 面板文案：中英各一份。站内文案归 _data/ui-text.yml 管（Jekyll 数据，Worker 拿不到），
   这里独立维护一份同口径的键；切换链接显示「目标语言」的名字，与主站顶栏一致。 */
const I18N = {
  zh: {
    htmlLang: 'zh-CN',
    title: '访客统计 · 仪表盘',
    brand: '访客统计',
    sidebarLabel: '分析',
    navAria: '面板导航',
    nav: ['概览', '关键指标', '趋势与构成', '地域分布', '来源与设备', '页面排行', '访客明细'],
    note: (ret) =>
      `地址来自 Cloudflare GeoIP 按 IP 推断，不是精确定位；独立访客按「当天 IP 哈希」去重，跨天不合并。机器人已计入 PV，并单列「爬虫构成」；页面、地域、来源等排行只统计真人访问。明细保留 ${ret} 天，之后连行删除。`,
    crumbs: '统计',
    rangeAria: '时间范围',
    lastDays: (n) => `近 ${n} 天`,
    noRecords: (n) => `近 ${n} 天（无记录）`,
    badge: 'GeoIP 推断',
    exportCsv: '↓ 导出 CSV',
    greet: '你好，访客统计',
    greetLine: (range, at) => `${range} · 生成于 ${at} · 时区 UTC`,
    daysSum: (n) => `近 ${n} 天累计`,
    h: { metrics: '关键指标', trend: '趋势与构成', geo: '地域分布', traffic: '来源与设备', pages: '页面排行', detail: '访客明细' },
    trendSub: '按天聚合 · UTC',
    geoSub: '国家 / 省 / 城市（GeoIP 推断）',
    chartTrend: 'PV / UV 趋势',
    trendAria: '每日 PV、真人 PV 与 UV 趋势',
    legendPv: '浏览量 PV（全部）',
    legendHuman: '真人 PV',
    legendUv: '独立访客 UV（虚线）',
    chartDonut: '设备构成',
    donutAria: '设备构成环形图',
    donutUnit: '浏览量',
    botsTitle: '爬虫构成',
    otherBot: '其他',
    hCountry: '国家 / 地区',
    hRegion: '省 / 州',
    hCity: '城市',
    hRef: '来源域名',
    hBrowser: '浏览器',
    hLang: '界面语言',
    pagesSub: 'PV 前 25',
    detailSub: '最近 50 条 · 含明文 IP 与推断位置',
    detailHead: ['时间 (UTC)', '页面', 'IP', '位置（推断）', '网络', '设备 · 浏览器', '来源', '语言'],
    name: '名称',
    count: '次数',
    pvCol: 'PV',
    empty: '暂无数据',
    emptyDev: '暂无设备数据',
    emptyRange: '这个区间还没有记录',
    direct: '直接访问',
    device: { desktop: '桌面', mobile: '手机', tablet: '平板', bot: '机器人', other: '其他' },
    country: (c) => COUNTRY_CN[c] || c || '—',
    pvL: '浏览量 PV',
    pvS: (avg, human) => `日均 ${avg} · 真人 ${human}`,
    uvL: '独立访客 UV',
    uvS: (human, bot) => `真人 UV ${human} · 机器人 PV ${bot}`,
    todayPvL: '今日 PV',
    todayPvS: (uv) => `今日 UV ${uv}`,
    todayUvL: '今日 UV',
    todayUvS: '今天到目前为止',
    daysL: '有记录的天数',
    countriesL: '国家 / 地区',
    countriesS: (n) => `省 / 州 ${n}`,
    citiesL: '城市',
    citiesS: 'GeoIP 推断值',
    pathsL: '覆盖页面',
    pathsS: '有记录的站内路径',
    switchLang: 'English',
    switchLangTitle: 'Switch to English',
    themeToggle: '切换明暗主题',
    foot:
      '口径：PV 为请求数；UV 按「当天 IP + 日期 + 盐」的哈希去重，跨天不合并、无法串起来追踪个人。位置、邮编、时区、ASN、接入机房均来自 Cloudflare GeoIP 按 IP <b>推断</b>，不是精确定位。本页与 CSV 导出<b>公开可访问</b>（含明文 IP 与推断位置，不设密码）；明细超过保留期由定时任务连行删除（删除前按路径计入累计口径），站内免鉴权的 /api/summary 只回合计数，/api/stats 的 JSON 口仍需令牌。',
  },
  en: {
    htmlLang: 'en',
    title: 'Visitor stats · Dashboard',
    brand: 'Visitor stats',
    sidebarLabel: 'Analysis',
    navAria: 'Dashboard navigation',
    nav: ['Overview', 'Key metrics', 'Trend & mix', 'Geography', 'Traffic sources', 'Top pages', 'Recent visits'],
    note: (ret) =>
      `Addresses are Cloudflare GeoIP inference by IP, not exact location; unique visitors are deduplicated by "same-day IP hash" and never merged across days. Bots are counted in PV and listed separately under "Crawlers"; page, geography and referrer rankings count human visits only. Details are kept for ${ret} days, then deleted row by row.`,
    crumbs: 'Stats',
    rangeAria: 'Time range',
    lastDays: (n) => `Last ${n} days`,
    noRecords: (n) => `Last ${n} days (no records)`,
    badge: 'GeoIP inferred',
    exportCsv: '↓ Export CSV',
    greet: 'Hello, visitor stats',
    greetLine: (range, at) => `${range} · generated at ${at} · timezone UTC`,
    daysSum: (n) => `Last ${n} days total`,
    h: { metrics: 'Key metrics', trend: 'Trend & mix', geo: 'Geography', traffic: 'Traffic sources', pages: 'Top pages', detail: 'Recent visits' },
    trendSub: 'Aggregated by day · UTC',
    geoSub: 'Country / region / city (GeoIP inferred)',
    chartTrend: 'PV / UV trend',
    trendAria: 'Daily PV, human PV and UV trend',
    legendPv: 'Page views PV (all)',
    legendHuman: 'Human PV',
    legendUv: 'Unique visitors UV (dashed)',
    chartDonut: 'Devices',
    donutAria: 'Device mix donut chart',
    donutUnit: 'Page views',
    botsTitle: 'Crawlers',
    otherBot: 'Other',
    hCountry: 'Country / region',
    hRegion: 'State / region',
    hCity: 'City',
    hRef: 'Referrer host',
    hBrowser: 'Browser',
    hLang: 'Interface language',
    pagesSub: 'Top 25 by PV',
    detailSub: 'Latest 50 rows · plain IP and inferred location',
    detailHead: ['Time (UTC)', 'Page', 'IP', 'Location (inferred)', 'Network', 'Device · Browser', 'Referrer', 'Language'],
    name: 'Name',
    count: 'Count',
    pvCol: 'PV',
    empty: 'No data yet',
    emptyDev: 'No device data',
    emptyRange: 'No records in this range',
    direct: 'Direct',
    device: { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet', bot: 'Bot', other: 'Other' },
    country: (c) => COUNTRY_EN[c] || c || '—',
    pvL: 'Page views PV',
    pvS: (avg, human) => `${avg} / day · human ${human}`,
    uvL: 'Unique visitors UV',
    uvS: (human, bot) => `Human UV ${human} · bot PV ${bot}`,
    todayPvL: 'Today PV',
    todayPvS: (uv) => `Today UV ${uv}`,
    todayUvL: 'Today UV',
    todayUvS: 'so far today',
    daysL: 'Days with records',
    countriesL: 'Countries',
    countriesS: (n) => `Regions ${n}`,
    citiesL: 'Cities',
    citiesS: 'GeoIP inferred',
    pathsL: 'Pages covered',
    pathsS: 'tracked in-site paths',
    switchLang: '中文',
    switchLangTitle: '切换为中文',
    themeToggle: 'Switch between light and dark',
    foot:
      'Method: PV counts requests; UV is deduplicated by hashing "IP + date + salt" for that day only — never merged across days, and impossible to chain back to a person. Location, postal code, timezone, ASN and colo all come from Cloudflare GeoIP <b>inference</b> by IP, not exact positioning. This page and the CSV export are <b>publicly accessible</b> (plain IPs and inferred locations included, no password); rows past the retention period are deleted by a scheduled job (counted toward lifetime totals by path before deletion), the token-free /api/summary only returns aggregate counts, and the /api/stats JSON endpoint still requires a token.',
  },
};

const ICON = {
  globe:
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true"><circle cx="8" cy="8" r="6.3"/><path d="M1.7 8h12.6M8 1.7c-4.6 4-4.6 8.6 0 12.6M8 1.7c4.6 4 4.6 8.6 0 12.6"/></svg>',
  sun:
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1.6v1.5M8 12.9v1.5M1.6 8h1.5M12.9 8h1.5M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1"/></svg>',
  moon:
    '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M13.9 9.8A5.95 5.95 0 0 1 6.2 2.1a5.95 5.95 0 1 0 7.7 7.7z"/></svg>',
};

/* 暗色配色与主站 nju-dark 同源（_sass/_han.scss §8）：深绿灰底 + 南大紫强调。
   渲染分两步：显式 data-theme 走第一行；没设过偏好的浏览器走 @media 兜底
   （html:not([data-theme]) 跟随系统）—— 与主站「首访跟系统、点过就固定」一致。 */
const DARK_VARS =
  '--bg:#1d2321;--surface:#262e2b;--ink:#e8e3d7;--muted:#b8b1a2;--line:#353d39;--accent:#b794d4;' +
  '--accent-soft:rgba(183,148,212,.14);--gold:#e0c074;--c1:#b794d4;--c2:#e0c074;--c3:#7cbfa2;' +
  '--c4:#c9a9e0;--c5:#b0a897;--c6:#d9705f;--shadow:rgba(0,0,0,.35);--accent-border:rgba(183,148,212,.35);' +
  '--btn-ink:#161319;color-scheme:dark';

const DEV_COLORS = { desktop: 'var(--c1)', mobile: 'var(--c2)', tablet: 'var(--c3)', bot: 'var(--c4)', other: 'var(--c5)' };
const PALETTE = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];

const fmtNum = (v) => {
  const n = Number(v) || 0;
  if (n >= 10000) return `${(n / 1000).toFixed(0)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
};
const fmtTime = (ts) => new Date(ts * 1000).toISOString().slice(5, 16).replace('T', ' ');

function niceMax(v) {
  if (!(v > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 5, 10]) if (v <= m * mag) return m * mag;
  return 10 * mag;
}

function trendSvg(daily, L) {
  const W = 720, H = 220, PL = 40, PR = 12, PT = 14, PB = 26;
  if (!daily.length) return `<p class="empty">${esc(L.emptyRange)}</p>`;
  const maxY = niceMax(Math.max(...daily.map((d) => Math.max(d.pv, d.uv, d.hpv ?? 0)), 1));
  const iw = W - PL - PR, ih = H - PT - PB;
  const X = (i) => (daily.length === 1 ? PL + iw / 2 : PL + (i * iw) / (daily.length - 1));
  const Y = (v) => PT + ih - (v / maxY) * ih;
  const line = (key) => daily.map((d, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(d[key]).toFixed(1)}`).join('');
  const base = (PT + ih).toFixed(1);
  let grid = '';
  for (let g = 0; g <= 4; g++) {
    const y = Y((maxY * g) / 4);
    grid += `<line class="grid" x1="${PL}" y1="${y.toFixed(1)}" x2="${W - PR}" y2="${y.toFixed(1)}"/>` +
      `<text x="${PL - 6}" y="${(y + 3).toFixed(1)}" text-anchor="end">${fmtNum((maxY * g) / 4)}</text>`;
  }
  const tickIdx = [];
  const step = Math.max(1, Math.floor((daily.length - 1) / 4));
  for (let i = 0; i < daily.length; i += step) tickIdx.push(i);
  if (tickIdx[tickIdx.length - 1] !== daily.length - 1) tickIdx.push(daily.length - 1);
  const xt = tickIdx
    .map((i) => `<text x="${X(i).toFixed(1)}" y="${H - 8}" text-anchor="middle">${daily[i].day.slice(5)}</text>`)
    .join('');
  const dot = daily.length === 1
    ? `<circle cx="${X(0).toFixed(1)}" cy="${Y(daily[0].pv).toFixed(1)}" r="3" fill="var(--accent)"/>`
    : '';
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="220" role="img" aria-label="${esc(L.trendAria)}">
 ${grid}
<path d="${line('pv')}L${X(daily.length - 1).toFixed(1)},${base}L${X(0).toFixed(1)},${base}Z" fill="var(--accent-soft)"/>
 <path d="${line('pv')}" fill="none" stroke="var(--accent)" stroke-width="2"/>
 <path d="${line('hpv')}" fill="none" stroke="var(--c3)" stroke-width="1.6"/>
 <path d="${line('uv')}" fill="none" stroke="var(--gold)" stroke-width="1.6" stroke-dasharray="5 4"/>
${dot}${xt}
</svg>`;
}

function donutSvg(items, total, L) {
  if (!total) return `<p class="empty">${esc(L.emptyDev)}</p>`;
  const R = 48, C = 2 * Math.PI * R;
  let off = 0;
  const segs = items
    .map((it) => {
      const len = (it.n / total) * C;
      const s = `<circle cx="75" cy="75" r="${R}" fill="none" stroke="${it.color}" stroke-width="18" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}"/>`;
      off += len;
      return s;
    })
    .join('');
  return `<svg viewBox="0 0 150 150" width="150" height="150" role="img" aria-label="${esc(L.donutAria)}">
<g transform="rotate(-90 75 75)">${segs}</g>
<text x="75" y="72" text-anchor="middle" class="donut-v">${fmtNum(total)}</text>
<text x="75" y="88" text-anchor="middle" class="donut-l">${esc(L.donutUnit)}</text>
</svg>`;
}

function dashboard(data, opts = {}) {
  const { retention = 180, lang = 'zh', theme = null, iconTheme = 'light', toggleTheme = 'dark' } = opts;
  const L = I18N[lang] || I18N.zh;
  const t = data.totals ?? {};
  const reach = data.reach ?? {};
  const daily = data.daily ?? [];
  const days = data.days ?? 30;
  const range = daily.length ? `${daily[0].day} ~ ${daily[daily.length - 1].day}` : L.noRecords(days);

  const metric = (label, value, sub, hi = false) => `
    <div class="card metric${hi ? ' hi' : ''}">
      <div class="v">${esc(value)}</div>
      <div class="l">${esc(label)}</div>
      ${sub ? `<div class="s">${esc(sub)}</div>` : ''}
    </div>`;

  const listTable = (rows, fmt, countHead = L.count) => {
    if (!rows?.length) return `<p class="empty">${L.empty}</p>`;
    const max = Math.max(...rows.map((r) => r.n ?? 0), 1);
    return `<table><thead><tr><th>${esc(L.name)}</th><th aria-hidden="true"></th><th class="num">${esc(countHead)}</th></tr></thead><tbody>${rows
      .map(
        (r) => `<tr><td class="nm">${fmt(r)}</td><td style="width:38%"><div class="bar"><span style="width:${Math.max(3, Math.round(((r.n ?? 0) / max) * 100))}%"></span></div></td><td class="num">${fmtNum(r.n)}</td></tr>`,
      )
      .join('')}</tbody></table>`;
  };

  const devItems = (data.devices ?? []).map((r, i) => ({
    k: r.k,
    n: r.n,
    color: DEV_COLORS[r.k] || PALETTE[i % PALETTE.length],
  }));
  const devTotal = devItems.reduce((s, it) => s + it.n, 0);
  const devLegend = devItems.length
    ? devItems
        .map(
          (it) => `<li><i style="background:${it.color}"></i>${esc(L.device[it.k] || it.k)}<b>${fmtNum(it.n)}</b><em>${devTotal ? Math.round((it.n / devTotal) * 100) : 0}%</em></li>`,
        )
        .join('')
    : `<li class="dim">${L.empty}</li>`;

  const geoCell = (r) => [L.country(r.country), r.region, r.city].filter(Boolean).join(' / ');
  // 明细的设备格：认出家族的机器人显示「机器人 · Googlebot」；
  // 认不出/历史行保持「机器人 · 浏览器」的旧样子
  const devCell = (r) =>
    r.device === 'bot' && r.bot_name
      ? `${L.device.bot} · ${r.bot_name}`
      : `${L.device[r.device] || r.device || '—'} · ${r.browser || '—'}`;
  const recent = data.recent ?? [];
  const detailRows = recent
    .map(
      (r) => `<tr>
<td class="num">${fmtTime(r.ts)}</td>
<td><span class="code">${esc(r.path)}</span></td>
<td><span class="code">${esc(r.ip || '—')}</span></td>
<td>${esc(geoCell(r))}</td>
<td class="num">${r.asn ? `AS${r.asn}` : '—'}${r.colo ? ` · ${esc(r.colo)}` : ''}</td>
<td>${esc(devCell(r))}</td>
<td>${esc(r.ref_host || L.direct)}</td>
<td>${esc(r.lang || '—')}</td>
</tr>`,
    )
    .join('');
  const detailHead = L.detailHead.map((h, i) => `<th${i === 4 ? ' class="num"' : ''}>${esc(h)}</th>`).join('');

  const seg = [7, 30, 90, 365]
    .map((n) => `<a href="?days=${n}"${n === days ? ' aria-current="true"' : ''}>${L.lastDays(n)}</a>`)
    .join('');

  // 切换项只认 cookie，链接把当前 days 带上；en 页面上的 ?lang=en 是给
  // 站内链接（页脚「统计详情」）直达用的，落到这台 Worker 后写 cookie 再 302。
  const langSwitch =
    `<a class="tool tool-lang" href="/stats?days=${days}&amp;lang=${lang === 'zh' ? 'en' : 'zh'}"` +
    ` title="${esc(L.switchLangTitle)}" aria-label="${esc(L.switchLangTitle)}">${ICON.globe}<span>${esc(L.switchLang)}</span></a>`;
  const themeSwitch =
    `<a class="tool tool-theme" href="/stats?days=${days}&amp;theme=${toggleTheme}"` +
    ` title="${esc(L.themeToggle)}" aria-label="${esc(L.themeToggle)}">${iconTheme === 'dark' ? ICON.moon : ICON.sun}</a>`;

  const sideNav = ['overview', 'metrics', 'trend', 'geo', 'traffic', 'pages', 'detail']
    .map((id, i) => `<a href="#${id}"${i === 0 ? ' aria-current="true"' : ''}>${esc(L.nav[i])}</a>`)
    .join('');

  return `<!doctype html><html lang="${L.htmlLang}"${theme ? ` data-theme="${theme}"` : ''}><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>${esc(L.title)}</title>
<style>
:root{--bg:#fbf8f1;--surface:#fffdf7;--ink:#3f3a33;--muted:#857d6e;--line:#e8e1d3;--accent:#5c2e83;--accent-soft:rgba(92,46,131,.10);--gold:#c8a45c;--c1:#5c2e83;--c2:#c8a45c;--c3:#2f6b5a;--c4:#9b6fb8;--c5:#7d7566;--c6:#9e2b25;--shadow:rgba(43,39,35,.10);--accent-border:rgba(92,46,131,.22);--btn-ink:#fff;--r-sm:2px;--r-md:2px;--sidebar-w:250px;color-scheme:light}
html[data-theme="dark"]{${DARK_VARS}}
@media (prefers-color-scheme: dark){html:not([data-theme]){${DARK_VARS}}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 -apple-system,"PingFang SC","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC","Hiragino Sans GB","Segoe UI",Roboto,"Helvetica Neue","Lucida Grande",Arial,sans-serif}
h1,h2,h3{font-family:"Source Han Serif SC","Noto Serif CJK SC","Songti SC","STSong","SimSun","Source Han Serif",Georgia,"Times New Roman",serif}
a{color:var(--accent);text-decoration:none}
a:hover{color:var(--gold);text-decoration:underline}
figure{margin:0}
.shell{display:flex;min-height:100vh}
aside.sidebar{width:var(--sidebar-w);flex:0 0 auto;border-right:1px solid var(--line);background:var(--surface);padding:20px 16px;position:sticky;top:0;height:100vh;overflow:auto}
.brand{font-weight:700;font-size:15px;display:flex;align-items:center;gap:8px}
.brand .logo{width:26px;height:26px;border-radius:4px;background:var(--accent);color:var(--btn-ink);display:inline-flex;align-items:center;justify-content:center}
.brand .sub{display:block;font-weight:400;font-size:11px;color:var(--muted);margin-top:2px}
.sidebar-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:20px 8px 6px}
nav.side-nav a{display:block;padding:7px 10px;border-radius:var(--r-sm);color:var(--muted);font-size:13px}
nav.side-nav a:hover{background:var(--bg);color:var(--ink);text-decoration:none}
nav.side-nav a[aria-current="true"]{background:var(--accent-soft);color:var(--accent);font-weight:600}
.sidebar-note{font-size:12px;color:var(--muted);margin-top:20px;padding-top:14px;border-top:1px solid var(--line);line-height:1.7}
.flow{flex:1;min-width:0;display:flex;flex-direction:column}
.topbar{display:flex;align-items:center;gap:14px;padding:12px 28px;border-bottom:1px solid var(--line);background:var(--surface);position:sticky;top:0;z-index:5;flex-wrap:wrap}
.crumbs{font-size:13px;color:var(--muted);margin-right:auto}
.crumbs b{color:var(--ink);font-weight:600}
.badge{display:inline-block;background:var(--accent-soft);color:var(--accent);border-radius:var(--r-sm);padding:2px 10px;font-size:11px;margin-left:6px;vertical-align:1px}
.seg{display:flex;gap:2px;background:var(--bg);border:1px solid var(--line);border-radius:var(--r-sm);padding:3px}
.seg a{padding:3px 12px;border-radius:var(--r-sm);font-size:12px;color:var(--muted)}
.seg a:hover{text-decoration:none;color:var(--ink)}
.seg a[aria-current="true"]{background:var(--surface);color:var(--ink);box-shadow:0 1px 1px var(--shadow);font-weight:600}
.tools{display:flex;align-items:center;gap:6px}
.tool{display:inline-flex;align-items:center;gap:6px;height:33px;padding:0 10px;border:1px solid var(--line);border-radius:var(--r-sm);background:var(--bg);color:var(--muted);font-size:12px}
.tool:hover{color:var(--ink);text-decoration:none;border-color:var(--accent)}
.tool svg{display:block;flex:0 0 auto}
.btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:var(--r-sm);font-size:13px;background:var(--accent);color:var(--btn-ink)}
.btn:hover{text-decoration:none;filter:brightness(1.08)}
main{padding:24px 28px 48px;max-width:1180px;width:100%}
.block{margin-bottom:28px}
.block-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:10px}
.block-head h2{font-size:15px;margin:0}
.block-sub{font-size:12px;color:var(--muted)}
.greet h1{font-size:22px;margin:0 0 4px;letter-spacing:-.01em}
.greet p{margin:0;color:var(--muted);font-size:13px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);box-shadow:0 1px 1px var(--shadow)}
.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.metric{padding:14px 16px}
.metric .v{font-size:24px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.metric .l{font-size:12px;color:var(--muted);margin-top:2px}
.metric .s{font-size:11px;color:var(--muted);margin-top:6px}
.metric.hi{background:var(--accent-soft);border-color:var(--accent-border)}
.chart-grid{display:grid;grid-template-columns:1.7fr 1fr;gap:12px}
.chart-card{padding:14px 16px 12px}
.chart-card h3{font-size:13px;margin:0 0 8px}
.legend{list-style:none;margin:8px 0 0;padding:0;font-size:12px}
.legend li{display:flex;align-items:center;gap:8px;padding:3px 0;color:var(--ink)}
.legend i{width:10px;height:10px;border-radius:2px;flex:0 0 auto}
.legend b{margin-left:auto;font-weight:600;font-variant-numeric:tabular-nums}
.legend em{font-style:normal;color:var(--muted);width:38px;text-align:right}
.legend .dim{color:var(--muted)}
svg .grid{stroke:var(--line)}
svg text{fill:var(--muted);font-size:10px;font-family:inherit}
svg text.donut-v{fill:var(--ink);font-size:22px;font-weight:650}
svg text.donut-l{fill:var(--muted);font-size:11px}
.lower-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.mini{padding:14px 16px;overflow-x:auto}
.mini h3{font-size:13px;margin:0 0 8px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;font-weight:500;color:var(--muted);font-size:12px;padding:6px 8px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:7px 8px;border-bottom:1px solid var(--line);vertical-align:top}
tr:last-child td{border-bottom:0}
td.num,th.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
td.nm{max-width:260px;word-break:break-all}
.bar{height:6px;background:var(--accent-soft);border-radius:var(--r-sm);overflow:hidden;min-width:48px}
.bar>span{display:block;height:100%;background:var(--accent);border-radius:var(--r-sm)}
.code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;background:var(--bg);border:1px solid var(--line);border-radius:var(--r-sm);padding:0 5px;word-break:break-all}
.dim{color:var(--muted);font-size:11px}
.empty{color:var(--muted);font-size:13px;padding:18px 0;text-align:center;margin:0}
.page-foot{color:var(--muted);font-size:12px;border-top:1px solid var(--line);padding-top:14px;max-width:900px;line-height:1.8}
@media (max-width:980px){
 .shell{flex-direction:column}
 aside.sidebar{position:static;width:auto;height:auto;border-right:0;border-bottom:1px solid var(--line)}
 nav.side-nav{display:flex;flex-wrap:wrap;gap:4px}
 nav.side-nav a{background:var(--bg)}
 .sidebar-label{display:none}
 .metric-grid{grid-template-columns:repeat(2,1fr)}
 .chart-grid,.lower-grid{grid-template-columns:1fr}
 .topbar{padding:10px 16px}
 main{padding:16px}
}
@media print{aside.sidebar,.seg,.tools,.btn{display:none}.topbar{position:static}body{background:#fff}}
</style></head><body>
<div class="shell">
<aside class="sidebar">
 <div class="brand"><span class="logo"><svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" focusable="false"><rect x="1.6" y="8.5" width="3.3" height="5.5"/><rect x="6.35" y="4.5" width="3.3" height="9.5"/><rect x="11.1" y="7" width="3.3" height="7"/><rect x="1" y="14.3" width="14" height="1.3" opacity=".55"/></svg></span><div>${esc(L.brand)}<div class="sub">newnju.github.io</div></div></div>
 <div class="sidebar-label">${esc(L.sidebarLabel)}</div>
 <nav class="side-nav" aria-label="${esc(L.navAria)}">
  ${sideNav}
 </nav>
 <div class="sidebar-note">${esc(L.note(retention))}</div>
</aside>
<div class="flow">
 <header class="topbar">
  <div class="crumbs">${esc(L.crumbs)} / <b>${esc(L.lastDays(days))}</b><span class="badge">${esc(L.badge)}</span></div>
  <nav class="seg" aria-label="${esc(L.rangeAria)}">${seg}</nav>
  <div class="tools">${langSwitch}${themeSwitch}</div>
  <a class="btn" href="/stats.csv?days=${days}">${esc(L.exportCsv)}</a>
 </header>
 <main>
  <section class="block" id="overview">
   <div class="greet">
    <h1>${esc(L.greet)}</h1>
    <p>${esc(L.greetLine(range, data.generated_at))}</p>
   </div>
  </section>

  <section class="block" id="metrics">
   <div class="block-head"><h2>${esc(L.h.metrics)}</h2><span class="block-sub">${esc(L.daysSum(days))}</span></div>
   <div class="metric-grid">
    ${metric(L.pvL, fmtNum(t.pv), L.pvS(fmtNum(days ? (t.pv ?? 0) / days : 0), fmtNum(t.human_pv ?? 0)), true)}
    ${metric(L.uvL, fmtNum(t.uv), L.uvS(fmtNum(t.human_uv ?? 0), fmtNum(t.bot_pv ?? 0)), true)}
    ${metric(L.todayPvL, fmtNum(t.today_pv), L.todayPvS(fmtNum(t.today_uv)))}
    ${metric(L.todayUvL, fmtNum(t.today_uv), L.todayUvS)}
    ${metric(L.daysL, fmtNum(t.days), range)}
    ${metric(L.countriesL, fmtNum(reach.countries), L.countriesS(fmtNum(reach.regions)))}
    ${metric(L.citiesL, fmtNum(reach.cities), L.citiesS)}
    ${metric(L.pathsL, fmtNum(reach.paths), L.pathsS)}
   </div>
  </section>

  <section class="block" id="trend">
   <div class="block-head"><h2>${esc(L.h.trend)}</h2><span class="block-sub">${esc(L.trendSub)}</span></div>
   <div class="chart-grid">
    <figure class="card chart-card">
     <h3>${esc(L.chartTrend)}</h3>
      ${trendSvg(daily, L)}
      <ul class="legend"><li><i style="background:var(--accent)"></i>${esc(L.legendPv)}</li><li><i style="background:var(--c3)"></i>${esc(L.legendHuman)}</li><li><i style="background:var(--gold)"></i>${esc(L.legendUv)}</li></ul>
    </figure>
    <figure class="card chart-card">
     <h3>${esc(L.chartDonut)}</h3>
     <div class="mix">${donutSvg(devItems, devTotal, L)}</div>
     <ul class="legend">${devLegend}</ul>
    </figure>
    ${
      (data.bots ?? []).length
        ? `<figure class="card chart-card">
     <h3>${esc(L.botsTitle)}</h3>
     ${listTable(data.bots, (r) => esc(r.k === '—' ? L.otherBot : r.k), L.pvCol)}
    </figure>`
        : ''
    }
   </div>
  </section>

  <section class="block" id="geo">
   <div class="block-head"><h2>${esc(L.h.geo)}</h2><span class="block-sub">${esc(L.geoSub)}</span></div>
   <div class="lower-grid">
    <div class="card mini"><h3>${esc(L.hCountry)}</h3>${listTable((data.countries ?? []).slice(0, 12), (r) => `${esc(L.country(r.k))} <span class="dim">${esc(r.k)}</span>`)}</div>
    <div class="card mini"><h3>${esc(L.hRegion)}</h3>${listTable((data.regions ?? []).slice(0, 12), (r) => esc(r.k))}</div>
    <div class="card mini"><h3>${esc(L.hCity)}</h3>${listTable((data.cities ?? []).slice(0, 12), (r) => esc(r.k))}</div>
   </div>
  </section>

  <section class="block" id="traffic">
   <div class="block-head"><h2>${esc(L.h.traffic)}</h2></div>
   <div class="lower-grid">
    <div class="card mini"><h3>${esc(L.hRef)}</h3>${listTable((data.referrers ?? []).slice(0, 12), (r) => esc(r.k))}</div>
    <div class="card mini"><h3>${esc(L.hBrowser)}</h3>${listTable(data.browsers ?? [], (r) => esc(r.k))}</div>
    <div class="card mini"><h3>${esc(L.hLang)}</h3>${listTable(data.languages ?? [], (r) => esc(r.k))}</div>
   </div>
  </section>

  <section class="block" id="pages">
   <div class="block-head"><h2>${esc(L.h.pages)}</h2><span class="block-sub">${esc(L.pagesSub)}</span></div>
   <div class="card mini">${listTable(data.paths ?? [], (r) => `<span class="code">${esc(r.path)}</span>`, L.pvCol)}</div>
  </section>

  <section class="block" id="detail">
   <div class="block-head"><h2>${esc(L.h.detail)}</h2><span class="block-sub">${esc(L.detailSub)}</span></div>
   <div class="card mini">
   ${
     recent.length
       ? `<table><thead><tr>${detailHead}</tr></thead><tbody>${detailRows}</tbody></table>`
       : `<p class="empty">${L.emptyRange}</p>`
   }
   </div>
  </section>

  <footer class="page-foot">
   ${L.foot}
  </footer>
 </main>
</div>
</div>
</body></html>`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/visit') {
      try {
        return await handleVisit(request, env);
      } catch (err) {
        // 打点失败绝不能影响访客（虽然这是独立域名，但保持这个原则）
        console.log(JSON.stringify({ event: 'visit_failed', error: String(err) }));
        return json({ ok: false }, 500, corsHeaders(env, request));
      }
    }

    if (url.pathname === '/healthz') {
      return json({ ok: true, db: Boolean(env.DB), token: Boolean(env.STATS_TOKEN) });
    }

    if (url.pathname === '/api/summary') {
      if (request.method !== 'GET') {
        return json({ error: 'method not allowed' }, 405, corsHeaders(env, request));
      }
      try {
        const data = await summary(env, url);
        // 免鉴权但只回计数；60 秒缓存让浏览器少打几次 D1（数字晚一分钟无所谓）
        return json(data, 200, { ...corsHeaders(env, request), 'cache-control': 'public, max-age=60' });
      } catch (err) {
        console.log(JSON.stringify({ event: 'summary_failed', error: String(err) }));
        return json({ error: 'unavailable' }, 503, corsHeaders(env, request));
      }
    }

    if (url.pathname === '/login') {
      // 密码流程已下线：旧地址一律回面板
      return redirect('/stats');
    }

    if (url.pathname === '/stats.csv') {
      // 明细导出：与面板一样公开（含 IP 与推断字段）；GET/HEAD 之外一律 405。
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return json({ error: 'method not allowed' }, 405);
      }
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
      try {
        const body = await visitsCsv(env, days);
        return new Response(body, {
          headers: {
            'content-type': 'text/csv; charset=utf-8',
            'content-disposition': `attachment; filename="visits-${days}d.csv"`,
            'cache-control': 'no-store',
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'no-referrer',
          },
        });
      } catch (err) {
        console.log(JSON.stringify({ event: 'csv_failed', error: String(err) }));
        return json({ error: 'unavailable' }, 503);
      }
    }

    if (url.pathname === '/api/stats' || url.pathname === '/stats') {
      const isPanel = url.pathname === '/stats';
      // 面板公开、直接渲染；JSON 口仍只认令牌（Basic/?key= 是给 curl 的旧兼容）
      if (!isPanel && !(await authorised(request, env, url))) {
        return json({ error: 'unauthorized' }, 401);
      }

      // 语言 / 明暗偏好：?lang= / ?theme= 合法值 → 写 cookie 后 302 回干净地址。
      // 用 PRG 而不是原地渲染，是想让地址栏保持干净、刷新不重放参数；
      // 裸 /stats（没人带参数）不下发任何 Set-Cookie，与「零 cookie」口径一致。
      if (isPanel) {
        const setCookies = [];
        const wantLang = url.searchParams.get('lang');
        const wantTheme = url.searchParams.get('theme');
        if (PREF_VALUES.st_lang.includes(wantLang)) setCookies.push(prefCookie('st_lang', wantLang));
        if (PREF_VALUES.st_theme.includes(wantTheme)) setCookies.push(prefCookie('st_theme', wantTheme));
        if (setCookies.length) {
          const u = new URL(url.href);
          u.searchParams.delete('lang');
          u.searchParams.delete('theme');
          const headers = new Headers({ location: u.pathname + u.search, 'cache-control': 'no-store' });
          for (const c of setCookies) headers.append('set-cookie', c);
          return new Response(null, { status: 302, headers });
        }
      }

      const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
      // D1 挂了 / 超时时优雅降级成 503，而不是让 Worker 抛出、
      // 由 Cloudflare 兜一个 1101 的 HTML 错误页（与 summary/csv 口径一致）
      let data;
      try {
        data = await stats(env, days);
      } catch (err) {
        console.log(JSON.stringify({ event: isPanel ? 'panel_failed' : 'stats_failed', error: String(err) }));
        return json({ error: 'unavailable' }, 503, corsHeaders(env, request));
      }
      if (!isPanel) return json(data);

      const prefs = prefsFromCookies(request);
      const lang = prefs.st_lang || 'zh';
      const theme = prefs.st_theme || null; // 没设过就不写 data-theme，交给 @media 跟随系统
      // 图标该显示什么：显式偏好 > 客户端提示（面板发过 Accept-CH）> 按亮色假设。
      // 都不知道时假设亮色，系统暗色的浏览器第一次点可能看不到变化（再点一次就好）。
      const hint = request.headers.get('sec-ch-prefers-color-scheme');
      const iconTheme = theme || (hint === 'dark' ? 'dark' : hint === 'light' ? 'light' : 'light');
      return new Response(
        dashboard(data, {
          retention: Number(env.RETENTION_DAYS) || 180,
          lang,
          theme,
          iconTheme,
          toggleTheme: iconTheme === 'dark' ? 'light' : 'dark',
        }),
        {
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'x-frame-options': 'DENY',
            'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
            'accept-ch': 'sec-ch-prefers-color-scheme',
          },
        },
      );
    }

    return json({ error: 'not found' }, 404);
  },

  // 明细过期就删掉，别让库无限长。UTC 03:17 —— 整点的 cron 在全球都很挤。
  // 删除前先把要删的行按路径 rollup 进 lifetime_path：页脚总访问量与「本文
  // 阅读」是累计口径，不能保留期一到就往回掉。两条语句放进同一个 batch
  // （D1 里就是一个事务）—— 先累计后删，中途断掉也不会把同一批行算两遍。
  async scheduled(event, env, ctx) {
    const days = Number(env.RETENTION_DAYS) || 180;
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
    try {
      const upsert = env.DB.prepare(
        `INSERT INTO lifetime_path (path, pv)
           SELECT path, COUNT(*) FROM visits WHERE ts < ? GROUP BY path
         ON CONFLICT(path) DO UPDATE SET pv = lifetime_path.pv + excluded.pv`,
      ).bind(cutoff);
      const del = env.DB.prepare('DELETE FROM visits WHERE ts < ?').bind(cutoff);
      const results = await env.DB.batch([upsert, del]);
      const changes = results?.[1]?.meta?.changes ?? 0;
      console.log(
        JSON.stringify({
          event: 'retention_purge',
          cutoff_day: dayKey(cutoff),
          rows_deleted: changes,
          retention_days: days,
          cron: event?.cron,
        }),
      );
    } catch (err) {
      // 今晚删不掉明天还有下一次 cron；留一行结构化日志，别让异常裸奔
      console.log(
        JSON.stringify({
          event: 'retention_purge_failed',
          error: String(err),
          retention_days: days,
          cron: event?.cron,
        }),
      );
      throw err; // 照常标红这次调用，CF 面板上能看见
    }
  },
};
