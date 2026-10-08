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
 *   GET  /stats        统计面板（有会话 cookie 或带 Basic/?key= 凭据就直接出；
 *                      否则 302 到 /login —— 不再发 401+WWW-Authenticate，
 *                      那会触发浏览器原生密码框、体验差且每次重新问）
 *   GET  /stats.csv    明细导出 CSV（与面板同一套凭据；含 IP 与地址推断字段）
 *   GET  /login        密码表单（已有有效会话就直接 302 回面板）
 *   POST /login        校验密码 → Set-Cookie(stats_sess) → 302 面板
 *   GET  /healthz      健康检查
 *
 * 会话 cookie：`<过期时间戳>.<HMAC-SHA256(STATS_TOKEN, 时间戳)>` —— 无状态、
 * 可离线校验、带 30 天有效期，服务端不存任何东西；HttpOnly + Secure +
 * SameSite=Strict，只有站长的浏览器拿着它，不参与打点、也不给访客下发。
 *
 * 变量（`npx wrangler secret put`）：
 *   STATS_TOKEN   统计接口与面板的密码，**必填**（没配就只留打点、不给读）
 *   ALLOWED_ORIGIN  允许打点的页面来源，默认 https://newnju.github.io
 *   IP_SALT        IP 哈希的盐；换掉它等于让所有历史去重失效
 *   RETENTION_DAYS  明细保留天数，默认 180
 *
 * ---------------------------------------------------------------------------
 * 隐私与数据口径：这是站长自用的访问日志（等价于自建服务器的 access log）
 * ---------------------------------------------------------------------------
 * · 访客侧不写 cookie、不用 localStorage、不做跨站跟踪、没有第三方脚本
 *   （唯一例外：站长登录面板的 stats_sess 会话 cookie —— HttpOnly、SameSite
 *     =Strict、只在 /login 成功时下发，与打点链路完全无关，访客拿不到）；
 * · **存明文 IP**（`visits.ip`），用于事后回查；同时存
 *   ip_hash = SHA-256(IP + 当天日期 + IP_SALT) 的前 16 位，UV 去重靠它；
 * · 地址是 Cloudflare GeoIP 按 IP **推断**的（continent/country/region/
 *   city/postal/tz/lat/lon/asn/colo），不引入任何第三方 SDK，不是精确位置；
 * · 这些明细只有面板能看（/stats 要密码，/api/summary 对外只回计数）、
 *   超过 RETENTION_DAYS 由定时任务连行删除（删前按路径 rollup 进累计表），
 *   对外页面与公开接口永远不出现 IP 与维度；
 * · referrer 只留域名（完整 URL 里常有搜索词），UA 只粗分成设备/浏览器；
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

/** UA 粗分：只留「桌面/移动/平板/机器人」与浏览器家族，不存原文 */
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
  return { browser, device, bot: device === 'bot' ? 1 : 0 };
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
  const { browser, device, bot } = classify(ua);
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
    'device', 'browser', 'ref_host', 'lang',
  ];
  const values = [
    ts, day, path, host, ip, ipHash,
    cf.continent ?? null, cf.country ?? null, cf.region ?? null,
    cf.regionCode ?? cf.region_code ?? null, cf.city ?? null,
    cf.postalCode ?? cf.postal_code ?? null, cf.timezone ?? null,
    num(cf.latitude), num(cf.longitude), num(cf.asn), cf.colo ?? null,
    device, browser, host_, String(body.l ?? '').slice(0, 16) || null,
  ];

  await env.DB.prepare(
    `INSERT INTO visits (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
  ).bind(...values).run();

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
      ip_hash: ipHash,
    }),
  );

  return json({ ok: true }, 200, corsHeaders(env, request));
}

async function stats(env, days) {
  const q = (sql, ...args) => env.DB.prepare(sql).bind(...args).all();
  const since = Date.now() / 1000 - days * 86400;
  const [totals, today, reach, daily, paths, countries, regions, cities, refs, devices, browsers, langs, recent] =
    await Promise.all([
      q(
        `SELECT COUNT(*) AS pv, COUNT(DISTINCT ip_hash) AS uv, COUNT(DISTINCT day) AS days
           FROM visits WHERE ts >= ?`,
        since,
      ),
      q(
        `SELECT COUNT(*) AS pv, COUNT(DISTINCT ip_hash) AS uv
           FROM visits WHERE day = ?`,
        dayKey(Math.floor(Date.now() / 1000)),
      ),
      // 覆盖面：多少个国家 / 省 / 城市 / 页面
      q(
        `SELECT COUNT(DISTINCT country) AS countries, COUNT(DISTINCT region) AS regions,
                COUNT(DISTINCT city) AS cities, COUNT(DISTINCT path) AS paths
           FROM visits WHERE ts >= ?`,
        since,
      ),
      q(
        `SELECT day, COUNT(*) AS pv, COUNT(DISTINCT ip_hash) AS uv
           FROM visits WHERE ts >= ? GROUP BY day ORDER BY day`,
        since,
      ),
      q(`SELECT path, COUNT(*) AS pv FROM visits WHERE ts >= ? GROUP BY path ORDER BY pv DESC LIMIT 25`, since),
      q(`SELECT COALESCE(country,'—') AS k, COUNT(*) AS n FROM visits WHERE ts >= ? GROUP BY k ORDER BY n DESC LIMIT 20`, since),
      q(`SELECT COALESCE(region,'—') AS k, COUNT(*) AS n FROM visits WHERE ts >= ? GROUP BY k ORDER BY n DESC LIMIT 20`, since),
      q(`SELECT COALESCE(city,'—') AS k, COUNT(*) AS n FROM visits WHERE ts >= ? GROUP BY k ORDER BY n DESC LIMIT 20`, since),
      q(`SELECT COALESCE(ref_host,'直接访问') AS k, COUNT(*) AS n FROM visits WHERE ts >= ? GROUP BY k ORDER BY n DESC LIMIT 15`, since),
      q(`SELECT device AS k, COUNT(*) AS n FROM visits WHERE ts >= ? GROUP BY k ORDER BY n DESC`, since),
      q(`SELECT browser AS k, COUNT(*) AS n FROM visits WHERE ts >= ? GROUP BY k ORDER BY n DESC`, since),
      q(`SELECT COALESCE(NULLIF(lang,''),'—') AS k, COUNT(*) AS n FROM visits WHERE ts >= ? GROUP BY k ORDER BY n DESC LIMIT 10`, since),
      // 访客明细：IP 与地址推断字段都在这里（面板密码后面，不对外）
      q(
        `SELECT ts, day, path, ip, continent, country, region, city, postal, tz, lat, lon, asn, colo,
                device, browser, ref_host, lang
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
    totals: { ...t, today_pv: td.pv ?? 0, today_uv: td.uv ?? 0 },
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
    recent: rows(recent),
  };
}

/** 明细 CSV（/stats.csv）：与面板同一套凭据，180 天保留期内全量可导 */
async function visitsCsv(env, days) {
  const since = Date.now() / 1000 - days * 86400;
  const res = await env.DB.prepare(
    `SELECT ts, day, path, ip, ip_hash, continent, country, region, region_code, city, postal, tz,
            lat, lon, asn, colo, device, browser, ref_host, lang
       FROM visits WHERE ts >= ? ORDER BY ts DESC LIMIT 10000`,
  ).bind(since).all();
  const cols = [
    'ts', 'iso_time', 'day', 'path', 'ip', 'ip_hash', 'continent', 'country', 'region', 'region_code',
    'city', 'postal', 'tz', 'lat', 'lon', 'asn', 'colo', 'device', 'browser', 'ref_host', 'lang',
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

/** 读接口的钥匙：Bearer 头（给脚本）、HTTP Basic 的密码那半（curl -u / 旧收藏夹）或 URL 上的 ?key=（给链接）。
 *  面板的「无凭据 → 302 /login」在路由里另判，这里只管凭据本身对不对 */
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
// 面板会话：无状态签名 cookie（进 /stats 不再弹浏览器原生密码框）
// ---------------------------------------------------------------------------

const SESSION_COOKIE = 'stats_sess';
const SESSION_TTL = 30 * 24 * 3600; // 30 天：够久了，过期重新输一次密码

async function hmacHex(key, msg) {
  const k = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** cookie 值 = "<exp>.<HMAC(STATS_TOKEN, exp)>"：换密码（STATS_TOKEN）即全站会话作废 */
async function sessionCookieValue(env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  return `${exp}.${await hmacHex(env.STATS_TOKEN, String(exp))}`;
}

async function sessionValid(request, env) {
  if (!env.STATS_TOKEN) return false;
  const m = /(?:^|;\s*)stats_sess=([^;\s]+)/.exec(request.headers.get('cookie') || '');
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!/^\d{10,}$/.test(exp || '') || !/^[0-9a-f]{64}$/.test(sig || '')) return false;
  if (Number(exp) < Math.floor(Date.now() / 1000)) return false;
  // 定长十六进制直接全等；这里是拿公开 cookie 验自己的签名，不存在可利用的时序面
  return sig === (await hmacHex(env.STATS_TOKEN, exp));
}

const SESSION_COOKIE_ATTRS = `Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}`;

/** 登录页：自绘表单替代 401 弹框。无脚本、无外链，CSP 收到只剩内联样式与本域提交 */
function loginPage(error = '') {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>访客统计 · 登录</title>
<style>
 body{font:14px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;margin:0;padding:24px;background:#fbf8f1;color:#1d2321}
 h1{font-size:20px;margin:0 0 4px} .note{color:#6b6558;font-size:12px;max-width:640px}
 .err{color:#a4262c;font-size:13px}
 form{margin-top:20px;display:flex;gap:10px;flex-wrap:wrap;align-items:center}
 input{font:14px system-ui;padding:8px 12px;border:1px solid #e6e0d4;border-radius:8px;background:#fff;min-width:220px}
 button{font:14px system-ui;padding:8px 18px;border:0;border-radius:8px;background:#5c2e83;color:#fff;cursor:pointer}
</style></head><body>
<h1>访客统计</h1>
${error ? `<p class="err">${esc(error)}</p>` : `<p class="note">输入密码进入统计面板，30 天内免登录。</p>`}
<form method="post" action="/login">
 <input type="password" name="key" placeholder="密码" autocomplete="current-password" autofocus required>
 <button type="submit">进入</button>
</form>
</body></html>`;
}

const LOGIN_HEADERS = {
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'",
};

const html = (body, status = 200, headers = {}) =>
  new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...LOGIN_HEADERS, ...headers } });

const redirect = (location) =>
  new Response(null, { status: 302, headers: { location, 'cache-control': 'no-store' } });

async function handleLogin(request, env) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    if (await sessionValid(request, env)) return redirect('/stats');
    return html(loginPage(), 200);
  }
  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405, LOGIN_HEADERS);
  }

  let key = '';
  try {
    key = String(((await request.formData()).get('key')) ?? '');
  } catch {
    return html(loginPage('请求格式不对，请用页面上的表单。'), 400);
  }
  // 没配 STATS_TOKEN 等于读接口整体关闭，登录自然也过不去（绝不放空密码）
  if (env.STATS_TOKEN && key === env.STATS_TOKEN) {
    return new Response(null, {
      status: 302,
      headers: {
        location: '/stats',
        'cache-control': 'no-store',
        'set-cookie': `${SESSION_COOKIE}=${await sessionCookieValue(env)}; ${SESSION_COOKIE_ATTRS}`,
      },
    });
  }
  return html(loginPage('密码不对，再试一次。'), 200);
}

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
const countryName = (c) => COUNTRY_CN[c] || c || '—';
const DEVICE_CN = { desktop: '桌面', mobile: '手机', tablet: '平板', bot: '机器人', other: '其他' };
const DEV_COLORS = { desktop: '#1f4d46', mobile: '#c98a2b', tablet: '#5b7fa6', bot: '#9a6b9b', other: '#8a8f96' };
const PALETTE = ['#1f4d46', '#c98a2b', '#5b7fa6', '#9a6b9b', '#8a8f96', '#4f8f7d'];

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

function trendSvg(daily) {
  const W = 720, H = 220, PL = 40, PR = 12, PT = 14, PB = 26;
  if (!daily.length) return '<p class="empty">这个区间还没有记录</p>';
  const maxY = niceMax(Math.max(...daily.map((d) => Math.max(d.pv, d.uv)), 1));
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
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="220" role="img" aria-label="每日 PV 与 UV 趋势">
${grid}
<path d="${line('pv')}L${X(daily.length - 1).toFixed(1)},${base}L${X(0).toFixed(1)},${base}Z" fill="rgba(31,77,70,.10)"/>
<path d="${line('pv')}" fill="none" stroke="#1f4d46" stroke-width="2"/>
<path d="${line('uv')}" fill="none" stroke="#c98a2b" stroke-width="1.6" stroke-dasharray="5 4"/>
${dot}${xt}
</svg>`;
}

function donutSvg(items, total) {
  if (!total) return '<p class="empty">暂无设备数据</p>';
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
  return `<svg viewBox="0 0 150 150" width="150" height="150" role="img" aria-label="设备构成环形图">
<g transform="rotate(-90 75 75)">${segs}</g>
<text x="75" y="72" text-anchor="middle" class="donut-v">${fmtNum(total)}</text>
<text x="75" y="88" text-anchor="middle" class="donut-l">浏览量</text>
</svg>`;
}

function dashboard(data, retention = 180) {
  const t = data.totals ?? {};
  const reach = data.reach ?? {};
  const daily = data.daily ?? [];
  const days = data.days ?? 30;
  const range = daily.length ? `${daily[0].day} ~ ${daily[daily.length - 1].day}` : `近 ${days} 天（无记录）`;

  const metric = (label, value, sub, hi = false) => `
    <div class="card metric${hi ? ' hi' : ''}">
      <div class="v">${esc(value)}</div>
      <div class="l">${esc(label)}</div>
      ${sub ? `<div class="s">${esc(sub)}</div>` : ''}
    </div>`;

  const listTable = (rows, fmt, countHead = '次数') => {
    if (!rows?.length) return '<p class="empty">暂无数据</p>';
    const max = Math.max(...rows.map((r) => r.n ?? 0), 1);
    return `<table><thead><tr><th>名称</th><th aria-hidden="true"></th><th class="num">${esc(countHead)}</th></tr></thead><tbody>${rows
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
          (it) => `<li><i style="background:${it.color}"></i>${esc(DEVICE_CN[it.k] || it.k)}<b>${fmtNum(it.n)}</b><em>${devTotal ? Math.round((it.n / devTotal) * 100) : 0}%</em></li>`,
        )
        .join('')
    : '<li class="dim">暂无数据</li>';

  const geoCell = (r) => [countryName(r.country), r.region, r.city].filter(Boolean).join(' / ');
  const recent = data.recent ?? [];
  const detailRows = recent
    .map(
      (r) => `<tr>
<td class="num">${fmtTime(r.ts)}</td>
<td><span class="code">${esc(r.path)}</span></td>
<td><span class="code">${esc(r.ip || '—')}</span></td>
<td>${esc(geoCell(r))}</td>
<td class="num">${r.asn ? `AS${r.asn}` : '—'}${r.colo ? ` · ${esc(r.colo)}` : ''}</td>
<td>${esc(DEVICE_CN[r.device] || r.device || '—')} · ${esc(r.browser || '—')}</td>
<td>${esc(r.ref_host || '直接访问')}</td>
<td>${esc(r.lang || '—')}</td>
</tr>`,
    )
    .join('');

  const seg = [7, 30, 90, 365]
    .map((n) => `<a href="?days=${n}"${n === days ? ' aria-current="true"' : ''}>近 ${n} 天</a>`)
    .join('');

  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>访客统计 · 仪表盘</title>
<style>
:root{--bg:#f5f5f3;--surface:#fffefc;--ink:#1b1d22;--muted:#6f7378;--line:#e3e2dd;--accent:#1f4d46;--accent-soft:#e7eeeb;--r-sm:6px;--r-md:8px;--sidebar-w:250px}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
figure{margin:0}
.shell{display:flex;min-height:100vh}
aside.sidebar{width:var(--sidebar-w);flex:0 0 auto;border-right:1px solid var(--line);background:var(--surface);padding:20px 16px;position:sticky;top:0;height:100vh;overflow:auto}
.brand{font-weight:700;font-size:15px;display:flex;align-items:center;gap:8px}
.brand .logo{width:26px;height:26px;border-radius:50%;background:var(--accent);color:#fff;display:inline-flex;align-items:center;justify-content:center;font-size:13px}
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
.badge{display:inline-block;background:var(--accent-soft);color:var(--accent);border-radius:999px;padding:2px 10px;font-size:11px;margin-left:6px;vertical-align:1px}
.seg{display:flex;gap:2px;background:var(--bg);border:1px solid var(--line);border-radius:999px;padding:3px}
.seg a{padding:3px 12px;border-radius:999px;font-size:12px;color:var(--muted)}
.seg a:hover{text-decoration:none}
.seg a[aria-current="true"]{background:var(--surface);color:var(--ink);box-shadow:0 1px 2px rgba(27,29,34,.10);font-weight:600}
.btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:999px;font-size:13px;background:var(--accent);color:#fff}
.btn:hover{text-decoration:none;filter:brightness(1.08)}
main{padding:24px 28px 48px;max-width:1180px;width:100%}
.block{margin-bottom:28px}
.block-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:10px}
.block-head h2{font-size:15px;margin:0}
.block-sub{font-size:12px;color:var(--muted)}
.greet h1{font-size:22px;margin:0 0 4px;letter-spacing:-.01em}
.greet p{margin:0;color:var(--muted);font-size:13px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);box-shadow:0 1px 2px rgba(27,29,34,.04)}
.metric-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.metric{padding:14px 16px}
.metric .v{font-size:24px;font-weight:650;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.metric .l{font-size:12px;color:var(--muted);margin-top:2px}
.metric .s{font-size:11px;color:var(--muted);margin-top:6px}
.metric.hi{background:var(--accent-soft);border-color:#d5e3dd}
.chart-grid{display:grid;grid-template-columns:1.7fr 1fr;gap:12px}
.chart-card{padding:14px 16px 12px}
.chart-card h3{font-size:13px;margin:0 0 8px}
.legend{list-style:none;margin:8px 0 0;padding:0;font-size:12px}
.legend li{display:flex;align-items:center;gap:8px;padding:3px 0;color:var(--ink)}
.legend i{width:10px;height:10px;border-radius:3px;flex:0 0 auto}
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
.bar{height:6px;background:var(--accent-soft);border-radius:99px;overflow:hidden;min-width:48px}
.bar>span{display:block;height:100%;background:var(--accent);border-radius:99px}
.code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;background:var(--bg);border:1px solid var(--line);border-radius:4px;padding:0 5px;word-break:break-all}
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
@media print{aside.sidebar,.seg,.btn{display:none}.topbar{position:static}body{background:#fff}}
</style></head><body>
<div class="shell">
<aside class="sidebar">
 <div class="brand"><span class="logo">◎</span><div>访客统计<div class="sub">newnju.github.io</div></div></div>
 <div class="sidebar-label">分析</div>
 <nav class="side-nav" aria-label="面板导航">
  <a href="#overview" aria-current="true">概览</a>
  <a href="#metrics">关键指标</a>
  <a href="#trend">趋势与构成</a>
  <a href="#geo">地域分布</a>
  <a href="#traffic">来源与设备</a>
  <a href="#pages">页面排行</a>
  <a href="#detail">访客明细</a>
 </nav>
 <div class="sidebar-note">地址来自 Cloudflare GeoIP 按 IP 推断，不是精确定位；独立访客按「当天 IP 哈希」去重，跨天不合并。明细保留 ${retention} 天，之后连行删除。</div>
</aside>
<div class="flow">
 <header class="topbar">
  <div class="crumbs">统计 / <b>近 ${days} 天</b><span class="badge">GeoIP 推断</span></div>
  <nav class="seg" aria-label="时间范围">${seg}</nav>
  <a class="btn" href="/stats.csv?days=${days}">↓ 导出 CSV</a>
 </header>
 <main>
  <section class="block" id="overview">
   <div class="greet">
    <h1>你好，访客统计</h1>
    <p>${esc(range)} · 生成于 ${esc(data.generated_at)} · 时区 UTC</p>
   </div>
  </section>

  <section class="block" id="metrics">
   <div class="block-head"><h2>关键指标</h2><span class="block-sub">近 ${days} 天累计</span></div>
   <div class="metric-grid">
    ${metric('浏览量 PV', fmtNum(t.pv), `日均 ${fmtNum(days ? (t.pv ?? 0) / days : 0)}`, true)}
    ${metric('独立访客 UV', fmtNum(t.uv), '按当天 IP 哈希去重', true)}
    ${metric('今日 PV', fmtNum(t.today_pv), `今日 UV ${fmtNum(t.today_uv)}`)}
    ${metric('今日 UV', fmtNum(t.today_uv), '今天到目前为止')}
    ${metric('有记录的天数', fmtNum(t.days), range)}
    ${metric('国家 / 地区', fmtNum(reach.countries), `省 / 州 ${fmtNum(reach.regions)}`)}
    ${metric('城市', fmtNum(reach.cities), 'GeoIP 推断值')}
    ${metric('覆盖页面', fmtNum(reach.paths), '有记录的站内路径')}
   </div>
  </section>

  <section class="block" id="trend">
   <div class="block-head"><h2>趋势与构成</h2><span class="block-sub">按天聚合 · UTC</span></div>
   <div class="chart-grid">
    <figure class="card chart-card">
     <h3>PV / UV 趋势</h3>
     ${trendSvg(daily)}
     <ul class="legend"><li><i style="background:#1f4d46"></i>浏览量 PV</li><li><i style="background:#c98a2b"></i>独立访客 UV（虚线）</li></ul>
    </figure>
    <figure class="card chart-card">
     <h3>设备构成</h3>
     <div class="mix">${donutSvg(devItems, devTotal)}</div>
     <ul class="legend">${devLegend}</ul>
    </figure>
   </div>
  </section>

  <section class="block" id="geo">
   <div class="block-head"><h2>地域分布</h2><span class="block-sub">国家 / 省 / 城市（GeoIP 推断）</span></div>
   <div class="lower-grid">
    <div class="card mini"><h3>国家 / 地区</h3>${listTable((data.countries ?? []).slice(0, 12), (r) => `${esc(countryName(r.k))} <span class="dim">${esc(r.k)}</span>`)}</div>
    <div class="card mini"><h3>省 / 州</h3>${listTable((data.regions ?? []).slice(0, 12), (r) => esc(r.k))}</div>
    <div class="card mini"><h3>城市</h3>${listTable((data.cities ?? []).slice(0, 12), (r) => esc(r.k))}</div>
   </div>
  </section>

  <section class="block" id="traffic">
   <div class="block-head"><h2>来源与设备</h2></div>
   <div class="lower-grid">
    <div class="card mini"><h3>来源域名</h3>${listTable((data.referrers ?? []).slice(0, 12), (r) => esc(r.k))}</div>
    <div class="card mini"><h3>浏览器</h3>${listTable(data.browsers ?? [], (r) => esc(r.k))}</div>
    <div class="card mini"><h3>界面语言</h3>${listTable(data.languages ?? [], (r) => esc(r.k))}</div>
   </div>
  </section>

  <section class="block" id="pages">
   <div class="block-head"><h2>页面排行</h2><span class="block-sub">PV 前 25</span></div>
   <div class="card mini">${listTable(data.paths ?? [], (r) => `<span class="code">${esc(r.path)}</span>`, 'PV')}</div>
  </section>

  <section class="block" id="detail">
   <div class="block-head"><h2>访客明细</h2><span class="block-sub">最近 50 条 · 含明文 IP，仅本面板可见</span></div>
   <div class="card mini">
   ${
     recent.length
       ? `<table><thead><tr><th>时间 (UTC)</th><th>页面</th><th>IP</th><th>位置（推断）</th><th class="num">网络</th><th>设备 · 浏览器</th><th>来源</th><th>语言</th></tr></thead><tbody>${detailRows}</tbody></table>`
       : '<p class="empty">这个区间还没有记录</p>'
   }
   </div>
  </section>

  <footer class="page-foot">
   口径：PV 为请求数；UV 按「当天 IP + 日期 + 盐」的哈希去重，跨天不合并、无法串起来追踪个人。位置、邮编、时区、ASN、接入机房均来自 Cloudflare GeoIP 按 IP <b>推断</b>，不是精确定位。明细超过保留期由定时任务连行删除（删除前按路径计入累计口径），对外页面与免鉴权接口只暴露合计数，永不出现 IP 与维度。导出 CSV 同样需要面板凭据。
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
      return await handleLogin(request, env);
    }

    if (url.pathname === '/stats.csv') {
      // 明细导出：与面板完全同一套凭据门（会话 cookie / Basic / ?key=），
      // 全都没有就 302 去登录页；GET/HEAD 之外一律 405。
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return json({ error: 'method not allowed' }, 405);
      }
      if (!(await authorised(request, env, url)) && !(await sessionValid(request, env))) {
        return redirect('/login');
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
      // 面板认三种凭据：会话 cookie（/login 发的）/ HTTP Basic / ?key=。
      // 全都没有时**不再**回 401+WWW-Authenticate（浏览器会弹原生密码框、
      // 每次都问），改 302 去自绘登录页；curl 带 Basic 或 ?key= 的照旧直通。
      if (!(await authorised(request, env, url)) && !(isPanel && (await sessionValid(request, env)))) {
        if (!isPanel) return json({ error: 'unauthorized' }, 401); // JSON 口永远只认 Bearer
        return redirect('/login');
      }
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
      const data = await stats(env, days);
      if (url.pathname === '/api/stats') return json(data);
      return new Response(dashboard(data, Number(env.RETENTION_DAYS) || 180), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
          'x-frame-options': 'DENY',
          'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
        },
      });
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
  },
};
