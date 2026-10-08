# 访客统计（Cloudflare Worker + D1，零依赖）

自己搭一套最小可用的访客统计：每次打开页面记一行 —— **时间、明文 IP、Cloudflare GeoIP
按 IP 推断的国家/省/市/邮编/时区/ASN/机房、页面路径、来源站点、设备与浏览器**，
然后能按天/页面/国家/城市查人数，也能在面板里按 IP 回查明细。

## 为什么不用现成的

| 方案 | 为什么不行 |
| --- | --- |
| GitHub Pages 自己的访问日志 | Pages 是纯静态托管，没有服务端日志可读 |
| Cloudflare Web Analytics（免费） | 只给国家，不给城市；拿不到 IP；而且 `newnju.github.io` 走的是 GitHub 的 CDN，不过你的 Cloudflare zone，连埋点都不生效 |
| Google Analytics | 本站一直没接（`_config.yml` 的 `analytics.provider` 是 `false`），而且它是第三方脚本、要 cookie，与本站「零追踪」的现状冲突 |
| Umami / Plausible 等 | 仍是第三方脚本，要放行域名、要 cookie，隐私口径上没比这套好 |

**这套的特点**：代码在你自己账号下、零第三方脚本、零 cookie；明细里有 IP，**面板
（`/stats`）与同源的 CSV 导出不设密码、点开就看**（站长的口径选择，等于把 access log
摆在这自己的域名下），公开页脚走的 `/api/summary` 与免鉴权接口永远只有合计数，过期行
自动删。代价是 GitHub Pages 没有服务端，所以访问数据必须由页面里的第一方脚本主动送
过来（`assets/js/visit.js`）。

## 隐私与数据口径（先看这段）

访客数据是个人信息，境内还要过《个人信息保护法》。这套东西的定位等价于**你自己服务器
的 access log**：你既是控制者，明细只进你自己的域名，且不无限保留。具体口径：

| 存 | 不存 |
| --- | --- |
| 路径（只有 `pathname + hash`，**查询串在前端就丢掉了**） | 完整 referrer URL（只留域名，完整 URL 里常有搜索词） |
| 明文 IP（`visits.ip`，出现在 `/stats` 面板与 `/stats.csv` 导出 —— **两者都是公开的**） | User-Agent 原文（比 IP 更能识别设备，只粗分成设备/浏览器） |
| 国家 / 省 / 城市 / 邮编 / 时区 / 经纬度 / ASN / 接入机房（Cloudflare 自带 GeoIP 按 IP **推断**，不是精确定位，零第三方 SDK） | 任何 cookie / localStorage / 广告标识（访客侧） |
| `ip_hash`（UV 去重口径）与界面语言 | 公开页脚与免鉴权接口 `/api/summary` 里的 IP、维度、明细路径 |

`ip_hash = SHA-256(IP + 当天日期 + IP_SALT)` 取前 16 位。**掺当天日期**是刻意的：
同一个人的哈希逐日不同，所以既能在当天算独立访客数（UV），又无法把他在不同天的
两次访问串成一个人 —— 去重从来不靠明文 IP。明文 IP 留着只是给你回查「这行是谁刷的」；
`RETENTION_DAYS`（默认 180 天）到期由定时任务**连行删除**（删除前先按路径累计进
`lifetime_path`，页脚的累计口径不会往回掉）。**面板不设密码是刻意的取舍**：方便随时点开
就看，代价是知道这个地址的人都能看到明细 IP；如果你更在意后者，把 `/stats` 的路由加回
鉴权即可（git 历史里有现成的密码流程实现）。

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
   | `STATS_TOKEN` | `/api/stats` JSON 口的令牌，自己想一个（面板已公开，用不到它） |

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
# 面板：公开，点开就看（不设密码、不需要 cookie 或 ?key=）
# 旧地址 /login 一律 302 回这里
https://stats.oaking.kdns.fr/stats

# JSON，给脚本用（这个口仍要令牌）
curl -H "Authorization: Bearer <STATS_TOKEN>" "https://stats.oaking.kdns.fr/api/stats?days=30"

# 明细 CSV 导出（与面板一样公开；含 IP 与全部地址推断字段）
curl "https://stats.oaking.kdns.fr/stats.csv?days=30" -o visits.csv

# 健康检查：只说绑定有没有配，不泄露密钥
curl https://stats.oaking.kdns.fr/healthz
```

面板是分析工作台版式：左侧栏分区锚点，顶栏有时间范围切换（7 / 30 / 90 / 365 天，
`?days=N`）与 CSV 导出按钮；主体是关键指标卡（PV / UV / 今日 / 覆盖面）、PV-UV 趋势
SVG、设备构成环形图、地域（国家 / 省 / 城市）与来源 / 浏览器 / 语言三栏卡片、页面
排行 Top 25，最后是**访客明细表**（最近 50 条：时间、页面、明文 IP、推断位置、
ASN·机房、设备·浏览器、来源、语言）。整页服务端渲染、零 JS，CSP 依旧
`default-src 'none'`。`?days=N` 可以改范围（1–365）。配色沿用主站「汉 · 南大紫」
（宣纸底 `#fbf8f1` + 南大紫 `#5C2E83` + 鎏金 `#c8a45c`，标题衬线）。

「人数」的口径是 **按天去重的 UV**：同一天同一个 IP 算一个人；跨天不合并 ——
因为哈希里掺了日期，跨天本来就无法关联（见上面隐私设计）。

### 站内显示（页脚计数与文章阅读数）

网页上想直接看到数字走公开的 `/api/summary`：

```bash
curl "https://stats.oaking.kdns.fr/api/summary"                    # {pv, today_pv, today_uv, generated_at}
curl "https://stats.oaking.kdns.fr/api/summary?path=/cv/"          # 多回 {path, page_pv}
```

- **只回计数**：国家、城市、来源、语言这些维度一概不带 —— 这个接口免鉴权，
  带维度就等于在页脚上摊开明细（维度在面板、CSV 与要令牌的 `/api/stats` 里才有）。
  `STATS_TOKEN` 不进前端。
- 页脚「本站访问量 · 今日 · 今日访客 · 统计详情」在 `_includes/footer.html`
  （「统计详情」链到 `/stats` 面板，公开直开；**不再需要密码，也没有 `/login`**，
  旧收藏夹里的 `/login` 会 302 回面板），
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
| `/api/stats?days=30` | GET | `Authorization: Bearer <STATS_TOKEN>`（也认 Basic 密码半段与 `?key=`，给 curl） | 统计 JSON |
| `/api/summary` | GET | 无（**公开**，只回计数） | 站内显示用：`pv`（累计）、`today_pv`、`today_uv`；带 `?path=` 时多回该页的 `page_pv`。**不含任何维度**（国家/城市/来源一概没有），60 秒缓存 |
| `/stats` | GET | 无（**公开，点开就看**） | 统计面板（工作台仪表盘：指标卡、趋势/构成 SVG、地域与来源、页面排行、含 IP 的访客明细） |
| `/stats.csv?days=30` | GET | 无（**公开**，与面板一致） | 明细 CSV 导出（10000 行内：时间、路径、IP、地址推断字段、设备、浏览器、来源、语言）；GET/HEAD 之外 405 |
| `/login` | 任何方法 | 无 | 旧地址兼容：一律 302 `/stats`（密码流程已下线，不再有表单与会话 cookie） |
| `/healthz` | GET | 无 | `{ok, db, token}` |

## 常见问题

| 现象 | 原因 |
| --- | --- |
| Actions 报 `::error::仓库 Secrets 里还缺 …` | GitHub Secrets 没配全，见上面的部署清单 |
| 面板有 PV、UV 一直是 1 | 同一个人多个标签页 / 同一 NAT 出口，算一个人是正常的 |
| 城市全是「—」 | Cloudflare 对部分 IP（尤其国内一些机房段）没有城市级 GeoIP，只能到国家 |
| `/api/stats` 返回 401 | 没带 `Authorization: Bearer <STATS_TOKEN>`（这个口仍要令牌；面板是公开的，不走它） |
| `{"error":"D1 未绑定"}` | 首次部署建库那步失败了；看 Actions 日志里 Cloudflare API 的返回 |
| 站点没请求 | `_config.yml` 的 `analytics.visit_endpoint` 还是空的（要重新构建部署才生效） |
| 数据里 `host` 是别的域名 | 有人拿你的端点刷别的站；`host` 列就是为此留的。要收紧就把 `ALLOWED_ORIGIN` 反过来校验 `Origin`/`Host` |

## 测试

```bash
node --test tests/analytics.test.mjs
```

用假的 D1 binding 跑，断言「到底往库里写了什么」：明文 IP 与 GeoIP 扩展字段
（continent/postal/tz/colo…）都落库、同一天同 IP 同哈希、跨天哈希不同、查询串与
搜索词被丢掉、referrer 只留域名、读接口必须要令牌、面板与 CSV 免凭据直出
（`/login` 一律 302 回面板、不发任何 cookie）、定时任务按 `RETENTION_DAYS` 删旧行。
