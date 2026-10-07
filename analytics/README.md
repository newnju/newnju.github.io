# 访客统计（Cloudflare Worker + D1，零依赖）

自己搭一套最小可用的访客统计：每次打开页面记一行 —— **时间、IP（哈希）、国家、城市、
页面路径、来源站点、设备与浏览器**，然后能按天/页面/国家/城市查人数。

## 为什么不用现成的

| 方案 | 为什么不行 |
| --- | --- |
| GitHub Pages 自己的访问日志 | Pages 是纯静态托管，没有服务端日志可读 |
| Cloudflare Web Analytics（免费） | 只给国家，不给城市；拿不到 IP；而且 `newnju.github.io` 走的是 GitHub 的 CDN，不过你的 Cloudflare zone，连埋点都不生效 |
| Google Analytics | 本站一直没接（`_config.yml` 的 `analytics.provider` 是 `false`），而且它是第三方脚本、要 cookie，与本站「零追踪」的现状冲突 |
| Umami / Plausible 等 | 仍是第三方脚本，要放行域名、要 cookie，隐私口径上没比这套好 |

**这套的特点**：代码在你自己账号下、零第三方脚本、零 cookie、不存明文 IP。代价是
GitHub Pages 没有服务端，所以访问数据必须由页面里的第一方脚本主动送过来
（`assets/js/visit.js`）。

## 隐私设计（先看这段）

访客数据是个人信息，境内还要过《个人信息保护法》。所以默认按「能不存就不存」设计：

| 存 | 不存 |
| --- | --- |
| 路径（只有 `pathname + hash`，**查询串在前端就丢掉了**） | 明文 IP（只存 `ip_hash`，见下） |
| 国家 / 省 / 城市 / 经纬度 / ASN（Cloudflare 自带 GeoIP） | 完整 referrer URL（只留域名，完整 URL 里常有搜索词） |
| 设备大类与浏览器家族（chrome / safari …） | User-Agent 原文（比 IP 更能识别设备） |
| 界面语言 | 任何 cookie / localStorage / 广告标识 |

`ip_hash = SHA-256(IP + 当天日期 + IP_SALT)` 取前 16 位。**掺当天日期**是刻意的：
同一个人的哈希逐日不同，所以既能在当天算独立访客数（UV），又无法把他在不同天的
两次访问串成一个人。想「按 IP 查原始日志」时才把 `STORE_RAW_IP` 设成 `1` —— 那就等于
自建了一个个人数据处理者，要另行告知并提供访问/删除通道。

另外：`assets/js/visit.js` 会读 `navigator.doNotTrack` 与 `navigator.globalPrivacyControl`，
命中就**一个请求都不发**；服务端另外认一道 `DNT: 1` 的请求头，挡住手工绕过前端的调用。

## 部署（GitHub Actions，不在本机跑 wrangler）

`wrangler deploy` 需要 Cloudflare 的 API token，而那个 token **只能由你在 Cloudflare 后台点出来**
（它等于把部署权限交给这个仓库）。所以 token 放进 GitHub Secrets，部署由
[`.github/workflows/workers.yml`](../.github/workflows/workers.yml) 完成：改完 `analytics/**`
推 main 就自动部署，站点本身由 `pages.yml` 另行构建 —— 两者互不依赖。

**一次性准备：**

1. Cloudflare 后台建 API Token（权限 **Workers Scripts: Edit** + **D1: Edit** + **Account: Read**）。
2. 仓库 **Settings → Secrets and variables → Actions** 加这几个 Secret：

   | 名字 | 值 |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | 上一步的 token |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare 账号 id |
   | `STATS_TOKEN` | 统计面板 / 接口的密码，自己想一个 |

   可选的普通变量（Variables，不是 Secrets）：`ANALYTICS_ALLOWED_ORIGIN`（默认
   `https://newnju.github.io`）、`ANALYTICS_IP_SALT`、`ANALYTICS_RETENTION_DAYS`。

   > 跟 oauth-proxy 共用同一对 `CLOUDFLARE_*`，不用重复建。

3. 推 main（或在 Actions 页手动触发 **Workers**）。首次部署时 `wrangler.toml` 里的
   `database_id` 还是占位串，workflow 会**自动建库**、建表并把 id 填进 runner 上的副本，
   日志里会打一行 `新库 database_id=…` —— **把那串 id 提交回 `wrangler.toml`**，
   以后就不用再建了。
4. 部署完填站点开关，再推一次让 Jekyll 重新构建：

   ```yaml
   # _config.yml
   analytics:
     visit_endpoint: "https://stats.oaking.kdns.fr/api/visit"
   ```

   留空 = 全站不发任何统计请求（仓库当前就是留空状态）。`scripts.html` 据此决定要不要输出
   标签，所以**改这一行必须重新构建才生效**。

**别把 `STATS_TOKEN` 写进仓库**：`wrangler.toml` 里没有它，`git` 里也不会有。
`secret put` 传空值会清掉线上值，所以 workflow 里空值一律跳过。

<details>
<summary>想在自己机器上部署（备用路径）</summary>

```bash
cd analytics
npx wrangler login
npx wrangler d1 create site-stats        # 把 database_id 填进 wrangler.toml
npx wrangler d1 execute site-stats --file=./schema.sql
npx wrangler secret put STATS_TOKEN
npx wrangler deploy
```

</details>

## 看数据

```bash
# 面板：第一次打开会跳到 /login 密码页，输入 STATS_TOKEN 后下发
# HttpOnly+Secure+SameSite=Strict 的签名 cookie（30 天免登录）；
# 也仍认 HTTP Basic（curl -u）与 ?key=，旧收藏夹照旧能用
https://stats.oaking.kdns.fr/stats

# JSON，给脚本用
curl -H "Authorization: Bearer <STATS_TOKEN>" "https://stats.oaking.kdns.fr/api/stats?days=30"

# 健康检查：只说绑定有没有配，不泄露密钥
curl https://stats.oaking.kdns.fr/healthz
```

面板上有：PV / UV 总量、按天曲线（PV + UV）、页面 Top 25、国家、城市、来源、设备、语言。
`?days=N` 可以改范围（1–365）。

「人数」的口径是 **按天去重的 UV**：同一天同一个 IP 算一个人；跨天不合并 ——
因为哈希里掺了日期，跨天本来就无法关联（见上面隐私设计）。

### 站内显示（页脚计数与文章阅读数）

网页上想直接看到数字（不用输密码）走公开的 `/api/summary`：

```bash
curl "https://stats.oaking.kdns.fr/api/summary"                    # {pv, today_pv, today_uv, generated_at}
curl "https://stats.oaking.kdns.fr/api/summary?path=/cv/"          # 多回 {path, page_pv}
```

- **只回计数**：国家、城市、来源、语言这些维度一概不带 —— 这个接口免鉴权，
  带维度就等于把面板公开了。`STATS_TOKEN` 不进前端。
- 页脚「本站访问量 · 今日 · 今日访客 · 统计详情」在 `_includes/footer.html`
  （「统计详情」链到 `/stats` 面板：未登录时 Worker 自动 302 到 `/login`
  密码页，输一次密码 30 天内直开 —— **不再弹浏览器原生密码框**；公开页脚只放
  裸地址、不拼 `?key=` —— 带 key 的链接进了页面源码等于公开 `STATS_TOKEN`，
  收藏夹里自己留一条带 key 的即可），
  文章页「本文阅读 N 次」在 `_includes/han-page-views.html`（只对集合条目输出）；
  两块都初始 `hidden`，由 `assets/js/visit.js` 一次请求取回、填进 `[data-fill]`
  才揭开 —— 取不回来就不显示，绝不显示假 0。与打点同一个开关，`visit_endpoint`
  留空则整块不输出。
- 响应 `Cache-Control: public, max-age=60`，浏览器一分钟内不会重复打 D1。

## 维护

- **定时任务**：每天 UTC 03:17 删掉超过 `RETENTION_DAYS` 的明细，别让库无限长。
  想看某天的原始行：
  ```bash
  npx wrangler d1 execute site-stats --command "SELECT ts, path, country, city, device FROM visits ORDER BY id DESC LIMIT 20"
  ```
- **打点失败不影响访客**：端点是独立域名，脚本是 `async` 且全程 try/catch，
  端点挂了只是没有统计，页面照常（`tests/` 里有对应的浏览器行为测试）。
- **日志**：每次打点往 Workers Logs 写一行 JSON（`event: "visit"`），默认留 3 天。

## 端点

| 路径 | 方法 | 鉴权 | 作用 |
| --- | --- | --- | --- |
| `/api/visit` | POST | 仅限 `ALLOWED_ORIGIN` 来源 | 记一行访客数据 |
| `/api/stats?days=30` | GET | `Authorization: Bearer <STATS_TOKEN>` | 统计 JSON |
| `/api/summary` | GET | 无（**公开**，只回计数） | 站内显示用：`pv`（累计）、`today_pv`、`today_uv`；带 `?path=` 时多回该页的 `page_pv`。**不含任何维度**（国家/城市/来源一概没有），60 秒缓存 |
| `/stats` | GET | 会话 cookie（`/login` 下发）或 HTTP Basic（密码 = `STATS_TOKEN`）或 `?key=`；都没有 → 302 `/login` | 统计面板 |
| `/login` | GET | 无（已有有效 cookie 则 302 回 `/stats`） | 密码表单（`noindex`、无脚本、CSP 只允许本域提交） |
| `/login` | POST | 表单字段 `key` 等于 `STATS_TOKEN` | 校验通过 → `Set-Cookie: stats_sess=<exp>.<HMAC>`（HttpOnly/Secure/SameSite=Strict，30 天）→ 302 `/stats`；失败重新渲染表单、不下发 cookie |
| `/healthz` | GET | 无 | `{ok, db, token}` |

## 常见问题

| 现象 | 原因 |
| --- | --- |
| Actions 报 `::error::仓库 Secrets 里还缺 …` | GitHub Secrets 没配全，见上面的部署清单 |
| 面板有 PV、UV 一直是 1 | 同一个人多个标签页 / 同一 NAT 出口，算一个人是正常的 |
| 城市全是「—」 | Cloudflare 对部分 IP（尤其国内一些机房段）没有城市级 GeoIP，只能到国家 |
| 面板 401 | `STATS_TOKEN` 没配或与浏览器输入的不一致 |
| `{"error":"D1 未绑定"}` | 首次部署建库那步失败了；看 Actions 日志里 Cloudflare API 的返回 |
| 站点没请求 | `_config.yml` 的 `analytics.visit_endpoint` 还是空的（要重新构建部署才生效） |
| 数据里 `host` 是别的域名 | 有人拿你的端点刷别的站；`host` 列就是为此留的。要收紧就把 `ALLOWED_ORIGIN` 反过来校验 `Origin`/`Host` |

## 测试

```bash
node --test tests/analytics.test.mjs
```

用假的 D1 binding 跑，断言「到底往库里写了什么」：不落明文 IP、同一天同 IP 同哈希、
跨天哈希不同、查询串与搜索词被丢掉、referrer 只留域名、读接口必须要令牌、
定时任务按 `RETENTION_DAYS` 删旧行。
