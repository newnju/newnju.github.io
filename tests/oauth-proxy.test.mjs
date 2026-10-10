// oauth-proxy 的安全回归：直接把这个 Worker 的 fetch 拿来做单元测试。
//
//   node --test tests/oauth-proxy.test.mjs
//
// 为什么值得测：这个 Worker 是后台唯一的门，而「门」的行为用浏览器点不出来 ——
// 白名单没配时是不是真的拒绝、token 会不会在鉴权之前就发出去、postMessage
// 是不是还写着 '*'，这些都得看代码，而代码最容易在重构时被顺手改掉。
// 全程离线：GitHub 那两个端点用假的 fetch 顶掉。
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../oauth-proxy/worker.js';

// Worker 里的审计日志会往 console.log 写，直接跑会把 TAP 输出搅乱（哪一行是
// 测试结果、哪一行是日志分不清）。默认吞掉，需要断言的那一个用例自己装收集器。
let realLog;
before(() => {
  realLog = console.log;
  console.log = () => {};
});
after(() => {
  console.log = realLog;
});

const ORIGIN = 'https://oauth.example.test';
const ENV = {
  GITHUB_OAUTH_ID: 'Iv1.test',
  GITHUB_OAUTH_SECRET: 'shh',
  ALLOWED_GITHUB_USERS: 'newnju, Someone-Else',
  SITE_ORIGIN: 'https://newnju.github.io',
};

const req = (path, init = {}) => new Request(ORIGIN + path, init);

/** 顶掉出网的 fetch：只认 GitHub 那三个端点，其余一律 500（等于没网） */
function mockGitHub({ token = 'gho_faketoken', login = 'newnju', userOk = true } = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const href = typeof url === 'string' ? url : url.href;
    calls.push({ href, init });
    if (href.startsWith('https://github.com/login/oauth/access_token')) {
      return new Response(JSON.stringify({ access_token: token }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    if (href.startsWith('https://api.github.com/user')) {
      if (!userOk) return new Response('{}', { status: 401 });
      return new Response(JSON.stringify({ login }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('unexpected outbound request', { status: 500 });
  };
  return calls;
}

const restore = () => {
  delete globalThis.fetch;
};

test('白名单没配时 /auth 直接拒绝，不放行', async () => {
  const calls = mockGitHub();
  try {
    const res = await worker.fetch(req('/auth?provider=github'), { ...ENV, ALLOWED_GITHUB_USERS: '' });
    assert.equal(res.status, 503);
    // 关键：不能因为「还没配」就把人送去 GitHub —— 那等于对全网开放
    assert.equal(calls.length, 0, '不应该发出任何出网请求');
    assert.match(await res.text(), /ALLOWED_GITHUB_USERS/);
  } finally {
    restore();
  }
});

test('/auth 生成 state 写进 HttpOnly+SameSite cookie，并 302 到 GitHub', async () => {
  mockGitHub();
  try {
    const res = await worker.fetch(req('/auth?provider=github'), ENV);
    assert.equal(res.status, 302);
    const location = new URL(res.headers.get('location'));
    assert.equal(location.origin + location.pathname, 'https://github.com/login/oauth/authorize');

    const cookie = res.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
    assert.match(cookie, /Secure/);

    const state = /state=([0-9a-f]+)/.exec(location.searchParams.get('state') ?? '')?.[1] ??
      location.searchParams.get('state');
    assert.ok(state && /^[0-9a-f]{32}$/.test(state), `state 应该是 32 位十六进制，实际 ${state}`);
  } finally {
    restore();
  }
});

test('/callback 只在 state 对得上时才换 token，且换完立刻作废 state cookie', async () => {
  const calls = mockGitHub();
  try {
    const res = await worker.fetch(
      req('/callback?code=abc&state=deadbeef', { headers: { cookie: 'decap_oauth_state=deadbeef' } }),
      ENV,
    );
    assert.equal(res.status, 200);
    assert.match(await res.text(), /"token"/);
    assert.ok(
      calls.some((c) => c.href.startsWith('https://github.com/login/oauth/access_token')),
      '应该换过一次 token',
    );
    assert.match(res.headers.get('set-cookie'), /Max-Age=0/);
  } finally {
    restore();
  }
});

test('state 不匹配时拒绝，并且不清掉 cookie 之外不做任何出网请求', async () => {
  const calls = mockGitHub();
  try {
    const res = await worker.fetch(
      req('/callback?code=abc&state=nope', { headers: { cookie: 'decap_oauth_state=deadbeef' } }),
      ENV,
    );
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0, 'state 没对上就不该去换 token');
    assert.match(res.headers.get('set-cookie'), /Max-Age=0/);
  } finally {
    restore();
  }
});

test('白名单外的人：token 换了但绝不交出去（响应里不能出现 token）', async () => {
  mockGitHub({ login: 'somebody-else' });
  try {
    const res = await worker.fetch(
      req('/callback?code=abc&state=s1', { headers: { cookie: 'decap_oauth_state=s1' } }),
      ENV,
    );
    assert.equal(res.status, 403);
    const body = await res.text();
    assert.ok(!body.includes('gho_faketoken'), 'token 不能出现在给拒绝者的响应里');
    assert.match(body, /somebody-else/);
  } finally {
    restore();
  }
});

test('查不到身份时也拒绝（不因为 /user 失败就当放行）', async () => {
  mockGitHub({ userOk: false });
  try {
    const res = await worker.fetch(
      req('/callback?code=abc&state=s1', { headers: { cookie: 'decap_oauth_state=s1' } }),
      ENV,
    );
    assert.equal(res.status, 502);
    assert.ok(!(await res.text()).includes('gho_faketoken'));
  } finally {
    restore();
  }
});

test('白名单不区分大小写', async () => {
  mockGitHub({ login: 'NewNJU' });
  try {
    const res = await worker.fetch(
      req('/callback?code=abc&state=s1', { headers: { cookie: 'decap_oauth_state=s1' } }),
      ENV,
    );
    assert.equal(res.status, 200);
    assert.match(await res.text(), /"token"/);
  } finally {
    restore();
  }
});

test('交 token 的页面：postMessage 锁死 targetOrigin，不用 *', async () => {
  mockGitHub();
  try {
    const res = await worker.fetch(
      req('/callback?code=abc&state=s1', { headers: { cookie: 'decap_oauth_state=s1' } }),
      ENV,
    );
    const body = await res.text();
    assert.ok(!/postMessage\([^)]*,\s*'\*'\)/.test(body), "不能出现 postMessage(..., '*')");
    assert.match(body, /var target = "https:\/\/newnju\.github\.io"/);
    // 绝不读 opener.location：relay 页与 opener 跨源，.origin 一读就抛 SecurityError，
    // success 消息发不出去，Decap 永远停在「正在完成登录……」
    assert.ok(!body.includes('window.opener.location'), '不能读 window.opener.location（跨源抛异常）');
    // 安全边界只靠 postMessage 的 targetOrigin（send() 里直接投给 target）
    assert.match(body, /window\.opener\.postMessage\('authorization:github:' \+ status/);
  } finally {
    restore();
  }
});

test('token 页面不下缓存、不可被 iframe 套用', async () => {
  mockGitHub();
  try {
    const res = await worker.fetch(
      req('/callback?code=abc&state=s1', { headers: { cookie: 'decap_oauth_state=s1' } }),
      ENV,
    );
    assert.match(res.headers.get('cache-control'), /no-store/);
    assert.equal(res.headers.get('x-frame-options'), 'DENY');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  } finally {
    restore();
  }
});

test('每次尝试都留一行结构化审计日志（含 IP / 国家 / 城市 / 结果）', async () => {
  const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  mockGitHub({ login: 'intruder' });
  try {
    await worker.fetch(req('/auth?provider=github'), ENV);
    await worker.fetch(
      new Request(`${ORIGIN}/callback?code=abc&state=s1`, {
        headers: { cookie: 'decap_oauth_state=s1', 'cf-connecting-ip': '203.0.113.9', 'user-agent': 'test' },
      }),
      ENV,
    );
  } finally {
    console.log = () => {};
    restore();
  }
  const events = lines.map((l) => JSON.parse(l));
  assert.equal(events.length, 2);
  assert.equal(events[0].event, 'login_started');
  assert.equal(events[1].event, 'not_allowed');
  assert.equal(events[1].user, 'intruder');
  assert.equal(events[1].ip, '203.0.113.9');
  assert.ok(events[1].ts);
});

test('/healthz 只说「配没配」，不回配置内容', async () => {
  mockGitHub();
  try {
    const res = await worker.fetch(req('/healthz'), ENV);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.deepEqual(JSON.parse(body), { ok: true, allowlist: true });
    assert.ok(!body.includes('newnju'), '白名单内容不能出现在公开响应里');
  } finally {
    restore();
  }
});

test('非 GitHub 的 provider 直接拒绝', async () => {
  const calls = mockGitHub();
  try {
    const res = await worker.fetch(req('/auth?provider=gitlab'), ENV);
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

// ---------------------------------------------------------------------------
// 网络故障与配置漂移：GitHub 那头连不上、密钥中途被清掉时，
// 弹窗要拿到一句人话 + 干净的 set-cookie，而不是 Worker 裸异常（1101）
// ---------------------------------------------------------------------------

test('换 token 时 GitHub 连不上：回 502 人话页面，state cookie 照清', async () => {
  globalThis.fetch = async () => {
    throw new TypeError('fetch failed');
  };
  try {
    const res = await worker.fetch(
      req('/callback?code=abc&state=s1', { headers: { cookie: 'decap_oauth_state=s1' } }),
      ENV,
    );
    assert.equal(res.status, 502);
    assert.match(await res.text(), /连不上 GitHub/);
    assert.match(res.headers.get('set-cookie'), /Max-Age=0/, '失败出口也要作废 state');
  } finally {
    restore();
  }
});

test('查身份时 GitHub 连不上：回 502，且不把 token 交出去', async () => {
  globalThis.fetch = async (url) => {
    const href = typeof url === 'string' ? url : url.href;
    if (href.startsWith('https://github.com/login/oauth/access_token')) {
      return new Response(JSON.stringify({ access_token: 'gho_secret' }), {
        headers: { 'content-type': 'application/json' },
      });
    }
    throw new TypeError('fetch failed'); // /user 挂了
  };
  try {
    const res = await worker.fetch(
      req('/callback?code=abc&state=s1', { headers: { cookie: 'decap_oauth_state=s1' } }),
      ENV,
    );
    assert.equal(res.status, 502);
    const body = await res.text();
    assert.match(body, /GitHub 身份/);
    assert.ok(!body.includes('gho_secret'), '失败路径绝不泄漏刚换到的 token');
    assert.match(res.headers.get('set-cookie'), /Max-Age=0/);
  } finally {
    restore();
  }
});

test('state 对上但密钥被清掉：回 500 人话，一个出网请求都不发', async () => {
  const calls = mockGitHub();
  try {
    const res = await worker.fetch(
      req('/callback?code=abc&state=s1', { headers: { cookie: 'decap_oauth_state=s1' } }),
      { ...ENV, GITHUB_OAUTH_SECRET: '' },
    );
    assert.equal(res.status, 500);
    assert.match(await res.text(), /GITHUB_OAUTH_SECRET/);
    assert.equal(calls.length, 0, '配置不全就不要拿 undefined 去问 GitHub');
  } finally {
    restore();
  }
});
