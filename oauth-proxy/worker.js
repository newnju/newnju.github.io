/**
 * Decap CMS 的 GitHub OAuth 代理（Cloudflare Worker，零依赖）。
 *
 * 为什么需要它：Decap 前端拿不到 GitHub 的 client_secret，纯浏览器流程
 * 会把密钥暴露出去。GitHub 又不允许浏览器直接换 token，所以必须有个
 * 服务端中转 —— 就是本文件。
 *
 * 端点：
 *   GET /auth?provider=github     点「Login with GitHub」后弹窗落在这里，
 *                                 302 跳去 GitHub 授权页
 *   GET /callback?code&state      GitHub 授权完回这里，服务端换 token，
 *                                 再用 postMessage 把 token 交回主窗口
 *
 * 需要的密钥（wrangler secret put，不要写进任何会被提交的文件）：
 *   GITHUB_OAUTH_ID       GitHub OAuth App 的 Client ID
 *   GITHUB_OAUTH_SECRET   GitHub OAuth App 的 Client Secret
 *
 * 可选：
 *   GITHUB_SCOPE          默认 public_repo,user；仓库若为私有改成 repo,user
 */

const STATE_COOKIE = 'decap_oauth_state';
const GITHUB_AUTHORIZE = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN = 'https://github.com/login/oauth/access_token';

function redirect(location, extra = {}) {
  return new Response(null, { status: 302, headers: { location, ...extra } });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function randomHex(bytes) {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

function setStateCookie(state) {
  return `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
}

async function handleAuth(url, env) {
  if (url.searchParams.get('provider') !== 'github') {
    return html('不支持的登录方式，只允许 provider=github。', 400);
  }
  if (!env.GITHUB_OAUTH_ID || !env.GITHUB_OAUTH_SECRET) {
    return html('服务端还没配 GITHUB_OAUTH_ID / GITHUB_OAUTH_SECRET，见 oauth-proxy/README.md。', 500);
  }

  const state = randomHex(16);
  const scope = env.GITHUB_SCOPE || 'public_repo,user';
  const redirectUri = `${url.origin}/callback`;

  const target = new URL(GITHUB_AUTHORIZE);
  target.searchParams.set('client_id', env.GITHUB_OAUTH_ID);
  target.searchParams.set('redirect_uri', redirectUri);
  target.searchParams.set('scope', scope);
  target.searchParams.set('state', state);

  return redirect(target.toString(), { 'set-cookie': setStateCookie(state) });
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

/** 把 token 交回打开弹窗的那个窗口。协议见 Decap 的 OAuth2 起搏页。 */
function relayPage(status, payload) {
  return html(`<!doctype html><meta charset="utf-8"><title>授权中</title>
<p>正在完成登录……如果这个窗口没有自动关闭，请回到原来的页面重试。</p>
<script>
  var status = ${JSON.stringify(status)};
  var payload = ${JSON.stringify(payload)};
  function send() {
    if (!window.opener) return;
    window.opener.postMessage('authorization:github:' + status + ':' + JSON.stringify(payload), '*');
  }
  window.opener.postMessage('authorizing:github', '*');
  window.addEventListener('message', send);
  setTimeout(send, 50);
  setTimeout(function () { window.close(); }, 8000);
</script>`);
}

async function handleCallback(request, url, env) {
  if (url.searchParams.get('provider') !== 'github' && url.pathname === '/callback') {
    // provider 是可选的；没有也继续，只要 code 存在
  }

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code) {
    const reason = url.searchParams.get('error_description') || url.searchParams.get('error') || '缺少 code';
    return html(`GitHub 授权失败：${String(reason)}`, 400);
  }

  const expected = readCookie(request, STATE_COOKIE);
  if (!expected || expected !== state) {
    return html('state 校验失败（可能是链接过期），请回主窗口重新点登录。', 400);
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
    },
    body: body.toString(),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    const desc = data.error_description || data.error || `HTTP ${res.status}`;
    return html(`换取 token 失败：${String(desc)}`, 502);
  }

  return relayPage('success', { token: data.access_token });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/auth') return handleAuth(url, env);
    if (url.pathname === '/callback') return handleCallback(request, url, env);

    if (url.pathname === '/') {
      return html(`<!doctype html><meta charset="utf-8"><title>Decap OAuth 代理</title>
<p>这是 Decap CMS 的 GitHub 登录代理，本身没有可看的内容。</p>
<p>健康检查：<a href="/auth?provider=github">/auth?provider=github</a></p>`);
    }

    return new Response('Not found', { status: 404 });
  },
};
