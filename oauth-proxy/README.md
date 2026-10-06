# Decap 后台的 GitHub 登录代理（Cloudflare Worker）

`/admin/` 里的 Decap CMS 用 `github` 后端登录。如果直接让浏览器连 GitHub，会遇到两件事：

1. **CORS** —— GitHub 的 OAuth 交换 token 接口不允许浏览器直接跨域调用；
2. **secret 泄漏** —— `client_secret` 只要写进 `admin/config.yml` 就等于公开给所有人。

所以换 token 这一步必须放在服务端。这里就是一个零依赖的 Cloudflare Worker（`worker.js`，约 80 行），只做三件事：

| 路径 | 作用 |
| --- | --- |
| `GET /auth?provider=github` | 生成随机 `state` 写进 cookie，302 跳到 GitHub 授权页。**白名单没配就 503 直接拒绝** |
| `GET /callback?code&state` | 校验 `state` → 服务端换 token → **用 token 查一次 `/user` 确认在白名单里** → `postMessage` 交回 Decap，然后作废 state cookie |
| `GET /healthz` | 只回 `{ok, allowlist}`，不回白名单内容、不回任何密钥 |
| `GET /` | 健康页，看到「Decap OAuth 代理在跑」就是通了 |

不落数据库、不记日志、不需要 `node_modules`，本地跑也不用装东西。

---

## 安全边界：这个 Worker 是后台唯一的门

先说清楚一件事：**能不能真的改内容，最后由 GitHub 的仓库权限决定**。这个 Worker
只是把 OAuth 流程走完，push 用的是**登录者自己的 token** —— 一个跟你毫无关系的
GitHub 账号走完流程会拿到它自己的 token，push 到 `newnju/newnju.github.io` 时
GitHub 会直接 403。所以「随便一个人登录就能改你的站」这条路本来就是堵着的。

那它还是缺什么呢？缺的是**门本身不该对全世界开着**。一个只有 client_id/secret 的
代理，对任何拿着任意 GitHub 账号的人都是可用的：它会用你的 secret 换出一个 token
并交到对方手上，于是这个 Worker 变成一个对全网开放的换 token 中转站，而你的
OAuth App 会出现在每个人的 GitHub 设置里。所以：

| 措施 | 为什么 |
| --- | --- |
| **白名单 `ALLOWED_GITHUB_USERS`，且强制** | 只有名单里的 GitHub 用户名能登录。服务端拿新换到的 token 调一次 `GET /user` 校验，**在把 token 交出去之前**；名单为空时 `/auth` 直接 503 —— 宁可登录不了，也不默认对全网开放 |
| **postMessage 锁死 `targetOrigin`** | 原来写的是 `'*'`。那样任何打开了本窗口的页面（钓鱼页 `window.open` 一次然后等消息）都能收走这个 token。现在发往 `SITE_ORIGIN`，且 opener 的 origin 不是本站就根本不发 |
| **交 token 的页面不缓存、不可被套 iframe** | `no-store` + `nosniff` + `X-Frame-Options: DENY` + CSP 把外部资源全禁掉（`default-src 'none'`，只留内联脚本） |
| **`state` cookie 用完就清** | 成功、失败、state 不匹配三条路都发 `Max-Age=0`，10 分钟内重放同一个 state 不成立 |
| **每次尝试都记一行结构化日志** | 谁、什么时候、从哪个 IP、哪个国家/城市、成功还是被白名单挡下 |

### 部署后请确认的两件事

1. **白名单到位**（不配后台就是登不进去，这是故意的）：在仓库
   **Settings → Secrets and variables → Actions** 里填 `OAUTH_ALLOWED_USERS`
   （自己的 GitHub 用户名，多个用逗号隔开），重跑 Workers workflow，然后
   ```bash
   curl https://oauth.oaking.kdns.fr/healthz     # {"ok":true,"allowlist":true}
   ```
   `allowlist:false` 就是它还没同步上。
2. **GitHub 给 `main` 开了分支保护**：Settings → Branches → Add rule
   （或 Rules → Rulesets）。建议勾上 *Require status checks to pass*，把
   `check` / `build` 两个 job 加进去；再打开 *Do not allow bypassing the above settings*。
   理由见下面「改了东西会怎样上线」。

### 改了东西会怎样上线

`admin/config.yml` 是 `publish_mode: simple`，所以后台每次保存都**直接 push 到 `main`**。
兜底是 CI：`.github/workflows/pages.yml` 的 `deploy` 依赖 `build` 依赖 `check`，
而 `check` 里串了五道闸门（validate / check:content / check:structure / npm test /
check:links / check:behavior / screenshots）—— 任一道红，**部署就不会发生**，线上继续是
上一个版本。

也就是说：**后台能改坏东西，但改坏的版本上不了线**。代价是内容已经进了 `main`
（git 里能看到那条 commit，Decap 用的是登录者的身份，提交作者就是他），要修就得再
提交一次或 revert 那一条。

想要更强的闸门，可以把 `publish_mode` 换成 `editorial_workflow`（走 PR，要合并才上线），
代价是每次改多一步合并操作。

### 审计记录

每次登录尝试（开始 / 成功 / 被白名单挡下 / state 不匹配 / 换 token 失败 / 查不到身份）
都写一行 JSON 到 Workers Logs，默认留 3 天。要留更久就在 `wrangler.toml` 里加一个
Analytics Engine 绑定，然后推 main（部署走 CI）：

```toml
[[analytics_engine_datasets]]
binding = "AUDIT"
dataset = "admin_audit"
```

配了 `AUDIT` 之后，每次尝试还会额外写一个数据点（`event` / `user` / `ip` / `country` /
`city` / `ts`），可以在 Cloudflare 的 GraphQL Analytics 里按 `admin_login_ok` 这类
index 查长期历史。不配也不影响登录。

### 想再收紧一层

Cloudflare Access（Zero Trust）在 `oauth.oaking.kdns.fr` 前面加一层你自己的邮箱
登录。这样连 OAuth 弹窗都只对你自己开放，日后加协作者时也可以只放行特定邮箱。
免费额度够用，代价是多一次登录。

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

## 二、让 GitHub 来部署（不再在本机跑 wrangler）

`wrangler deploy` 需要 Cloudflare 的 API token，而那个 token **只能由你在 Cloudflare 后台点出来**
（它等于把部署权限交给这个仓库），没法写进仓库。所以 token 放在 GitHub Secrets 里，
由 [`.github/workflows/workers.yml`](.github/workflows/workers.yml) 使用 —— 部署动作发生在
GitHub 上，你只要改完 `oauth-proxy/**` 推 main 就行。

**一次性准备：**

1. Cloudflare 后台 → My Profile → API Tokens → Create Token
   权限选 **Workers Scripts: Edit** + **D1: Edit**（analytics 也要用 D1）+ **Account: Read**。
   生成后复制那串 token。
2. 仓库 **Settings → Secrets and variables → Actions → New repository secret**，加这几个
   （名字必须完全一致）：

   | Secret | 值 |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | 上一步的 token |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 id（后端首页右侧，或 API `https://api.cloudflare.com/client/v4/accounts`） |
   | `OAUTH_GITHUB_ID` | GitHub OAuth App 的 Client ID（第一节生成的） |
   | `OAUTH_GITHUB_SECRET` | Client secret（只显示一次，丢了就 Regenerate） |
   | `OAUTH_ALLOWED_USERS` | 白名单，逗号分隔，例如 `newnju`。**留空的话 workflow 会拒绝部署** |

   可选的普通变量（Settings → Variables，不是 Secrets）：`SITE_ORIGIN`（默认 `https://newnju.github.io`）。
3. 推 main，或在 Actions 页手动触发 **Workers**。跑完会用
   `https://oauth.oaking.kdns.fr/healthz` 自检，应看到 `{"ok":true,"allowlist":true}`。

workflow 每次会做三件事：先跑 `tests/oauth-proxy.test.mjs`（不过就不部署）→ `wrangler deploy`
→ 把上面几个密钥同步到 Worker（`secret put`，值为空就跳过、保留线上原值）。
**同步顺序是先发代码再给密钥**：白名单没到位之前，线上跑的还是旧 Worker，不受影响。

<details>
<summary>想在自己机器上部署（备用路径）</summary>

```bash
cd oauth-proxy
npx wrangler login
npx wrangler secret put GITHUB_OAUTH_ID
npx wrangler secret put GITHUB_OAUTH_SECRET
npx wrangler secret put ALLOWED_GITHUB_USERS   # 不配 = 后台登不进去（默认拒绝）
npx wrangler deploy
```

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
推 main 即可，Worker 本身不用动。

</details>

## 三、密钥同步的顺序与影响

CI 里是「先 `wrangler deploy` 再 `secret put`」，所以：

- 白名单还没进 Secrets 时，**workflow 会在部署之前就中止**（第二节第 2 步的表格里那一行），
  不会出现「代码上去了、白名单没有、后台登不进去」的中间态；
- 万一真出现登录失败，先看 `https://oauth.oaking.kdns.fr/healthz`：
  `{"ok":true,"allowlist":false}` 就是白名单没到位，去 Secrets 补 `OAUTH_ALLOWED_USERS`
  再重跑一次 workflow；
- `secret put` 传空值会**把线上的值清掉**，所以 workflow 里的 `put()` 对空值一律跳过
  （保留线上原值）。要改某个值就在 Secrets 里改，然后重跑 workflow。

> 默认申请的权限是 `public_repo,user`（能读写公开仓库 + 读用户信息）。
> 仓库若是私有的，把 `worker.js` 里的 `GITHUB_SCOPE` 默认值改成 `repo,user`
> （或加一个 `GITHUB_SCOPE` secret）。

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
| Actions 的 Workers 报 `::error::仓库 Secrets 里还缺 …` | GitHub Secrets 没配全，见第二节的一次性准备 |
| 点登录后弹窗一直转圈 | `base_url` 用了 `*.workers.dev`。那个域名在部分网络下被按 SNI 丢包，重试和换 DNS 都没用，必须用自定义域名（见第二节） |
| 点登录后弹窗一闪就关 / 控制台报 `state` 不匹配 | OAuth App 的 callback URL 和 Worker 实际地址对不上 |
| GitHub 报 `redirect_uri mismatch` | 同上，回 GitHub 核对 callback URL，注意结尾必须是 `/callback`，且要和 `wrangler.toml` 里的 `route.pattern` 一致 |
| 浏览器控制台报 CORS | `base_url` 写成了 `https://` 开头以外的形式，或少了 `auth_endpoint: auth` |
| 能登录但 push 报 403 | 权限不够：私有仓库要设 `GITHUB_SCOPE=repo,user` |
| Worker 500 | `GITHUB_OAUTH_ID` / `GITHUB_OAUTH_SECRET` 没同步上，看 Actions 日志里 `secret … 已同步` 那几行 |
| 点登录就报「服务端还没配 ALLOWED_GITHUB_USERS」 | 白名单没到位。这是默认拒绝，去 Secrets 补 `OAUTH_ALLOWED_USERS` 再重跑 workflow |
| 提示「不在本站后台的白名单里」 | 登录的 GitHub 账号不在名单里。大小写不敏感，但要写**用户名**（不是昵称/邮箱） |
| 部署跑完但登录还是旧行为 | 代码没推 main（workflow 只在 push 到 main 时部署），或浏览器缓存了 `/auth` 的 302 |
| 自定义域名报「zone 不在此账号」 | `wrangler.toml` 里的 `zone_name` 要和 Cloudflare 里 zone 的名字完全一致，且该 zone 状态为 active |

## 测试

```bash
node --test tests/oauth-proxy.test.mjs
```

全程离线（GitHub 那两个端点用假 fetch 顶掉），断言的是「门」的行为：白名单没配时
`/auth` 拒绝且不出网、鉴权在 token 之前、白名单外的响应里绝不出现 token、
postMessage 不许出现 `'*'`、token 页面不缓存不可被套 iframe、state 用完即废、
`/healthz` 不泄露白名单。改 `worker.js` 之后先跑这个 —— CI 的 Workers workflow
也会先跑它，不过就不部署。

> 这个 Worker 只服务于本站后台，改完 `worker.js` 推 main 即可，站点本身不受影响。
> `workers_dev = true` 保留着，方便 `npx wrangler dev` 本地调试；它不影响自定义域名。
