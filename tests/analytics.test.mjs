// analytics Worker 的行为测试：D1 用一个假 binding 顶掉（记录 SQL 与绑定值），
// 这样能断言「到底往库里写了什么」，又不需要真数据库。
//
//   node --test tests/analytics.test.mjs
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../analytics/worker.js';

const ORIGIN = 'https://stats.example.test';
const ENV = {
  STATS_TOKEN: 'let-me-in',
  ALLOWED_ORIGIN: 'https://newnju.github.io',
  IP_SALT: 'test-salt',
};

/** 假 D1：记住每次 prepare 的 SQL 与绑定值，按查询关键字返回预设结果 */
function fakeDb(overrides = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, args: [] };
      calls.push(call);
      return {
        bind(...args) {
          call.args = args;
          return this;
        },
        async run() {
          return { meta: { changes: 3 } };
        },
        async all() {
          return { results: overrides[sql.trim().slice(0, 24)] ?? [] };
        },
      };
    },
    // scheduled() 用 batch 把「rollup 进 lifetime_path + 删除」放进一个事务。
    // 这里照单执行每条语句；prepare 的调用记录仍按顺序留在 calls 里，
    // 测试照旧按 SQL 文本断言先后与参数。
    async batch(statements) {
      return Promise.all(statements.map((s) => s.run()));
    },
  };
}

const visit = (body, headers = {}) =>
  new Request(`${ORIGIN}/api/visit`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });

let realLog;
before(() => {
  realLog = console.log;
  console.log = () => {};
});
after(() => {
  console.log = realLog;
});

test('打点写入一行：时间、路径、GeoIP 扩展字段与明文 IP 都在', async () => {
  const DB = fakeDb();
  const request = new Request(`${ORIGIN}/api/visit`, {
    method: 'POST',
    body: JSON.stringify({ p: '/publications/', l: 'zh-CN' }),
    headers: {
      'content-type': 'application/json',
      'cf-connecting-ip': '198.51.100.23',
      host: 'stats.example.test',
      'user-agent': 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
      'accept-language': 'zh-CN',
      origin: 'https://newnju.github.io',
    },
  });
  request.cf = {
    continent: 'AS', country: 'CN', region: 'Jiangsu', regionCode: 'JS',
    city: 'Nanjing', postalCode: '210008', timezone: 'Asia/Shanghai',
    asn: 4134, latitude: 32.06, longitude: 118.79, colo: 'NRT',
  };

  const res = await worker.fetch(request, { ...ENV, DB });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://newnju.github.io');
  assert.equal(res.headers.get('cache-control'), 'no-store');

  assert.equal(DB.calls.length, 1);
  const { sql, args } = DB.calls[0];
  assert.match(sql, /^INSERT INTO visits/);
  const cols = sql.slice(sql.indexOf('(') + 1, sql.indexOf(')')).split(',').map((s) => s.trim());
  const row = Object.fromEntries(cols.map((c, i) => [c, args[i]]));

  assert.equal(row.path, '/publications/');
  assert.equal(row.country, 'CN');
  assert.equal(row.city, 'Nanjing');
  assert.equal(row.region, 'Jiangsu');
  assert.equal(row.asn, 4134);
  assert.equal(row.lat, 32.06);
  assert.equal(row.lon, 118.79);
  assert.equal(row.device, 'desktop');
  assert.equal(row.browser, 'chrome');
  assert.equal(row.lang, 'zh-CN');
  assert.match(row.day, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(Math.abs(Date.now() / 1000 - row.ts) < 60, 'ts 应该是当前 unix 秒');

  // 明文 IP + GeoIP 推断的扩展字段（面板明细用，对外接口永远不出）
  assert.equal(row.ip, '198.51.100.23');
  assert.equal(row.continent, 'AS');
  assert.equal(row.region_code, 'JS');
  assert.equal(row.postal, '210008');
  assert.equal(row.tz, 'Asia/Shanghai');
  assert.equal(row.colo, 'NRT');
  assert.ok(!('raw_ip' in row), '旧的 STORE_RAW_IP 开关列已废弃');
  assert.match(row.ip_hash, /^[0-9a-f]{16}$/, 'UV 去重仍走每日盐哈希');
});

test('同一个 IP、同一天 → 同一个哈希（所以能算去重人数）', async () => {
  const once = async () => {
    const DB = fakeDb();
    const req = new Request(`${ORIGIN}/api/visit`, {
      method: 'POST',
      body: '{}',
      headers: { 'cf-connecting-ip': '203.0.113.7' },
    });
    await worker.fetch(req, { ...ENV, DB });
    const { sql, args } = DB.calls[0];
    const cols = sql.slice(sql.indexOf('(') + 1, sql.indexOf(')')).split(',').map((s) => s.trim());
    return Object.fromEntries(cols.map((c, i) => [c, args[i]])).ip_hash;
  };
  assert.equal(await once(), await once());
});

test('哈希里掺了当天日期：换一天就换哈希，跨天无法关联同一个人', async () => {
  // 直接验证构造方式（而不是跑两天）—— ip_hash 的输入就是 ip|day|salt
  const day = (ts) => new Date(ts * 1000).toISOString().slice(0, 10);
  const sha16 = async (input) => {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  };
  const salt = 'test-salt';
  const a = await sha16(`198.51.100.23|${day(1758000000)}|${salt}`);
  const b = await sha16(`198.51.100.23|${day(1758000000 + 86400)}|${salt}`);
  assert.notEqual(a, b);
});

test('明文 IP 始终存进 ip 列（STORE_RAW_IP 开关已删除，带旧变量也无副作用）', async () => {
  const DB = fakeDb();
  const req = new Request(`${ORIGIN}/api/visit`, {
    method: 'POST',
    body: '{}',
    headers: { 'cf-connecting-ip': '198.51.100.23' },
  });
  await worker.fetch(req, { ...ENV, DB, STORE_RAW_IP: '1' });
  const { sql, args } = DB.calls[0];
  assert.ok(!/raw_ip/.test(sql), '不再写 raw_ip 开关列');
  assert.ok(args.includes('198.51.100.23'), 'ip 列直接存明文');
});

test('路径里的查询串被丢掉（搜索词不该落库）', async () => {
  const DB = fakeDb();
  const req = new Request(`${ORIGIN}/api/visit`, {
    method: 'POST',
    body: JSON.stringify({ p: '/publications/?q=%E7%A9%BA%E9%97%B4%E6%A0%BC' }),
    headers: { 'cf-connecting-ip': '198.51.100.23' },
  });
  await worker.fetch(req, { ...ENV, DB });
  const { sql, args } = DB.calls[0];
  const cols = sql.slice(sql.indexOf('(') + 1, sql.indexOf(')')).split(',').map((s) => s.trim());
  const row = Object.fromEntries(cols.map((c, i) => [c, args[i]]));
  assert.equal(row.path, '/publications/');
  assert.ok(!JSON.stringify(row).includes('q='));
});

test('DNT: 1 的请求直接跳过，不写库', async () => {
  const DB = fakeDb();
  const res = await worker.fetch(visit({}, { dnt: '1', 'cf-connecting-ip': '198.51.100.23' }), { ...ENV, DB });
  assert.equal(res.status, 200);
  assert.equal(DB.calls.length, 0);
});

test('没有 D1 绑定时返回 500 而不是崩掉', async () => {
  const res = await worker.fetch(visit({}, { 'cf-connecting-ip': '198.51.100.23' }), ENV);
  assert.equal(res.status, 500);
});

test('referrer 只留域名，不留完整 URL', async () => {
  const DB = fakeDb();
  const req = new Request(`${ORIGIN}/api/visit`, {
    method: 'POST',
    body: JSON.stringify({ p: '/', r: 'https://www.google.com/search?q=%E5%8D%9A%E5%AE%A2%E5%B1%80' }),
    headers: { 'cf-connecting-ip': '198.51.100.23' },
  });
  await worker.fetch(req, { ...ENV, DB });
  const { sql, args } = DB.calls[0];
  const cols = sql.slice(sql.indexOf('(') + 1, sql.indexOf(')')).split(',').map((s) => s.trim());
  const row = Object.fromEntries(cols.map((c, i) => [c, args[i]]));
  assert.equal(row.ref_host, 'www.google.com');
});

test('统计接口必须要 Bearer 令牌', async () => {
  const DB = fakeDb();
  const anon = await worker.fetch(new Request(`${ORIGIN}/api/stats`), { ...ENV, DB });
  assert.equal(anon.status, 401);

  const wrong = await worker.fetch(new Request(`${ORIGIN}/api/stats`, {
    headers: { authorization: 'Bearer nope' },
  }), { ...ENV, DB });
  assert.equal(wrong.status, 401);
});

test('没配 STATS_TOKEN 就等于把读接口彻底关掉', async () => {
  const DB = fakeDb();
  const res = await worker.fetch(new Request(`${ORIGIN}/api/stats`, {
    headers: { authorization: 'Bearer anything' },
  }), { ...ENV, DB, STATS_TOKEN: '' });
  assert.equal(res.status, 401);
});

test('面板公开：免凭据直接 200（不发 302/401，也不下发 cookie），仍 noindex、零脚本', async () => {
  const res = await worker.fetch(new Request(`${ORIGIN}/stats`), { ...ENV, DB: fakeDb() });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(res.headers.get('www-authenticate'), null);
  const body = await res.text();
  assert.match(body, /noindex/);
  assert.ok(!body.includes('<script'), 'CSP default-src none：面板不带任何脚本');

  // 密码只管 /api/stats 的 JSON 口：令牌没配，面板照开
  const noToken = await worker.fetch(new Request(`${ORIGIN}/stats`), { ...ENV, DB: fakeDb(), STATS_TOKEN: '' });
  assert.equal(noToken.status, 200);
});

test('面板忽略任何 Authorization 头：对的、错的、烂的一律 200 直出面板', async () => {
  const DB = fakeDb();
  for (const auth of [
    'Basic ' + Buffer.from('任意用户名:let-me-in').toString('base64'),
    'Basic ' + Buffer.from('x:wrong').toString('base64'),
    'Basic not-base64!!!',
    'Bearer nope',
  ]) {
    const res = await worker.fetch(new Request(`${ORIGIN}/stats`, { headers: { authorization: auth } }), { ...ENV, DB });
    assert.equal(res.status, 200, `带 ${auth.slice(0, 12)}… 也直出面板`);
  }
});

test('定时任务按 RETENTION_DAYS 删过期明细（删前先按路径累计进 lifetime_path）', async () => {
  const DB = fakeDb();
  await worker.scheduled({ cron: '17 3 * * *' }, { ...ENV, DB, RETENTION_DAYS: '30' });
  const purge = DB.calls.at(-1);
  assert.match(purge.sql, /DELETE FROM visits WHERE ts < \?/);
  const cutoff = purge.args[0];
  const days = (Date.now() / 1000 - cutoff) / 86400;
  assert.ok(Math.abs(days - 30) < 0.01, `实际清了 ${days} 天`);

  // 累计必须先于删除、用同一个 cutoff —— 两件事在 scheduled 的同一个 batch 里，
  // 否则页脚/阅读数会随保留期回退，或同一批行被算两遍
  const rollup = DB.calls.find((c) => c.sql.includes('INSERT INTO lifetime_path'));
  assert.ok(rollup, '删除前要先 rollup 进 lifetime_path');
  assert.match(rollup.sql, /ON CONFLICT\(path\) DO UPDATE/);
  assert.equal(rollup.args[0], cutoff);
  assert.ok(DB.calls.indexOf(rollup) < DB.calls.indexOf(purge), '先累计后删除');
});

test('healthz 只说有没有绑定，不泄露任何密钥', async () => {
  const res = await worker.fetch(new Request(`${ORIGIN}/healthz`), { ...ENV, DB: fakeDb() });
  const body = await res.json();
  assert.deepEqual(body, { ok: true, db: true, token: true });
  assert.ok(!JSON.stringify(body).includes('let-me-in'));
});

test('OPTIONS 预检：只对本站来源放行', async () => {
  const res = await worker.fetch(new Request(`${ORIGIN}/api/visit`, {
    method: 'OPTIONS',
    headers: { origin: 'https://newnju.github.io' },
  }), ENV);
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://newnju.github.io');
});

// ---------------------------------------------------------------- 公开计数
// 页脚「本站访问量」与文章页「本文阅读」用它。免鉴权，所以**只能**回计数 ——
// 任何维度（国家/城市/来源/明细路径）出现在这个响应里，就等于把面板公开了。

const k = (sql) => sql.trim().slice(0, 24);
const SUM = {
  live: 'SELECT COUNT(*) AS n FROM visits',
  today: 'SELECT COUNT(*) AS pv, COUNT(DISTINCT ip_hash) AS uv FROM visits WHERE day = ?',
  life: 'SELECT COALESCE(SUM(pv), 0) AS n FROM lifetime_path',
  pageLive: 'SELECT COUNT(*) AS page_pv FROM visits WHERE path = ?',
  pageLife: 'SELECT COALESCE(pv, 0) AS n FROM lifetime_path WHERE path = ?',
};

test('公开计数：免鉴权 200、60 秒缓存、只回四个数字键', async () => {
  const DB = fakeDb({
    [k(SUM.live)]: [{ n: 10 }],
    [k(SUM.life)]: [{ n: 5 }],
    [k(SUM.today)]: [{ pv: 3, uv: 2 }],
  });
  const res = await worker.fetch(new Request(`${ORIGIN}/api/summary`), { ...ENV, DB });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'public, max-age=60');
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://newnju.github.io');

  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ['generated_at', 'pv', 'today_pv', 'today_uv']);
  assert.equal(body.pv, 15, '累计 = 现库 10 + 过期 rollup 5');
  assert.equal(body.today_pv, 3);
  assert.equal(body.today_uv, 2);

  const raw = JSON.stringify(body);
  for (const leak of ['let-me-in', 'country', 'city', 'ref_host', 'ip_hash', 'path']) {
    assert.ok(!raw.includes(leak), `公开响应不能出现「${leak}」`);
  }
});

test('?path= 与打点同一套归一化，单页阅读数 = 现库 + 过期累计', async () => {
  const DB = fakeDb({
    [k(SUM.live)]: [{ n: 10 }],
    [k(SUM.life)]: [{ n: 5 }],
    [k(SUM.today)]: [{ pv: 3, uv: 2 }],
    [k(SUM.pageLive)]: [{ page_pv: 7 }],
    [k(SUM.pageLife)]: [{ n: 4 }],
  });
  const res = await worker.fetch(
    new Request(`${ORIGIN}/api/summary?path=${encodeURIComponent('/cv/?from=secret')}`),
    { ...ENV, DB },
  );
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.path, '/cv/');
  assert.equal(body.page_pv, 11, '查询串丢掉后按 pathname 累计');
  const pageCall = DB.calls.find((c) => c.sql.includes('page_pv'));
  assert.equal(pageCall.args[0], '/cv/', '绑定给 SQL 的必须是归一化后的路径');
});

test('公开计数不依赖 STATS_TOKEN（没配也能读）', async () => {
  const DB = fakeDb({
    [k(SUM.live)]: [{ n: 1 }],
    [k(SUM.life)]: [{ n: 0 }],
    [k(SUM.today)]: [{ pv: 0, uv: 0 }],
  });
  const res = await worker.fetch(new Request(`${ORIGIN}/api/summary`), { ...ENV, DB, STATS_TOKEN: '' });
  assert.equal(res.status, 200);
});

test('/api/summary 只收 GET', async () => {
  const res = await worker.fetch(new Request(`${ORIGIN}/api/summary`, { method: 'POST' }), {
    ...ENV,
    DB: fakeDb(),
  });
  assert.equal(res.status, 405);
});

test('/api/summary 数据库挂了回 503，不吐栈', async () => {
  const DB = {
    prepare() {
      throw new Error('boom secret detail');
    },
  };
  const res = await worker.fetch(new Request(`${ORIGIN}/api/summary`), { ...ENV, DB });
  assert.equal(res.status, 503);
  const text = await res.text();
  assert.ok(!text.includes('boom'), '公开端点不能回错误细节');
});

// ---------------------------------------------------------------------------
// 旧密码流程已下线：/login 一律 302 回面板，面板与 CSV 公开
// ---------------------------------------------------------------------------

test('/login 一律 302 回 /stats（GET/POST/DELETE 同样处理，不下发任何 cookie）', async () => {
  for (const [method, headers] of [
    ['GET', {}],
    ['POST', { 'content-type': 'application/x-www-form-urlencoded', body: 'key=let-me-in' }],
    ['DELETE', {}],
  ]) {
    const res = await worker.fetch(new Request(`${ORIGIN}/login`, { method, headers }), {
      ...ENV,
      DB: fakeDb(),
    });
    assert.equal(res.status, 302, `${method} /login`);
    assert.equal(res.headers.get('location'), '/stats');
    assert.equal(res.headers.get('set-cookie'), null, '不再有会话 cookie');
    assert.equal(res.headers.get('www-authenticate'), null);
  }
});

test('cookie 不是凭据：带 stats_sess 也进不了 JSON 口（/api/stats 只认令牌）', async () => {
  const res = await worker.fetch(new Request(`${ORIGIN}/api/stats`, {
    headers: { cookie: 'stats_sess=9999999999.' + '0'.repeat(64) },
  }), { ...ENV, DB: fakeDb() });
  assert.equal(res.status, 401);
});

// ---------------------------------------------------------------------------
// 仪表盘（Mercator 分析工作台版式，服务端渲染零 JS）与 CSV 明细导出
// ---------------------------------------------------------------------------

const K = (sql) => sql.trim().slice(0, 24);

test('仪表盘：工作台结构、时间范围切换、导出入口、空态渲染，且全程零脚本', async () => {
  const DB = fakeDb({
    [K('SELECT day, COUNT(*) AS pv, COUNT(DISTINCT ip_hash) AS uv FROM visits WHERE ts >= ? GROUP BY day ORDER BY day')]: [
      { day: '2026-10-07', pv: 2, uv: 1 },
      { day: '2026-10-08', pv: 5, uv: 3 },
    ],
  });
  const res = await worker.fetch(new Request(`${ORIGIN}/stats`), { ...ENV, DB });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-security-policy') || '', /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');

  const body = await res.text();
  assert.match(body, /class="shell"/, '侧栏 + 内容区的工作台骨架');
  assert.match(body, /访客统计 · 仪表盘/);
  assert.match(body, /id="overview"/);
  assert.match(body, /metric-grid/, '关键指标卡片');
  assert.match(body, /id="trend"/);
  assert.match(body, /<svg viewBox="0 0 720 220"/, '趋势图是服务端 SVG');
  assert.match(body, /id="detail"/);
  assert.match(body, /访客明细/);
  assert.match(body, /href="\/stats\.csv\?days=30"/, '默认近 30 天的导出入口');
  assert.match(body, /<a href="\?days=30" aria-current="true">近 30 天<\/a>/, '当前范围高亮');
  assert.match(body, /\?days=7/, '可切近 7 天');
  assert.match(body, /暂无数据|这个区间还没有记录/, '空态');
  assert.ok(!body.includes('<script'), 'CSP default-src none：面板不带任何脚本');
});

test('仪表盘：明细渲染明文 IP、GeoIP 推断位置、中文国家名与网络信息', async () => {
  const DB = fakeDb({
    [K('SELECT ts, day, path, ip, continent, country, region, city, postal, tz, lat, lon, asn, colo,')]: [
      {
        ts: 1759900000, day: '2026-10-08', path: '/cv/', ip: '203.0.113.9',
        continent: 'AS', country: 'JP', region: 'Tokyo', city: 'Tokyo',
        postal: '100-0001', tz: 'Asia/Tokyo', lat: 35.68, lon: 139.76,
        asn: 2516, colo: 'NRT', device: 'mobile', browser: 'safari',
        ref_host: 't.co', lang: 'ja',
      },
    ],
  });
  const res = await worker.fetch(new Request(`${ORIGIN}/stats`), { ...ENV, DB });
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /203\.0\.113\.9/, '明细含明文 IP（公开面板可见；/api/summary 永不出现）');
  assert.match(body, /日本 \/ Tokyo \/ Tokyo/, '国家码翻成中文，位置为推断值');
  assert.match(body, /AS2516 · NRT/);
  assert.match(body, /手机 · safari/);
  assert.match(body, /t\.co/);
  assert.ok(!body.includes('let-me-in'), '页面里不能出现令牌');
});

test('/stats.csv：无凭据直接出 text/csv，含全部列且转义正确；只收 GET', async () => {
  const anon = await worker.fetch(new Request(`${ORIGIN}/stats.csv`), { ...ENV, DB: fakeDb() });
  assert.equal(anon.status, 200, '导出与面板一样公开');
  assert.equal(anon.headers.get('www-authenticate'), null);

  const DB = fakeDb({
    [K('SELECT ts, day, path, ip, ip_hash, continent, country, region, region_code, city, postal, tz,')]: [
      {
        ts: 1759900000, day: '2026-10-08', path: '/a,"b"', ip: '203.0.113.9',
        ip_hash: 'deadbeefdeadbeef', continent: 'AS', country: 'CN', region: 'Jiangsu',
        region_code: 'JS', city: 'Nanjing', postal: '210008', tz: 'Asia/Shanghai',
        lat: 32.06, lon: 118.79, asn: 4134, colo: 'NRT', device: 'desktop',
        browser: 'chrome', ref_host: null, lang: 'zh-CN',
      },
    ],
  });
  const csv = await worker.fetch(new Request(`${ORIGIN}/stats.csv?days=7`), { ...ENV, DB });
  assert.equal(csv.status, 200);
  assert.match(csv.headers.get('content-type') || '', /^text\/csv/);
  assert.match(csv.headers.get('content-disposition') || '', /visits-7d\.csv/);
  const text = await csv.text();
  assert.match(text, /^ts,iso_time,day,path,ip,ip_hash,continent,country/);
  assert.ok(text.includes('203.0.113.9'));
  assert.ok(text.includes('"/a,""b"""'), '逗号/引号字段按 CSV 规则转义');
  assert.ok(text.includes('2025-10-08T05:06:40'), '带 ISO 时间列');

  const post = await worker.fetch(new Request(`${ORIGIN}/stats.csv`, { method: 'POST' }), { ...ENV, DB: fakeDb() });
  assert.equal(post.status, 405);
});

test('/api/stats：JSON 口拿到扩展维度（recent 含 ip 与推断字段），与面板同一次统计', async () => {
  const DB = fakeDb({
    [K('SELECT ts, day, path, ip, continent, country, region, city, postal, tz, lat, lon, asn, colo,')]: [
      {
        ts: 1759900000, day: '2026-10-08', path: '/', ip: '198.51.100.23',
        continent: 'AS', country: 'CN', region: 'Jiangsu', city: 'Nanjing',
        postal: null, tz: 'Asia/Shanghai', lat: null, lon: null,
        asn: null, colo: null, device: 'desktop', browser: 'chrome',
        ref_host: null, lang: 'zh-CN',
      },
    ],
  });
  const res = await worker.fetch(new Request(`${ORIGIN}/api/stats?key=let-me-in`), { ...ENV, DB });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(Array.isArray(body.recent) && body.recent.length === 1);
  assert.equal(body.recent[0].ip, '198.51.100.23');
  assert.ok(body.recent[0].continent === 'AS');
  assert.deepEqual(Object.keys(body).sort(), [
    'browsers', 'cities', 'countries', 'daily', 'days', 'devices', 'generated_at',
    'languages', 'paths', 'reach', 'recent', 'referrers', 'regions', 'totals',
  ]);
});
