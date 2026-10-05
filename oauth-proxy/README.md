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
   - **Homepage URL**：`https://oauth.oaking.kdns.fr`
   - **Authorization callback URL**：`https://oauth.oaking.kdns.fr/callback`

     必须是 Worker 的真实地址，且**结尾要有 `/callback`**（`worker.js` 用 `${url.origin}/callback` 反推 redirect_uri）。
     填错的话 GitHub 会直接报 `redirect_uri mismatch`。
3. 点 **Register application**
4. 记下 **Client ID**（`Iv1.` 开头那串），点 **Generate a new client secret** 记下 **Client secret**
   —— secret **只显示一次**，关掉就看不到了，只能 Regenerate

## 二、部署 Worker

```bash
cd oauth-proxy
npx wrangler deploy
```

第一次会提示登录 Cloudflare（免费账号即可），然后输出：

```
https://decap-oauth.hidiamond.workers.dev
oauth.oaking.kdns.fr (custom domain - zone name: oaking.kdns.fr)
```

### ⚠️ 必须用自定义域名，不要用 workers.dev

`workers.dev` 在部分网络下**完全不可达**，而且这不是配置问题：

| 现象 | 实测 |
| --- | --- |
| 系统 DNS 查 `workers.dev` | 返回 `111.243.214.169` / `199.59.148.246`（都是中国电信地址，不是 Cloudflare） |
| 多次重试 | 每次都是同一个假地址，重试无用 |
| DoH（`cloudflare-dns.com`、`dns.google`、`1.1.1.1:53`） | 全部空响应 / 超时 |
| 手动 hosts 指向真实 Cloudflare IP + 正确 SNI | 仍然连不上（`000`） |
| 同一手法访问 `api.cloudflare.com` | 正常 |

也就是说**不只是 DNS 假地址，整条 `workers.dev` 流量按 SNI 被丢弃**，换 DNS、改 hosts、直连 IP 全部无效。
GitHub OAuth App 的 callback 一旦填成 `*.workers.dev`，后台登录弹窗就会一直转圈。

所以 `wrangler.toml` 里挂了自定义域名：

```toml
route = { pattern = "oauth.oaking.kdns.fr", zone_name = "oaking.kdns.fr", custom_domain = true }
```

前提是这个 zone 已经托管到 Cloudflare（NS 指向 `*.ns.cloudflare.com`）。换域名时改这一行重新
`npx wrangler deploy` 即可，Worker 本身不用动。

## 三、把两个 secret 填进去

```bash
cd oauth-proxy
npx wrangler secret put GITHUB_OAUTH_ID      # 粘贴 Client ID，回车
npx wrangler secret put GITHUB_OAUTH_SECRET   # 粘贴 Client secret，回车
```

粘贴时终端**不显示任何字符**（防肩窥，正常现象）。填完用 `npx wrangler secret list` 确认两条都在。

> 可选：默认申请的权限是 `public_repo,user`（能读写公开仓库 + 读用户信息）。
> 如果仓库是私有的，再加一个：
> `npx wrangler secret put GITHUB_SCOPE` → 填 `repo,user`。

## 四、地址已经填好了

`admin/config.yml` 的 `backend.base_url` 已经指向 `https://oauth.oaking.kdns.fr`，
仓库里**不含** Client ID 和 secret（只在 Cloudflare 的 secret 里），所以可以放心公开。

打开 <https://newnju.github.io/admin/> → **Sign in with GitHub** 即可。

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
| 点登录后弹窗一直转圈 | `base_url` 用了 `*.workers.dev`。那个域名在部分网络下被按 SNI 丢包，重试和换 DNS 都没用，必须用自定义域名（见第二节） |
| 点登录后弹窗一闪就关 / 控制台报 `state` 不匹配 | OAuth App 的 callback URL 和 Worker 实际地址对不上 |
| GitHub 报 `redirect_uri mismatch` | 同上，回 GitHub 核对 callback URL，注意结尾必须是 `/callback`，且要和 `wrangler.toml` 里的 `route.pattern` 一致 |
| 浏览器控制台报 CORS | `base_url` 写成了 `https://` 开头以外的形式，或少了 `auth_endpoint: auth` |
| 能登录但 push 报 403 | 权限不够：私有仓库要设 `GITHUB_SCOPE=repo,user` |
| Worker 500 | `GITHUB_OAUTH_ID` / `GITHUB_OAUTH_SECRET` 没填或填错，`npx wrangler secret list` 核对 |
| 自定义域名报「zone 不在此账号」 | `wrangler.toml` 里的 `zone_name` 要和 Cloudflare 里 zone 的名字完全一致，且该 zone 状态为 active |

> 这个 Worker 只服务于本站后台，改完 `worker.js` 重新 `npx wrangler deploy` 即可，站点本身不受影响。
> `workers_dev = true` 保留着，方便 `npx wrangler dev` 本地调试；它不影响自定义域名。
