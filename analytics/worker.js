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
 *   GET  /stats        统计面板（HTTP Basic，浏览器自己弹密码框）
 *   GET  /healthz      健康检查
 *
 * 变量（`npx wrangler secret put`）：
 *   STATS_TOKEN   统计接口与面板的密码，**必填**（没配就只留打点、不给读）
 *   ALLOWED_ORIGIN  允许打点的页面来源，默认 https://newnju.github.io
 *   IP_SALT        IP 哈希的盐；换掉它等于让所有历史去重失效
 *   RETENTION_DAYS  明细保留天数，默认 180
 *   STORE_RAW_IP   设成 "1" 才额外存明文 IP（默认不存，见下）
 *
 * ---------------------------------------------------------------------------
 * 隐私：这里存的是访客数据，默认按「能不存就不存」设计
 * ---------------------------------------------------------------------------
 * · 不写任何 cookie，不用 localStorage，不做跨站跟踪，没有第三方脚本；
 * · **不存明文 IP**，只存 ip_hash = SHA-256(IP + 当天日期 + IP_SALT) 的前 16 位。
 *   每日掺入日期 ⇒ 同一访客跨天无法被串起来，仍能当天算去重人数；
 * · 地理位置用 Cloudflare 自带的 GeoIP，不引入任何第三方定位 SDK；
 * · referrer 只留域名（完整 URL 里常有搜索词），UA 只粗分成设备/浏览器；
 * · 前端尊重 Do Not Track 与 Global Privacy Control：命中就直接不上报；
 * · 明细超过 RETENTION_DAYS 由定时任务删除，聚合口径（PV/UV）在查询时现算。
 *
 * 想要「按 IP 查访客」这类原始日志时才把 STORE_RAW_IP 设成 1 —— 那就等于自建
 * 了个人数据处理者，PIPL/GDPR 下要另行告知并保留访问与删除通道。
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

  const columns = [
    'ts', 'day', 'path', 'host', 'country', 'region', 'city', 'asn', 'lat', 'lon',
    'device', 'browser', 'ref_host', 'lang', 'ip_hash',
  ];
  const values = [
    ts, day, path, host,
    cf.country ?? null, cf.region ?? null, cf.city ?? null, cf.asn ?? null,
    typeof cf.latitude === 'number' ? cf.latitude : null,
    typeof cf.longitude === 'number' ? cf.longitude : null,
    device, browser, host_, String(body.l ?? '').slice(0, 16) || null, ipHash,
  ];
  if (env.STORE_RAW_IP === '1') {
    columns.push('raw_ip');
    values.push(ip);
  }

  await env.DB.prepare(
    `INSERT INTO visits (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
  ).bind(...values).run();

  console.log(
    JSON.stringify({
      event: 'visit',
      path,
      day,
      country: cf.country ?? null,
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
  const [totals, daily, paths, countries, cities, refs, devices, langs] = await Promise.all([
    q(
      `SELECT COUNT(*) AS pv, COUNT(DISTINCT ip_hash) AS uv, COUNT(DISTINCT day) AS days
         FROM visits WHERE ts >= ?`,
      Date.now() / 1000 - days * 86400,
    ),
    q(
      `SELECT day, COUNT(*) AS pv, COUNT(DISTINCT ip_hash) AS uv
         FROM visits WHERE ts >= ? GROUP BY day ORDER BY day`,
      Date.now() / 1000 - days * 86400,
    ),
    q(`SELECT path, COUNT(*) AS pv FROM visits WHERE ts >= ? GROUP BY path ORDER BY pv DESC LIMIT 25`,
      Date.now() / 1000 - days * 86400),
    q(`SELECT COALESCE(country,'—') AS k, COUNT(*) AS n FROM visits WHERE ts >= ? GROUP BY k ORDER BY n DESC LIMIT 20`,
      Date.now() / 1000 - days * 86400),
    q(`SELECT COALESCE(city,'—') AS k, COUNT(*) AS n FROM visits WHERE ts >= ? GROUP BY k ORDER BY n DESC LIMIT 20`,
      Date.now() / 1000 - days * 86400),
    q(`SELECT COALESCE(ref_host,'直接访问') AS k, COUNT(*) AS n FROM visits WHERE ts >= ? GROUP BY k ORDER BY n DESC LIMIT 15`,
      Date.now() / 1000 - days * 86400),
    q(`SELECT device AS k, COUNT(*) AS n FROM visits WHERE ts >= ? GROUP BY k ORDER BY n DESC`,
      Date.now() / 1000 - days * 86400),
    q(`SELECT COALESCE(NULLIF(lang,''),'—') AS k, COUNT(*) AS n FROM visits WHERE ts >= ? GROUP BY k ORDER BY n DESC LIMIT 10`,
      Date.now() / 1000 - days * 86400),
  ]);

  const rows = (r) => r.results ?? [];
  return {
    days,
    generated_at: new Date().toISOString(),
    totals: rows(totals)[0] ?? { pv: 0, uv: 0, days: 0 },
    daily: rows(daily),
    paths: rows(paths),
    countries: rows(countries),
    cities: rows(cities),
    referrers: rows(refs),
    devices: rows(devices),
    languages: rows(langs),
  };
}

/** 读接口的钥匙：Bearer 头（给脚本）、HTTP Basic 的密码那半（浏览器弹框）或 URL 上的 ?key=（给链接） */
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

const esc = (s) =>
  String(s ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function dashboard(data) {
  const table = (title, rows, keyHead = '名称', countHead = '次数') => `
    <h2>${esc(title)}</h2>
    <table><thead><tr><th>${esc(keyHead)}</th><th>${esc(countHead)}</th></tr></thead><tbody>
    ${rows.length ? rows.map((r) => `<tr><td>${esc(r.k ?? r.path ?? r.day)}</td><td>${esc(r.n ?? r.pv ?? r.uv ?? '')}</td></tr>`).join('') : '<tr><td colspan="2">没有数据</td></tr>'}
    </tbody></table>`;

  const t = data.totals ?? {};
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>访客统计</title>
<style>
 body{font:14px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;margin:0;padding:24px;background:#fbf8f1;color:#1d2321}
 h1{font-size:20px;margin:0 0 4px} h2{font-size:15px;margin:28px 0 8px;color:#5c2e83}
 .cards{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}
 .card{background:#fff;border:1px solid #e6e0d4;border-radius:8px;padding:12px 18px;min-width:110px}
 .card b{display:block;font-size:22px} .card span{color:#6b6558;font-size:12px}
 table{border-collapse:collapse;width:100%;max-width:640px;background:#fff}
 th,td{border:1px solid #e6e0d4;padding:5px 10px;text-align:left;font-size:13px}
 th{background:#f2ece1} td:last-child{text-align:right;font-variant-numeric:tabular-nums}
 .note{color:#6b6558;font-size:12px;max-width:640px}
</style></head><body>
<h1>访客统计</h1>
<p class="note">最近 ${esc(data.days)} 天 · 生成于 ${esc(data.generated_at)} · 明细里不存明文 IP，
人数按「当天 IP 哈希去重」算，同一个人两天之间不会被合并（也就没法跨天追踪）。</p>
<div class="cards">
 <div class="card"><b>${esc(t.pv ?? 0)}</b><span>浏览量 PV</span></div>
 <div class="card"><b>${esc(t.uv ?? 0)}</b><span>独立访客 UV</span></div>
 <div class="card"><b>${esc(t.days ?? 0)}</b><span>有记录的天数</span></div>
</div>
${table('按天', (data.daily ?? []).map((r) => ({ k: `${r.day}　PV ${r.pv} / UV ${r.uv}` })), '日期', '')}
${table('页面（PV 前 25）', data.paths ?? [], '路径')}
${table('国家 / 地区', data.countries ?? [])}
${table('城市', data.cities ?? [])}
${table('来源', data.referrers ?? [])}
${table('设备', data.devices ?? [])}
${table('界面语言', data.languages ?? [])}
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

    if (url.pathname === '/api/stats' || url.pathname === '/stats') {
      if (!authorised(request, env, url)) {
        if (url.pathname === '/api/stats') {
          return json({ error: 'unauthorized' }, 401);
        }
        return new Response('需要密码', {
          status: 401,
          headers: { 'www-authenticate': 'Basic realm="stats", charset="UTF-8"', 'cache-control': 'no-store' },
        });
      }
      const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
      const data = await stats(env, days);
      if (url.pathname === '/api/stats') return json(data);
      return new Response(dashboard(data), {
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
  async scheduled(event, env, ctx) {
    const days = Number(env.RETENTION_DAYS) || 180;
    const cutoff = Math.floor(Date.now() / 1000) - days * 86400;
    const { meta } = await env.DB.prepare('DELETE FROM visits WHERE ts < ?').bind(cutoff).run();
    console.log(
      JSON.stringify({
        event: 'retention_purge',
        cutoff_day: dayKey(cutoff),
        rows_deleted: meta?.changes ?? 0,
        retention_days: days,
        cron: event?.cron,
      }),
    );
  },
};
