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

test('打点写入一行：时间、路径、GeoIP、国家、城市都在，IP 只留哈希', async () => {
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
  request.cf = { country: 'CN', region: 'Jiangsu', city: 'Nanjing', asn: 4134, latitude: 32.06, longitude: 118.79 };

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

  // 关键：没有明文 IP 那几列
  assert.ok(!('raw_ip' in row), '默认不存明文 IP');
  assert.match(row.ip_hash, /^[0-9a-f]{16}$/);
  assert.ok(!JSON.stringify(row).includes('198.51.100.23'), '任何一列都不能出现明文 IP');
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

test('STORE_RAW_IP=1 时才额外存明文 IP（默认不存）', async () => {
  const DB = fakeDb();
  const req = new Request(`${ORIGIN}/api/visit`, {
    method: 'POST',
    body: '{}',
    headers: { 'cf-connecting-ip': '198.51.100.23' },
  });
  await worker.fetch(req, { ...ENV, DB, STORE_RAW_IP: '1' });
  assert.match(DB.calls[0].sql, /raw_ip/);
  assert.ok(DB.calls[0].args.includes('198.51.100.23'));
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

test('面板：未授权时 302 去登录页（不再发 401 弹原生密码框），登录页渲染表单且 noindex', async () => {
  const res = await worker.fetch(new Request(`${ORIGIN}/stats`), { ...ENV, DB: fakeDb() });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/login');
  assert.equal(res.headers.get('www-authenticate'), null, '有 WWW-Authenticate 浏览器就弹框');

  const page = await worker.fetch(new Request(`${ORIGIN}/login`), { ...ENV, DB: fakeDb() });
  assert.equal(page.status, 200);
  const body = await page.text();
  assert.match(body, /<form method="post" action="\/login">/);
  assert.match(body, /name="key"/);
  assert.match(body, /noindex/);
  assert.ok(!body.includes('let-me-in'), '登录页不泄露令牌');
});

test('面板：Basic 密码对就放行、错就跳登录页（Basic/?key= 兼容保留，弹框流程废弃）', async () => {
  const DB = fakeDb();
  const ok = await worker.fetch(new Request(`${ORIGIN}/stats`, {
    headers: { authorization: 'Basic ' + Buffer.from('任意用户名:let-me-in').toString('base64') },
  }), { ...ENV, DB });
  assert.equal(ok.status, 200);

  const wrong = await worker.fetch(new Request(`${ORIGIN}/stats`, {
    headers: { authorization: 'Basic ' + Buffer.from('x:wrong').toString('base64') },
  }), { ...ENV, DB });
  assert.equal(wrong.status, 302);
  assert.equal(wrong.headers.get('location'), '/login');

  const malformed = await worker.fetch(new Request(`${ORIGIN}/stats`, {
    headers: { authorization: 'Basic not-base64!!!' },
  }), { ...ENV, DB });
  assert.equal(malformed.status, 302);
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
// 面板会话：/login 表单 → HttpOnly 签名 cookie → 30 天免登录（替代原生弹框）
// ---------------------------------------------------------------------------

const login = (key) =>
  new Request(`${ORIGIN}/login`, {
    method: 'POST',
    body: new URLSearchParams({ key }),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });

test('登录：密码对 → 302 面板 + HttpOnly/Secure/SameSite=Strict 的签名 cookie', async () => {
  const res = await worker.fetch(login('let-me-in'), { ...ENV, DB: fakeDb() });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), '/stats');

  const setCookie = res.headers.get('set-cookie') || '';
  assert.match(setCookie, /^stats_sess=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Strict/);
  assert.match(setCookie, /Max-Age=2592000/);
  assert.match(setCookie, /Path=\//);
  assert.ok(!setCookie.includes('let-me-in'), 'cookie 里不能是明文密码');

  const value = setCookie.match(/^stats_sess=([^;]+)/)[1];
  const [exp, sig] = value.split('.');
  assert.match(exp, /^\d{10,}$/, 'exp 是未来时间戳');
  assert.match(sig, /^[0-9a-f]{64}$/, 'sig 是 HMAC-SHA256 十六进制');
  assert.ok(Number(exp) > Date.now() / 1000 + 29 * 24 * 3600, '有效期约 30 天');
});

test('登录：密码错 → 重新渲染表单、报错、绝不下发 Set-Cookie', async () => {
  const res = await worker.fetch(login('wrong'), { ...ENV, DB: fakeDb() });
  assert.equal(res.status, 200);
  const body = await res.text();
  assert.match(body, /密码不对/);
  assert.match(body, /<form method="post" action="\/login">/);
  assert.equal(res.headers.get('set-cookie'), null);
});

test('登录：没配 STATS_TOKEN 时任何密码都进不去（读接口整体关闭的语义一致）', async () => {
  const res = await worker.fetch(login('anything'), { ...ENV, DB: fakeDb(), STATS_TOKEN: '' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('set-cookie'), null);
});

test('拿着登录拿到的 cookie：/stats 直接 200，/login 直接 302 回面板（跳过表单）', async () => {
  const loginRes = await worker.fetch(login('let-me-in'), { ...ENV, DB: fakeDb() });
  const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];

  const panel = await worker.fetch(new Request(`${ORIGIN}/stats`, {
    headers: { cookie },
  }), { ...ENV, DB: fakeDb() });
  assert.equal(panel.status, 200);

  const again = await worker.fetch(new Request(`${ORIGIN}/login`, {
    headers: { cookie },
  }), { ...ENV, DB: fakeDb() });
  assert.equal(again.status, 302);
  assert.equal(again.headers.get('location'), '/stats');
});

test('cookie 改一位就作废：篡改签名 / 过期时间都进不了面板', async () => {
  const loginRes = await worker.fetch(login('let-me-in'), { ...ENV, DB: fakeDb() });
  const value = (loginRes.headers.get('set-cookie') || '').match(/^stats_sess=([^;]+)/)[1];
  const [exp, sig] = value.split('.');

  const tamperedSig = `stats_sess=${exp}.${'0'.repeat(63)}${sig.at(-1) === '0' ? '1' : '0'}`;
  const tampered = await worker.fetch(new Request(`${ORIGIN}/stats`, {
    headers: { cookie: tamperedSig },
  }), { ...ENV, DB: fakeDb() });
  assert.equal(tampered.status, 302);
  assert.equal(tampered.headers.get('location'), '/login');

  const expired = await worker.fetch(new Request(`${ORIGIN}/stats`, {
    headers: { cookie: `stats_sess=1000000000.${sig}` },
  }), { ...ENV, DB: fakeDb() });
  assert.equal(expired.status, 302);
});

test('换掉 STATS_TOKEN 即全部旧会话作废（签名密钥就是令牌本身）', async () => {
  const loginRes = await worker.fetch(login('let-me-in'), { ...ENV, DB: fakeDb() });
  const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];

  const after = await worker.fetch(new Request(`${ORIGIN}/stats`, {
    headers: { cookie },
  }), { ...ENV, DB: fakeDb(), STATS_TOKEN: 'rotated' });
  assert.equal(after.status, 302);
  assert.equal(after.headers.get('location'), '/login');
});

test('会话 cookie 只开面板，不开 JSON 口（/api/stats 仍必须 Bearer）', async () => {
  const loginRes = await worker.fetch(login('let-me-in'), { ...ENV, DB: fakeDb() });
  const cookie = (loginRes.headers.get('set-cookie') || '').split(';')[0];

  const res = await worker.fetch(new Request(`${ORIGIN}/api/stats`, {
    headers: { cookie },
  }), { ...ENV, DB: fakeDb() });
  assert.equal(res.status, 401);
});

test('/login 只收 GET/HEAD/POST，其它方法 405 且不发 WWW-Authenticate', async () => {
  const res = await worker.fetch(new Request(`${ORIGIN}/login`, { method: 'DELETE' }), {
    ...ENV,
    DB: fakeDb(),
  });
  assert.equal(res.status, 405);
  assert.equal(res.headers.get('www-authenticate'), null);
});
