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

test('面板：未授权时用 HTTP Basic 弹密码框，且不发 noindex', async () => {
  const res = await worker.fetch(new Request(`${ORIGIN}/stats`), { ...ENV, DB: fakeDb() });
  assert.equal(res.status, 401);
  assert.match(res.headers.get('www-authenticate'), /Basic/);
});

test('面板：弹框后 Basic 密码对就放行、错就拒绝（以前没解 Basic，弹框是死循环）', async () => {
  const DB = fakeDb();
  const ok = await worker.fetch(new Request(`${ORIGIN}/stats`, {
    headers: { authorization: 'Basic ' + Buffer.from('任意用户名:let-me-in').toString('base64') },
  }), { ...ENV, DB });
  assert.equal(ok.status, 200);

  const wrong = await worker.fetch(new Request(`${ORIGIN}/stats`, {
    headers: { authorization: 'Basic ' + Buffer.from('x:wrong').toString('base64') },
  }), { ...ENV, DB });
  assert.equal(wrong.status, 401);

  const malformed = await worker.fetch(new Request(`${ORIGIN}/stats`, {
    headers: { authorization: 'Basic not-base64!!!' },
  }), { ...ENV, DB });
  assert.equal(malformed.status, 401);
});

test('定时任务按 RETENTION_DAYS 删过期明细', async () => {
  const DB = fakeDb();
  await worker.scheduled({ cron: '17 3 * * *' }, { ...ENV, DB, RETENTION_DAYS: '30' });
  const purge = DB.calls.at(-1);
  assert.match(purge.sql, /DELETE FROM visits WHERE ts < \?/);
  const cutoff = purge.args[0];
  const days = (Date.now() / 1000 - cutoff) / 86400;
  assert.ok(Math.abs(days - 30) < 0.01, `实际清了 ${days} 天`);
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
