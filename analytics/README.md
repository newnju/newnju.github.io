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

## 部署

前置：Cloudflare 账号 + `oaking.kdns.fr` 已在你的账号里 active（`oauth-proxy` 已经用过这个 zone）。

```bash
cd analytics

# 1. 建库，把返回的 database_id 填进 wrangler.toml
npx wrangler d1 create site-stats

# 2. 建表
npx wrangler d1 execute site-stats --file=./schema.sql

# 3. 配密钥（终端不显示字符，正常）
npx wrangler secret put STATS_TOKEN        # 面板 / 接口的密码，自己想一个
npx wrangler secret put ALLOWED_ORIGIN     # 可选：允许打点的来源，默认 https://newnju.github.io
npx wrangler secret put IP_SALT            # 可选：IP 哈希的盐，换掉等于让历史去重失效
npx wrangler secret put RETENTION_DAYS     # 可选：明细保留天数，默认 180

# 4. 部署
npx wrangler deploy
```

拿到地址（形如 `https://stats.oaking.kdns.fr`）后，填进 `_config.yml`：

```yaml
analytics:
  visit_endpoint: "https://stats.oaking.kdns.fr/api/visit"
```

留空 = 全站不发任何统计请求（仓库当前就是留空状态，保持零追踪）。填上以后
`_includes/scripts.html` 才会输出 `<script … data-endpoint=…>`。

**别把 `STATS_TOKEN` 写进仓库**：`wrangler.toml` 里没有它，`git` 里也不会有。

## 看数据

```bash
# 面板（浏览器自己弹密码框，用户名随便填）
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
| `/stats` | GET | HTTP Basic（密码 = `STATS_TOKEN`） | 统计面板 |
| `/healthz` | GET | 无 | `{ok, db, token}` |

## 常见问题

| 现象 | 原因 |
| --- | --- |
| 面板有 PV、UV 一直是 1 | 同一个人多个标签页 / 同一 NAT 出口，算一个人是正常的 |
| 城市全是「—」 | Cloudflare 对部分 IP（尤其国内一些机房段）没有城市级 GeoIP，只能到国家 |
| 面板 401 | `STATS_TOKEN` 没配或与浏览器输入的不一致 |
| `{"error":"D1 未绑定"}` | `wrangler.toml` 里的 `database_id` 还是占位串，重填后重新部署 |
| 站点没请求 | `_config.yml` 的 `analytics.visit_endpoint` 还是空的（要重新构建部署才生效） |
| 数据里 `host` 是别的域名 | 有人拿你的端点刷别的站；`host` 列就是为此留的。要收紧就把 `ALLOWED_ORIGIN` 反过来校验 `Origin`/`Host` |

## 测试

```bash
node --test tests/analytics.test.mjs
```

用假的 D1 binding 跑，断言「到底往库里写了什么」：不落明文 IP、同一天同 IP 同哈希、
跨天哈希不同、查询串与搜索词被丢掉、referrer 只留域名、读接口必须要令牌、
定时任务按 `RETENTION_DAYS` 删旧行。
