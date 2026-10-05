# Decap 后台的 GitHub 登录代理（Cloudflare Worker）

`/admin/` 里的 Decap CMS 用 `github` 后端登录。如果直接让浏览器连 GitHub，会遇到两件事：

1. **CORS** —— GitHub 的 OAuth 交换 token 接口不允许浏览器直接跨域调用；
2. **secret 泄漏** —— `client_secret` 只要写进 `admin/config.yml` 就等于公开给所有人。

所以换 token 这一步必须放在服务端。这里就是一个零依赖的 Cloudflare Worker（`worker.js`，约 80 行），只做三件事：

| 路径 | 作用 |
| --- | --- |
| `GET /auth?provider=github` | 生成随机 `state` 写进 cookie，302 跳到 GitHub 授权页 |
| `GET /callback?code&state` | 校验 `state`，服务端用 client secret 换 access token，`window.opener.postMessage` 交回 Decap |
| `GET /` | 健康页，看到「Decap OAuth 代理在跑」就是通了 |

不落数据库、不记日志、不需要 `node_modules`，本地跑也不用装东西。

---

## 一、在 GitHub 建一个 OAuth App

1. 右上角头像 → **Settings** → 左侧最下面 **Developer settings** → **OAuth Apps** → **New OAuth App**
2. 填：
   - **Application name**：`newnju.github.io 后台`（随便，只是给你自己认）
   - **Homepage URL**：`https://newnju.github.io`
   - **Authorization callback URL**：`https://<你的 worker 域名>/callback`

   `worker 域名` 还没定的话先随便填一个（如 `https://decap-oauth.example.workers.dev/callback`），**第三步拿到真实地址后回来改**。GitHub 允许事后编辑，但**改完立即生效，不会给旧地址留缓冲**。
3. 点 **Register application**
4. 记下 **Client ID**，点 **Generate a new client secret** 记下 **Client secret**（只显示一次，关掉就看不到了）

## 二、部署 Worker

```bash
cd oauth-proxy
npx wrangler deploy
```

第一次会提示登录 Cloudflare（免费账号即可），然后输出一个 `https://decap-oauth.<你的账户>.workers.dev` 地址。

**把第一步的 callback URL 改成** `https://decap-oauth.<你的账户>.workers.dev/callback`。

## 三、把两个 secret 填进去

```bash
cd oauth-proxy
npx wrangler secret put GITHUB_OAUTH_ID      # 粘贴 Client ID，回车
npx wrangler secret put GITHUB_OAUTH_SECRET   # 粘贴 Client secret，回车
```

填完用 `npx wrangler secret list` 确认两条都在。

> 可选：默认申请的权限是 `public_repo,user`（能读写公开仓库 + 读用户信息）。
> 如果仓库是私有的，再加一个：
> `npx wrangler secret put GITHUB_SCOPE` → 填 `repo,user`。

## 四、把地址填回后台配置

打开 `admin/config.yml`，把这一行换成真实地址：

```yaml
backend:
  base_url: https://decap-oauth.<你的账户>.workers.dev
```

提交这个改动，`/admin/` 的登录就能用了。

## 本地调试

```bash
cd oauth-proxy
npx wrangler dev
# 然后访问 http://127.0.0.1:8787 看健康页
```

`admin/config.yml` 的 `base_url` 临时改成 `http://127.0.0.1:8787` 即可联调。

## 常见问题

| 现象 | 原因 |
| --- | --- |
| 点登录后弹窗一闪就关 / 控制台报 `state` 不匹配 | OAuth App 的 callback URL 和 Worker 实际地址对不上；Cookie 在 `http://127.0.0.1` 下也发不出去，**本地必须走 `npx wrangler dev`** |
| GitHub 报 `redirect_uri mismatch` | 同上，回去核对 callback URL，注意结尾必须是 `/callback` |
| 能登录但 push 报 403 | 权限不够：私有仓库要设 `GITHUB_SCOPE=repo,user` |
| Worker 500 | `GITHUB_OAUTH_ID` / `GITHUB_OAUTH_SECRET` 没填或填错，`npx wrangler secret list` 核对 |

> 这个 Worker 只服务于本站后台，改完 `worker.js` 重新 `npx wrangler deploy` 即可，站点本身不受影响。
