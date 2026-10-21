# Lighthouse 基线（2026-10-20）

对线上 https://newnju.github.io 的第一次本地 Lighthouse 记录。之后的改动
可以跑同一套命令与它对比（性能、可访问性），差异超过噪声幅度再谈回归。

## 方法

- 工具：`npx lighthouse@12.8.2`（Node 24.15.0），浏览器用 Playwright 的
  chromium-1243（本机没有独立 Chrome，`CHROME_PATH` 指到它）。
- 无头启动：`--chrome-flags="--headless=new --no-sandbox --disable-gpu"`。
- 均为默认 mobile 模拟（4G 节流）。`--max-wait-for-load=120000`。
- 网络走本机代理，速度不稳：两次 run 都有
  `The page loaded too slowly to finish within the time limit. Results may be
  incomplete.` 警告 —— 因此分数的**小数点后波动正常**，重点看跨版本的方向。

完整原始报告：`docs/lighthouse-home.json`、`docs/lighthouse-cv.json`。

## 复现

```powershell
$env:CHROME_PATH = "$env:LOCALAPPDATA\ms-playwright\chromium-1243\chrome-win64\chrome.exe"
Set-Location E:\newnju.github.io
npx --yes lighthouse@12 https://newnju.github.io/ --output=json --output-path="E:/newnju.github.io/docs/lighthouse-home.json" --chrome-flags="--headless=new --no-sandbox --disable-gpu" --quiet --max-wait-for-load=120000
npx --yes lighthouse@12 https://newnju.github.io/cv/ --output=json --output-path="E:/newnju.github.io/docs/lighthouse-cv.json" --chrome-flags="--headless=new --no-sandbox --disable-gpu" --quiet --max-wait-for-load=120000
```

## 分数

| 页面 | 性能 | 可访问性 | 最佳实践 | SEO |
| ---- | ---- | -------- | -------- | --- |
| `/`（首页） | **75** | **89** | 100 | 100 |
| `/cv/`（履历） | **92** | **85** | 100 | 100 |

同日早些的一次试跑（部署 `bb5371f` 之前、被 han-print 递归挡住的线上版）
首页分数是 性能 91 / 可访问性 89 —— 性能从 91 掉到 75 差的主因是那次 TBT
只有 170 ms 而正式基线 760 ms，属于本机加载超时后的噪声放大，不是站点
回退（cv 页同一时刻 TBT 只有 10 ms）。**判断回归要横向比较多页，别只看单页
单次。**

## 核心指标（mobile 4G，同环境）

| 指标 | / | /cv/ |
| ---- | ---- | ---- |
| First Contentful Paint | 2.0 s | 2.4 s |
| Largest Contentful Paint | 2.1 s | 2.5 s |
| Total Blocking Time | 760 ms（试跑 170 ms） | 10 ms |
| Cumulative Layout Shift | 0.002 | 0 |
| Speed Index | 5.0 s | 4.4 s |

## 可访问性扣分（两页相同的三项）

1. `button-name`（0 分）：masthead 的汉堡按钮 `<nav#site-nav > button`
   没有可访问名称。最快的修法是给它一个 `aria-label`。
2. `color-contrast`（0 分）：`.han-cv-date` 的浅色日期字、侧栏「关注」按钮、
   页脚的版权链接与统计文案等多处低于 4.5:1。多数是主题刻意做淡的小字，
   修的时候把 `_han.scss` 里相关字色加深一档即可。
3. `heading-order`（0 分）：首页「荣誉」小节里 `archive__item-title` 的 h3
   跳过了上一级 —— 是 archive 列表模板的层级，改它动的面广，先记录。

## 性能注记

- LCP 2.1–2.5 s、CLS ~0：底子好；扣分集中在 TBT 与 Speed Index——
  Speed Index 高与首屏字体/渲染链相关（宋体族 + 全站 CSS），属于
  「主题性慢」，后续可以从 fonts 子集与 `font-display` 慢慢抠。
- 本机环境加载超时警告会放大 TBT/SI，跨版本对比时注意换网络重跑。

## 2026-10-21 起：这份基线由 CI 替人盯着

`tools/check-lh.mjs` 在 build 关把 `_site` 起成本地服务，对 `/` 与 `/cv/`
各跑一次 Lighthouse（同口径：默认 mobile 4G 模拟节流），分数低于
「本文档基线 − 5」的地板就红 —— 地板数字落在工具顶部的 `PAGE_FLOORS`。

- 本文档的分数仍是 **Lighthouse 12.8.2** 的记录；构建机现在装的是
  **Lighthouse 13**。12→13 的算法另定，绝对分数允许搬家：只要 CI 的
  首轮跑分不低于地板即视作守住了底线，哪天地板整体偏高/偏低，就重跑
  一轮校准、把**分数表与地板一起**按新引擎的实际值更新。
- 同一版本内比较才算数：怀疑真回归时，在同一环境重复两次，连续两红
  才算（单次抖动参照上文试跑的教训）。
- 本机 Windows 无法跑这道关（沙箱里完整 chrome 起不来，Playwright 默认
  的 headless-shell 又缺 Storage 配额子系统，Lighthouse 13 的 prepare
  阶段会在它身上挂）；CI（ubuntu，`CHROME_PATH` 指向 Playwright 缓存里的
  完整 chromium，由 chrome-launcher 拉起）是这道关的主场。
