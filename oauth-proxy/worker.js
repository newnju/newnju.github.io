/**
 * Decap CMS 的 GitHub OAuth 代理（Cloudflare Worker，零依赖）。
 *
 * 为什么需要它：Decap 前端拿不到 GitHub 的 client_secret，纯浏览器流程
 * 会把密钥暴露出去。GitHub 又不允许浏览器直接换 token，所以必须有个
 * 服务端中转 —— 就是本文件。
 *
 * 端点：
 *   GET  /auth?provider=github    点「Login with GitHub」后弹窗落在这里，
 *                                  生成 state 写进 cookie，302 跳去 GitHub 授权页
 *   GET  /callback?code&state     GitHub 授权完回这里：服务端换 token →
 *                                  **用换到的 token 查一次 /user 确认身份在白名单里**
 *                                  → 再用 postMessage 把 token 交回主窗口
 *   GET  /healthz                  健康检查（不带任何信息）
 *
 * 需要的密钥（`npx wrangler secret put`，不要写进任何会被提交的文件）：
 *   GITHUB_OAUTH_ID       GitHub OAuth App 的 Client ID
 *   GITHUB_OAUTH_SECRET   GitHub OAuth App 的 Client Secret
 *   ALLOWED_GITHUB_USERS  逗号分隔的 GitHub 用户名，**只有名单内的人能登录后台**
 *   SITE_ORIGIN           Decap 前端所在来源（默认 https://newnju.github.io），
 *                         postMessage 只发到这里
 *
 * 可选：
 *   GITHUB_SCOPE          默认 public_repo,user；仓库若为私有改成 repo,user
 *   IP_SALT               审计日志里 IP 哈希的盐
 *
 * ---------------------------------------------------------------------------
 * 安全边界：这个 Worker 是后台唯一的门，所以按「默认拒绝」写
 * ---------------------------------------------------------------------------
 * 1) **白名单在服务端校验，且是强制的。** 只配 client_id/secret 时，任何拿着
 *    任意 GitHub 账号的人都能走完流程、让本 Worker 用自己的 secret 换出一个
 *    token —— 那一刻本 Worker 就退化成一个对全网开放的换 token 中转站，
 *    而且 OAuth App 会出现在每个人的 GitHub 设置里。白名单为空时直接 503，
 *    不放行：宁可登录不了，也不能默认谁都能进。
 *    （能不能真的改内容，最后还是由 GitHub 的仓库权限决定：没有 write 的人
 *    拿到的 token push 时会 403。白名单是在那之前就把人挡在门外。）
 * 2) **postMessage 锁死 targetOrigin。** 用 '*' 的话，任何打开了本窗口的页面
 *    都能收走 token（钓鱼页只要 window.open 一次就等着收）。
 * 3) **交 token 的页面不下缓存、不可被 iframe 套用**：no-store + nosniff +
 *    frame-ancestors 'none' + CSP 把外部资源全禁掉。
 * 4) **state cookie 用完就清**（成功、失败、state 不匹配三条路都清），
 *    10 分钟内重放同一个 state 不成立。
 * 5) **每次尝试都记一行结构化审计日志**：谁、什么时候、从哪个 IP、哪个国家/城市、
 *    成功还是被白名单挡下。Workers Logs 默认只留 3 天；想留更久就把 AUDIT
 *    binding 配上（Analytics Engine），见 README。
 */

const STATE_COOKIE = 'decap_oauth_state';
const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token';
const GITHUB_USER = 'https://api.github.com/user';
const DEFAULT_SITE_ORIGIN = 'https://newnju.github.io';

/** 交 token 的那个页面：一律不缓存、不许被套 iframe、不许引任何外部资源 */
const RELAY_HEADERS = {
  'cache-control': 'no-store, max-age=0',
  pragma: 'no-cache',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'content-security-policy':
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'none'; img-src 'none'; " +
    "connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

function redirect(location, extra = {}) {
  return new Response(null, { status: 302, headers: { ...RELAY_HEADERS, location, ...extra } });
}

function html(body, status = 200) {
  return new Response(body, { status, headers: { ...RELAY_HEADERS, 'content-type': 'text/html; charset=utf-8' } });
}

function randomHex(bytes) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

function setStateCookie(state) {
  return `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
}

/** Max-Age=0 即刻作废，三条出口都要挂上 */
function clearStateCookie() {
  return `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

/** 白名单：逗号 / 空格 / 换行分隔，大小写不敏感（GitHub 用户名本身不区分大小写） */
function allowList(env) {
  return new Set(
    String(env.ALLOWED_GITHUB_USERS ?? '')
      .split(/[\s,]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** 审计日志：Workers Logs（3 天）。配了 AUDIT binding 的话再长期留一份。 */
async function audit(env, request, event) {
  const cf = request.cf ?? {};
  const line = {
    ts: new Date().toISOString(),
    event: event.name,
    user: event.user ?? null,
    ip: request.headers.get('cf-connecting-ip') ?? null,
    country: cf.country ?? null,
    city: cf.city ?? null,
    asn: cf.asn ?? null,
    ua: (request.headers.get('user-agent') ?? '').slice(0, 120),
    ...(event.detail ?? {}),
  };
  console.log(JSON.stringify(line));
  if (env.AUDIT && typeof env.AUDIT.writeDataPoint === 'function') {
    try {
      env.AUDIT.writeDataPoint({
        // indexes 供过滤：谁 + 什么动作
        indexes: [`admin_${line.event}`, String(line.user ?? 'anonymous').toLowerCase()],
        blobs: [line.event, String(line.user ?? ''), line.ip ?? '', line.country ?? '', line.city ?? ''],
        doubles: [Date.parse(line.ts)],
      });
    } catch (err) {
      console.log(JSON.stringify({ event: 'audit_write_failed', error: String(err) }));
    }
  }
}

async function handleAuth(request, url, env) {
  if (url.searchParams.get('provider') !== 'github') {
    return html('不支持的登录方式，只允许 provider=github。', 400);
  }
  if (!env.GITHUB_OAUTH_ID || !env.GITHUB_OAUTH_SECRET) {
    return html('服务端还没配 GITHUB_OAUTH_ID / GITHUB_OAUTH_SECRET，见 oauth-proxy/README.md。', 500);
  }
  if (allowList(env).size === 0) {
    await audit(env, request, { name: 'login_config_missing', user: null });
    return html(
      '服务端还没配 ALLOWED_GITHUB_USERS，后台登录已按「默认拒绝」关着。' +
        '执行 npx wrangler secret put ALLOWED_GITHUB_USERS 并填自己的 GitHub 用户名后再试。',
      503,
    );
  }

  const state = randomHex(16);
  const scope = env.GITHUB_SCOPE || 'public_repo,user';
  const redirectUri = `${url.origin}/callback`;

  const target = new URL(GITHUB_AUTHORIZE);
  target.searchParams.set('client_id', env.GITHUB_OAUTH_ID);
  target.searchParams.set('redirect_uri', redirectUri);
  target.searchParams.set('scope', scope);
  target.searchParams.set('state', state);

  await audit(env, request, { name: 'login_started', user: null });
  return redirect(target.toString(), { 'set-cookie': setStateCookie(state) });
}

/**
 * 把 token 交回打开弹窗的那个窗口。协议见 Decap 的 OAuth2 起搏页。
 * targetOrigin 必须是站点自己的来源，不能是 '*'：'*' 的话任何打开过本窗口的
 * 页面（钓鱼页只要 window.open 一次然后等消息）都能收走这个 token。
 */
function relayPage(status, payload, siteOrigin) {
  return html(`<!doctype html><meta charset="utf-8"><title>授权中</title>
<p>正在完成登录……如果这个窗口没有自动关闭，请回到原来的页面重试。</p>
<script>
  var status = ${JSON.stringify(status)};
  var payload = ${JSON.stringify(payload)};
  var target = ${JSON.stringify(siteOrigin)};
  function send() {
    if (!window.opener) return;
    /* 只发给本站来源；opener 不是本站（钓鱼页自己开的窗口）就干脆不发。 */
    if (window.opener.location && window.opener.location.origin !== target) return;
    window.opener.postMessage('authorization:github:' + status + ':' + JSON.stringify(payload), target);
  }
  window.opener && window.opener.postMessage('authorizing:github', target);
  window.addEventListener('message', send);
  setTimeout(send, 50);
  setTimeout(function () { window.close(); }, 8000);
</script>`);
}

async function githubJson(url, init) {
  const res = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      'user-agent': 'decap-oauth-proxy',
      'x-github-api-version': '2022-11-28',
      ...(init?.headers ?? {}),
    },
  });
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
}

async function handleCallback(request, url, env) {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const deny = (status, message) =>
    new Response(message, { status, headers: { ...RELAY_HEADERS, 'set-cookie': clearStateCookie() } });

  if (!code) {
    const reason =
      url.searchParams.get('error_description') || url.searchParams.get('error') || '缺少 code';
    await audit(env, request, { name: 'login_denied', user: null, detail: { reason: String(reason) } });
    return deny(400, `GitHub 授权失败：${String(reason)}`);
  }

  const expected = readCookie(request, STATE_COOKIE);
  if (!expected || expected !== state) {
    await audit(env, request, { name: 'state_mismatch', user: null });
    return deny(400, 'state 校验失败（可能是链接过期），请回主窗口重新点登录。');
  }

  const body = new URLSearchParams({
    client_id: env.GITHUB_OAUTH_ID,
    client_secret: env.GITHUB_OAUTH_SECRET,
    code,
    redirect_uri: `${url.origin}/callback`,
    grant_type: 'authorization_code',
  });

  const res = await fetch(GITHUB_TOKEN, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'decap-oauth-proxy',
    },
    body: body.toString(),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const desc = data.error_description || data.error || `HTTP ${res.status}`;
    await audit(env, request, { name: 'token_exchange_failed', user: null, detail: { reason: String(desc) } });
    return deny(502, `换取 token 失败：${String(desc)}`);
  }

  // 拿到了 token，先确认这人是谁 —— 白名单校验必须在把 token 交出去之前。
  const who = await githubJson(GITHUB_USER, {
    headers: { authorization: `Bearer ${data.access_token}` },
  });
  const login = who.ok ? String(who.data.login ?? '') : '';

  if (!who.ok || !login) {
    await audit(env, request, { name: 'identity_failed', user: null });
    return deny(502, '没能确认你的 GitHub 身份，请回主窗口重新点登录。');
  }

  if (!allowList(env).has(login.toLowerCase())) {
    await audit(env, request, { name: 'not_allowed', user: login });
    return deny(403, `GitHub 账号 ${login} 不在本站后台的白名单里。`);
  }

  await audit(env, request, { name: 'login_ok', user: login });

  const siteOrigin = env.SITE_ORIGIN || DEFAULT_SITE_ORIGIN;
  const page = relayPage('success', { token: data.access_token }, siteOrigin);
  page.headers.append('set-cookie', clearStateCookie());
  return page;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/auth') return handleAuth(request, url, env);
    if (url.pathname === '/callback') return handleCallback(request, url, env);

    if (url.pathname === '/healthz') {
      // 只回「配没配」，不回配置内容：这个域名是公开的。
      return new Response(JSON.stringify({ ok: true, allowlist: allowList(env).size > 0 }), {
        headers: { ...RELAY_HEADERS, 'content-type': 'application/json' },
      });
    }

    if (url.pathname === '/') {
      return html(`<!doctype html><meta charset="utf-8"><title>Decap OAuth 代理</title>
<p>这是 Decap CMS 的 GitHub 登录代理，本身没有可看的内容。</p>
<p>健康检查：<a href="/healthz">/healthz</a></p>`);
    }

    return new Response('Not found', { status: 404, headers: RELAY_HEADERS });
  },
};
