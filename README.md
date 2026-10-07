# 武嘉文的学术主页

基于 [Academic Pages](https://github.com/academicpages/academicpages.github.io) 模板（Jekyll + GitHub Pages）搭建的个人学术主页，内容来自个人简历。

在模板之上加了几样东西：一套从汉代铜镜取色的自定义主题（明暗两套）、首页那张四神博局镜图式、一个由数据文件驱动的获奖时间轴、论文条目的 BibTeX 与引用复制、右侧的页面缩略图导航，以及一套可以逐条补齐的英文版。

---

## 一、仓库名与站点地址

已配置好，对应 GitHub 用户名 **`newnju`**，所以：

- 站点地址：<https://newnju.github.io>
- 仓库名必须是 **`newnju.github.io`**

`_config.yml` 里相关的三行已经填好：

```yaml
url        : https://newnju.github.io
repository : "newnju/newnju.github.io"
```

> **以后如果换了 GitHub 用户名**，需要同步改这三处：`_config.yml` 的 `url`、`repository`，
> 以及 `author:` 下的 `github:`（这一项决定左侧栏是否显示 GitHub 图标，现在是 `newnju`）。
> 同时记得在 GitHub 上把仓库改名。

---

## 二、从零部署（仅供参考）

站点已在 GitHub Pages 上线，日常改动看第四章即可。本节留作换仓库、换域名或重建时的参考。

### 1. 在 GitHub 上新建仓库

- 打开 <https://github.com/new>
- **Repository name** 必须填 `newnju.github.io`
- 可见性选 **Public**，**不要**勾选 "Add a README file"
- 点击 **Create repository**

### 2. 把本目录推上去

在本文件夹下打开终端（Git Bash / PowerShell 均可），依次执行：

```bash
git init
git add .
git commit -m "初始化个人学术主页"
git branch -M main
git remote add origin https://github.com/newnju/newnju.github.io.git
git push -u origin main
```

### 3. 打开 GitHub Pages

- 进入仓库 → **Settings** → 左侧 **Pages**
- **Source** 选择 **Deploy from a branch**
- **Branch** 选择 **main**，目录选择 **/ (root)**，点击 **Save**

### 4. 等待 1–3 分钟

访问 <https://newnju.github.io> 即可看到站点。首次构建通常需要 1–3 分钟，可在仓库的 **Actions** 标签页查看构建进度。

---

## 三、这套站点比模板多了什么

### 1. 汉·明 / 汉·暗 主题

配色取自汉代青铜镜与同期漆器，分两层，别混：

1. `_config.yml` 的 `site_theme: "han"` 选定主题文件（`_sass/theme/_han_light.scss` / `_han_dark.scss`），页面底色与默认品牌色在这里定义；
2. `<html data-color-theme>` 在其上覆盖品牌色，**当前默认 `"nju"`（南大紫）**，值写死在 `_layouts/default.html` 第 8 行，由 `_sass/_han.scss` 第 8 节生效。

所以**线上跑的是南大紫，不是铜锈绿**：

| 颜色 | 色值 | 用途 |
| --- | --- | --- |
| 南大紫 | `#5C2E83` | **nju（当前默认）**：链接、页面 base、镜图主色、当前导航项下划线、文字选中底色 |
| 鎏金 | `#c8a45c` | **nju（当前默认）**：链接悬停、标题左侧竖线、时间轴年份、国家级与国际级标签 |
| 铜锈绿 | `#2f6b5a` | **han**：`_han_light.scss` 里的 base 与链接色，`data-color-theme="han"` 时生效 |
| 朱砂 | `#9e2b25` | **han**：强调色（标题竖线、时间轴年份、国家级标签、链接悬停） |
| 宣纸 | `#fbf8f1` | 两种配色的页面底色（不是纯白） |
| 错金 | `#b08d3f` | **han**：国际级标签 |

- 明暗切换用右上角的太阳 / 月亮图标（跟随系统偏好，也可手动固定）；暗色下两套配色都自动提亮以保证可读性（han 的铜锈绿提到 `#7cbfa2`，nju 的南大紫提到 `#b794d4`）
- **想换配色**：改 `_layouts/default.html` 第 8 行的 `data-color-theme="nju"` 为 `"han"`。没有配色切换按钮（旧的调色板按钮已移除），`assets/js/han.js` 第 3 节只在启动时读 localStorage 里存过的 `color-theme`，读不到就用默认值
- **想改色值**：改 `_sass/theme/_han_light.scss` / `_han_dark.scss` 顶部那十几行，nju 配色的覆盖值改 `_sass/_han.scss` 第 8 节
- 镜图呼吸色与文字选中色在 `_sass/_han.scss` 里是写死的十六进制（`var()` 在关键帧内插值在较旧 Safari 上不可靠），换配色要同步改那几处
- 其余装饰（宋体标题、时间轴、BibTeX、打印样式）都在 `_sass/_han.scss`，这个文件刻意只写纯 CSS，改起来不用懂 Sass

### 2. 首页的博局镜纹样结构

`_includes/han-mirror.html` 是一张内联 SVG，按论文《四神博局镜与汉代宇宙观》里的实物拓片（国博藏新莽四神博局镜）与结构图绘制，各层半径按拓片实测比例定。

- 外区自外而内：**素缘 → 云气纹 → 锯齿纹 → 栉齿纹 → 铭文带 → 弦纹**
- 铭文取尚方镜常见吉语，**字头朝内**、字距紧密（与实物一致）
- 内区：镜钮 + 柿蒂纹钮座；双线方框内为**十二乳钉与十二辰铭相间**；方框外 **T 纹**在四边正中向外伸出、**反 L 纹**在四方轴线上且位于 T 纹之外、**V 纹**在四角且尖角朝镜心
- 图相对常规浮动位置**上移 30px**；大屏（≥925px，即主题的 `$large`）再**右移 80px**（`_sass/_han.scss` 第 2 节的 `top` 与紧随其后的媒体查询），更贴近页面右缘；窄屏（≤600px）上移归零、恢复居中
- 右移要设 925px 这道门槛，是因为该宽度起 `.page` 才用 `span(10 of 12) + suffix(2 of 12)`、正文栏右侧空出约 2/12 宽的空白栏，右移 80px 仍落在栏内（925px 时空栏约 150px，留 70 余 px 余量）；而 925px 以下 `.page` 占满整行，图离视口右缘只剩约 19px，硬移会把整页撑出横向滚动条（实测 700 / 900px 各溢出 40 余 px）
- 颜色随主题联动，并在五个色相间缓慢呼吸（一轮 18 秒）。nju 配色下依次为
  南大紫 → 紫罗兰 → 藕荷 → 鎏金 → 淡金，han 配色下为铜锈绿 → 靛青 → 鎏金 → 赭石 → 朱砂
- **外区分三圈反向旋转**（由 `_sass/_han.scss` 控制）：
    - 最外圈（素缘 + 云气纹）：顺时针，60 秒一圈，同时有极轻的呼吸感
    - 中间圈（锯齿纹 + 栉齿纹）：逆时针，45 秒一圈
    - 铭文带：顺时针，75 秒一圈
    - 内区（方框、TLV、乳钉、十二辰、镜钮）不转
- 旋转中心用 `transform-origin: center` 定位：三组都是圆环状，包围盒中心恰与镜心重合，
  因此在识别与不识别 `transform-box` 的浏览器上，旋转中心都落在正确位置
- 呼吸色值写死在 `@keyframes` 里（`var()` 在关键帧内的插值在较旧 Safari 上不可靠）。
  代价是**改色要同步四套关键帧**（han/nju × 明/暗），否则切换配色会出现色系错配
- **内区没有画四神** —— 272px 的尺寸下画不出可辨认的兽形。若要具象四神，可直接换成论文里那张拓片
- 纹饰直接写在 `_includes/han-mirror.html`，调纹饰改这个文件即可
- **想让某个页面也显示它**：在该页面的 front matter 里加一行 `mirror: true`

### 3. 获奖与荣誉时间轴（`/timeline/`）

数据全在 `_data/awards.yml`，页面是 `/timeline/`。加一条记录只要复制一段：

```yaml
- year: "2026"
  items:
    - text: "获奖名称"
      level: national     # international 国际 / national 国家级 / provincial 省级 / school 校级 / other 其他
      note: "颁发单位或事由"   # 可省略
      date: "2026.05"        # 可省略；填了就在首页「获奖」小节里带上这个日期
```

等级标签的颜色和文字（中英）都自动处理，不用碰 HTML。

其中带 `key: honours` 的那一组（显示名「荣誉」）会**单独渲染到首页的「荣誉」小节**，所以那几条就是主页上显示的内容；
其余年份分组则渲染到首页的「获奖」小节（紧凑版，不带等级标签）。首页与时间轴都按 `key` 取这一组，
所以改 `year` 的显示文字不会影响首页。条目的 `text_en`、补充说明的 `note_en` 与分组的 `year_en` 都是选填，英文页优先取它们、缺省回落中文。
首页的紧凑清单还会把条目 `date` 字段里的日期（如 `2025.11`）提到条目末尾，用浅色小字显示，中文加全角括号、英文加半角括号；不填 `date` 就不显示（现在只有茅家琦论坛那一条填了）。

### 4. 论文条目：BibTeX、引用复制与知网链接

**BibTeX** —— 在论文条目的 front matter 里加一个 `bibtex` 字段（YAML 块标量，多行照抄即可）：

```yaml
bibtex: |
  @article{wu2025sigods,
    author  = {武嘉文},
    title   = {四神博局镜与汉代宇宙观},
    journal = {华夏文化},
    year    = {2025},
    number  = {04},
    pages   = {27--32}
  }
```

论文列表页与条目详情页都会出现「复制 BibTeX」按钮和可展开的 BibTeX 框。没填 `bibtex` 的条目不显示任何东西，可以逐条慢慢补。

**点击标题复制引用** —— 期刊论文（`collection: publications` 且填了 `citation`）在列表页的标题
是复制按钮：点击即把 `citation` 字段写入剪贴板，标题短暂变为「已复制引用」。
`citation` 本身就是 GB/T 7714 格式，不需要另外维护一份文本。

脚本未执行时标题退化为普通链接，不会变成死链。

**知网链接** —— 加一个 `link` 字段，条目就会在「引用格式」行末尾多一个入口：

```yaml
link: "https://kns.cnki.net/kcms/detail/detail.aspx?dbcode=CJFD&filename=HXWH202504010"
```

本站两篇期刊论文用的是手机知网地址（`wap.cnki.net`），因为桌面版详情页在未登录时会强制跳登录页。
知网的文章标识是 `<期刊代码><年><期号两位><篇序三位>`，序号未知时枚举该期即可定位。

### 5. 页面缩略图导航（右侧 minimap）

宽屏（≥1200px）下页面右侧会出现一条缩略图，标出当前视口在整页中的位置，按住拖动或点击即可跳转。

实现方式是克隆整页 DOM，用 `transform: scale()` 缩进 100px 宽的窄条里，只动视口方块的位置，不触发重排。

**出现时机**：目标是「解析一结束就出现」。线上原本要 2.5 秒起步，外链慢时要十几秒（实测 14–19 秒），三处一起改：

- `_includes/scripts.html` 里 han.js 用 `async` 而不是 `defer`：defer 脚本严格按文档顺序执行，
  当时页脚里 defer 的 MathJax 来自 jsDelivr，一慢就把排在它后面的 han.js 一起拖住
  （MathJax 已在后续清理中删除，页脚不再加载它；但这条改动保留 —— 任何排在前面的慢
  defer 外链都会造成同样的拖累）；
- 脚本内部按「解析完成」起步（`whenParsed`：看 `readyState` 翻到 interactive），不等 `DOMContentLoaded`；
- 建图前只等**同源** `link[rel~="stylesheet"]`（`whenStyled`）：检查那一刻这类链接只有 head 里的
  main.css，同源样式一到就有；jsDelivr 的 academicons 跨域，被 `location.host` 这条判断直接跳过，
  不等它 —— 它只管图标字形，慢起来没边；另加 1.2 秒上限兜底，超时就先建，
  缺的图标由 `load` 后的重建补齐；
- 之后 `load` 再校正一次比例、`document.fonts.ready` 再一次（字体换了行高会变）。

离线镜像实测（当时把页脚的 MathJax 推迟 2.5 秒模拟慢外链；数字是其中一次运行，逐次有几毫秒浮动）：

| 组合 | 解析完 | load | 缩略图首次出现 |
| --- | --- | --- | --- |
| `defer` + 旧脚本（线上原状） | 15ms | 2557ms | 2562ms |
| `async` + 旧脚本 | 16ms | 2564ms | 2571ms |
| `async` + 现脚本 | 19ms | 2559ms | **369ms** |

第二行说明光把 `defer` 换成 `async` 没用 —— 旧脚本自己等 `load`，必须两边一起改。
末行同时验证了「首建时样式已就位」：克隆宽 132px ≈ 窄条 131px，且 `load` 之后又建了一次
（`建图=2次`，第二次是校正比例）。

**「按宽适配」的比例必须在 `appendChild` 之后量。** 缩放比取 `shell.clientWidth / 页面宽`，
而脱离文档的元素没有布局、`clientWidth` 恒为 0，于是 `|| 0.1` 这个兜底值会被一直用下去。
窄条固定 100px，只有视口恰好 1000px 时 `100 / 1000` 才等于 0.1：再宽缩略图比窄条宽、
右缘被裁（1440px 时裁掉约 45px），再窄则右侧留白。所以先 `document.body.appendChild(shell)`
再量宽度 —— 窄条是 `position: fixed`，不参与排版，这一步不会改变随后量到的页面宽高。
改动后实测 1200 / 1440 / 1920px 三种视口下，克隆体宽度都与窄条可视宽度（99px）严丝合缝。

**跟随滚动**分两条路，都为「不滞后」服务：

- 支持 `animation-timeline: scroll()` 的浏览器（Chrome 115+ 等）交给 CSS 滚动驱动动画，
  方块在合成线程上跟随滚动条，拖滚动条时与内容完全同步；
- 其余浏览器回退到 JS 监听 `scroll`，**刻意不做 `requestAnimationFrame` 节流** ——
  节流会让方块比滚动条慢一帧，拖滚动条时肉眼可见滞后。每次滚动只写一次 `transform`，开销可以接受。

**拖动缩略图**用 Pointer Events：按下即定位、拖动即跟随、松手结束，并用 `setPointerCapture` 保证
指针移出窄条后仍收得到事件。这里必须即时定位（`scrollTo(0, y)`），**不能用**
`scrollTo({behavior: "smooth"})` —— smooth 会把拖动途中的每个目标位置排成一段动画，指针早已移开、
画面还在追，于是拖动感明显滞后；原生滚动条跟手，正是因为它没有动画队列。样式里的
`touch-action: none` 则避免触屏把这次按下当成翻页手势。指针到页面位置的换算按**缩略内容的实际
高度**（`页面高 × 缩放比`，通常不足一屏）而不是整条 100vh 的壳：按壳算比例，方块会恒定落在
指针上方 —— 拖到哪都「偏上」。

还有一处隐蔽的坑：主题在 `html` 上写了 `scroll-behavior: smooth`（`_sass/layout/_base.scss`），
这条规则会让**不带参数的** `scrollTo(0, y)` 也走动画，把刚修掉的滞后悄悄请回来。
所以定位时临时把根元素的内联 `scroll-behavior` 压成 `auto`、滚完立即还原
（`assets/js/han.js` 的 `scrollToPoint`），页内锚点的平滑滚动不受影响。
改动这段后务必实测：拖动缩略图时页面应逐帧跟手，而不是「慢慢追上」。

几个要点：

- 克隆体里的 `fixed` / `sticky` 元素必须压回普通流，且**这一步要在删除节点之前做**，
  否则原树与克隆树的元素索引会错位，定位修正整体失效；装饰性的 fixed 层
  （流光 `.han-aurora`、光斑 `.han-spotlight`、回到顶部 `.han-top`、点击涟漪 `.han-ripple`）
  则与脚本/样式一并**直接删除**而不是压回流 —— 光斑现在是显式 600×600 的块，压回流会把
  克隆内容整体下推，视口方块按真实坐标走，紫框就恒定偏高（曾表现为「缩略图紫框总偏上」）
- 侧栏 `.sidebar` 默认文档流、装得下一屏才由 `han.js` 第 9 节加 `.is-fit` 变
  `position: fixed` + `height: 100vh`；克隆时固定态在删除节点前被压回普通流，
  两种状态在缩略图里都呈现为左侧窄栏，正文比例不受影响
- 初始化不等 `load` 才第一次建图（图片与字体就位后再校正比例），而是「解析完成 + 同源样式就位」即建，见上面的「出现时机」；否则外链一慢，缩略图要等十几秒
- 比例按宽度定，缩略图通常比窄条矮（1440px 视口下缩放比约 0.07，几千像素高的页面缩完只有二三百 px，远低于一屏高的窄条）；
  页高超过「窄条可视宽 × 窄条高 / 视口宽」时缩略图才会高出窄条，方块会跑出可视区，改版后留意
- 窗口尺寸变化时销毁重建，比原地修正比例更简单可靠
- 整块带 `aria-hidden="true"`：它是整页 DOM 的克隆，不该被读屏软件再读一遍

脚本在 `assets/js/han.js` 第 5 节，样式在 `_sass/_han.scss` 第 12 节。

### 6. 英文版（`/en/`）

导航栏最右侧的地球图标在 `/` 与 `/en/` 之间切换。

英文版**不复制内容**，而是共用同一份数据，只把界面文案换成英文：

- 界面文案：`_data/ui-text.yml` 的 `en` 段
- 导航栏目名：`_data/navigation.yml` 每项的 `title_en`
- 侧栏姓名 / 简介 / 单位：`_config.yml` 的 `author.name_en` / `bio_en` / `location_en` / `employer_en`
- 论文分类名：`_config.yml` 的 `publication_category.*.title_en`
- 搜索与社交预览里的站点简介：`_config.yml` 的 `description_en`（`_includes/seo.html` 的 `<meta name="description">`；缺了回落中文）

条目内容也可以有英文版，**全都是选填，缺了自动回落中文**：

| 中文字段 | 对应英文字段 |
| --- | --- |
| `title` | `title_en` |
| `excerpt` | `excerpt_en` |
| `citation` | `citation_en` |
| `description`（页面级简介） | `description_en` |
| `type` / `venue` / `location`（会议条目） | `type_en` / `venue_en` / `location_en` |
| `text` / `note` / `year`（获奖数据，`_data/awards.yml`） | `text_en` / `note_en` / `year_en` |

界面文案（页脚、缩略图提示、镜图图注等）一并按 `page.locale` 取 `_data/ui-text.yml`，
因此英文页的页脚是 Follow / Feed / Sitemap，首页镜图的图注也是英文
（键为 `mirror_caption` / `mirror_aria`）。

条目列表层的中英已经齐全；条目**详情页**（`/portfolio/xxx`、`/publication/xxx`）目前仍是中文正文，
它们与中文列表共用同一批 URL，暂未拆分英文副本。

页脚与站点地图也分语言：英文页页脚署 `author.name_en`、Sitemap 指向 `/en/sitemap/`，
中文页仍是 `site.name` 与 `/sitemap/`。英文站点地图在 `_pages/en/sitemap.md`，
只列 `locale: en` 的页面；中文那份继续列全部页面。给某个条目补英译之后，
首页、列表页、履历页三处的卡片都会自动跟着变，不用另外改模板。

**约定：`*_en` 字段只在英文页生效。** 列表卡片（`_includes/archive-single*.html`）
一律先按 `page.locale` 判断，再决定取中文还是英文字段。**不要**写成
`post.title_en | default: post.title` 这种「无条件优先取英文」的写法 ——
那样中文页也会优先显示英文，条目一补英译，中文列表就整排变英文。
中文页的中文标题/摘要/期刊/引用与英文页的英文版本，两边都要抽查。

#### 自动翻译（`tools/translate-en.mjs`，可选）

`*_en` 字段可以由中文自动生成，模型走 OpenAI 兼容的
`https://index-translate.bilibili.com/v1`（`Index-Translate-35B-A3B`，无需 key）。
它只覆盖 front matter 与 `_data` 里的成对字段，共 92 处：

```
npm run translate:en            # 翻译并写回
npm run check:translate         # 离线检查「中文改了但英文没跟上」（只报不挡）
node tools/translate-en.mjs --dry-run    # 打印将要写入的内容，不落盘
node tools/translate-en.mjs --force      # 忽略哈希，全部重译（覆盖人工译文）
node tools/translate-en.mjs --only talks # 只处理某类
```

**覆盖策略（唯一要紧的设计）**：状态文件 `tools/translate-state.json` 记着每处英文
对应的那句**中文**的哈希 ——

| 情况 | 行为 |
| --- | --- |
| 中文没变 | 一个字都不碰，人工润色过的译文因此得以保留 |
| 中文变了 | 重译并覆盖，`中 / 旧 / 新` 三行一组打出来供 review |
| 英文缺失 | 直接补上 |
| 首次见到（无记录） | **只登记哈希，不覆盖任何现成英文** |

删掉状态文件即回到「只登记不覆盖」的保守状态。CI 里有一个只报不挡的
`zh/en translation drift reminder` 步骤盯着漂移。

**刻意不翻**：`citation`（GB/T 7714 与英文引文体例各有一套）、`location`
（「中国 · 南京」↔「Nanjing, China」，语序分隔符都不同）、`daterange` / `date` /
`datetext`（英文页有两种日期写法，何时用哪种是人判断的）、`bibtex`。
页面正文散文（`_pages/en/*.md` 的段落）不在范围内。

**为什么译文能保住术语**：送进模型前，先把术语（`tools/translate-glossary.yml`）、
Markdown 强调、夹杂的英文专名、项目编号与日期挖成 `[[n]]`，随文附一份
「`[[3]] = 四神博局镜 → four-deity TLV mirror`」的对照说明；模型只译中文散文、
逐字带回符号。术语表是从现有英文页倒推出来的 —— 英文页是人工润色过的，那里的译法
就是本站口径。占位符用纯 ASCII 是有原因的：实测 `⟦n⟧` 会被这个模型的分词器偶尔咬坏。

**三道写回前的校验**（任一不过就**保留原值**、只报错 —— 半句译文进页面比旧译文更糟）：
占位符片段是否都在、译文里有没有漏出来的汉字、译文是否非空。
写文件时还会重新解析一遍 YAML，确认除目标字段外语义没变；变了就整个放弃写入。
`--force` 全量重译的实测成功率约 93%（92 处里 6 处被校验拦下），
拦下的那几处基本都是模型把专名理解错了 —— 这类语义错误校验查不出来，
所以自动译文始终是**草稿**，要人过一眼再定稿。


### 7. 页脚（跟随正文，位于页面最下面）

页脚**不再钉在视口底部**。它原本是 `position: fixed; bottom: 0`，于是从头滚到尾都占着视口最下面一条；
现在回到正常文档流，只在滚到页面末尾时出现（`_sass/layout/_footer.scss`）。

配套要去掉两处「给固定页脚让位」的旧安排，否则页面末尾会多出一段空档：

- `_sass/layout/_base.scss` 里 `body` 的 `padding-bottom: 9em` —— 已删；
- 主题 JS 的 `bumpIt()`（`assets/js/_main.js`）：每次加载与窗口变化时给 `body` 内联
  `margin-bottom = 页脚高度`。源码里已删除，产物 `main.min.js` 也已用
  `npm run build:js` 重建（见 `package.json`），所以当初临时补在
  `_sass/layout/_footer.scss` 里的 `body { margin-bottom: 0 !important; }` 也一并删了。

实测（1400px 视口，离线镜像里「线上样式」与「改后样式」对照）：

| | `position` | 页面顶部时可见 | 滚到底：页脚底边 / 页高 |
| --- | --- | --- | --- |
| 改前 | `fixed` | 是（贴在视口下沿，top=689） | 3512 / 3512 |
| 改后 | `static` | 否（top=3400） | 3512 / 3512 |

判断标准很直白：**在页面顶部看不到页脚，滚到最底下才看到**，页脚之下不留空白。

### 8. 404 页面、RSS feed 与仓库瘦身

**404 分中英两套**（`_pages/404.md`）。GitHub Pages 只用根目录 `/404.html` 兜底，`/en/xxx` 打不开时返回的也是它，所以页面按中文渲染，再用一小段脚本判断 `location.pathname` 是否以 `/en` 开头：是就换正文块、改 `<html lang>` 与 `<title>`（连带 `<h1>`），并把顶部导航、侧栏、页脚的文案与链接换成英文页那一套 —— 配对数据是页内那块 JSON，取自 `_data/navigation.yml`、`_data/ui-text.yml` 与 `_config.yml` 的 author 字段，与 `masthead.html` / `footer.html` / `author-profile.html` 的取值一一对应。关掉 JS 就是原来的中文 404，不影响可用性。

**RSS 是自建的**（`_pages/feed.xml`）。`jekyll-feed` 只聚合 posts，本站没有 posts，原来的 `/feed.xml` 一直是 0 条；现在 `_config.yml` 的 `plugins` / `whitelist` 与 `Gemfile` 里都拿掉了 jekyll-feed，改由这一页输出，收录 `_publications`（四条 collection 里只有它带 `date`，talks / teaching / portfolio 没有日期，塞进去会被按构建时间顶到最前面）。页脚的 Feed 链接因此指向一份真有内容的 feed，`<head>` 里的 `<link rel="alternate">` 也指向它。

**robots.txt 与社交预览**（根目录 `robots.txt`、`_config.yml` 的 `og_image`）。robots.txt 直接声明 `Sitemap: https://newnju.github.io/sitemap.xml`（由 jekyll-sitemap 生成）；`og_image: avatar.png` 让每页的 `og:image` / `twitter:image` 都指向 `/images/avatar.png`，分享出去才带预览图 —— `twitter:card` 那几行同时从 `twitter.username` 的 if 里挪了出来（本站没填账号，原先整块被跳过，连卡片类型都不输出）。没有 `excerpt` 的页面也会发 `og:description`。

**顺手清掉的死代码**：`_includes/paginator.html`、`_layouts/splash.html`、`_layouts/archive-taxonomy.html` 全站零引用；14 个 Sass 文件从入口不可达（Font Awesome 的 `regular` / `v4-shims` / `_shims`，Susy 遗留的 `_su` / `_susy` / `_susyone` 与 `susyone/*`）；随之永远不会有 `@font-face` 引用的 `fa-regular-400.*`、`fa-v4compatibility.*` 四个 webfont 也删了（约 106 KB）；`jekyll-gist`（无 `{% gist %}`）、`jemoji`（无 emoji 短码）、`jekyll-paginate`（`paginate` 注释着）三个插件从 `plugins` / `whitelist` 移除；`assets/js/theme.js` 只是 uglify 的输入源，已进 `exclude` 不再被部署；`files/` 空目录（只有 `.gitkeep`）连同 `_config.yml` 的 `include: files` 一起去掉。另修两处小毛病：`_data/ui-text.yml` 里重复的 `copied_label`（引文复制与 BibTeX 复制各需要一条，后者改名 `copied_bibtex_label`），以及 `_config.yml` portfolio 默认值写错的 `comment` → `comments`。

### 9. 动态背景与微交互（流光、光斑、滚动渐显）

**流光渐变背景**（`_includes/han-effects.html` + `_sass/_han.scss` 第 13–14 节）：三团大色斑在内容层下方以 47–64 秒的周期缓慢漂移。配色是三个变量 `--han-aurora-a/b/c`，在 `_sass/theme/_han_light.scss` / `_han_dark.scss` 按明暗各定义一套，`_han.scss` 第 8 节的南大紫配色再覆盖一层 —— 切暗色、换配色，背景跟着走。实现上只用 radial-gradient（没有 `filter: blur`，省掉一整屏的模糊开销），`@keyframes` 只动 `transform`，颜色不进关键帧（延续本文件对旧 Safari 的约定）；变量都带兜底值，换 `site_theme` 也不至于空白。

**光标光斑**（`assets/js/han.js` 第 7 节 + 第 14 节样式）：一团 420px 半径的柔光跟着指针走，图层收成 600×600 小块、位置走 `transform`（每帧只更新合成层，指针移动不整屏重绘；方块要大于渐变 294px 的消散半径，否则柔光会在盒子边缘被切成方块）。只在精细指针（`hover: hover and pointer: fine`）上启用，`requestAnimationFrame` 节流每帧最多写一次坐标；没有这段脚本时色斑停在默认坐标，不影响任何内容。

**滚动渐显**（`_includes/head/custom.html` 内联引导 + `han.js` 第 6 节 + 第 15 节样式）：列表卡片、时间轴条目、荣誉条目、内容区小标题进入视口时轻微上浮淡入，只触发一次。三重兜底保证「动效坏了也不藏内容」：隐藏态只在 `<html data-reveal>` 与 `.han-reveal` 同时存在时才生效（引导脚本没跑、用户开了减少动效，正文照常可见）；`han.js` 里没有 IntersectionObserver 或没选中元素会立刻撤销标记；内联脚本 3 秒没等到 `han.js` 的就绪标记 `__hanRevealReady` 也自动撤销。

**hover 微交互**（第 16 节）：卡片上浮 3px、时间轴与荣誉条目右移 4px 并染品牌色（时间轴的轴上圆点会反向位移 4px 钉在轴线上 —— 文字走、点不动，不会一 hover 点就歪），仅限有指针且不介意动效的设备（`@media (hover: hover)` 门控）。

**点击涟漪**（`assets/js/han.js` 第 10 节 + 第 21 节样式）：页面任意处按下鼠标或手指都有反馈 —— 在可点击元素（链接、按钮、`summary`、`role=button`）上以指针为圆心铺满整块（半径取指针到元素四角的最大距离，整张卡片都能铺满），在正文等普通处泛指尖大小的小圆；颜色走 `--han-ripple`（第 8 节随明暗主题切换，带青铜绿兜底）。节点 `position: fixed` 挂在 body 上、`pointer-events: none`，不参与布局也不挡点击，560ms 扩散淡出后自回收；reduced-motion 下 JS 直接不监听、第 17 节样式再兜底隐藏；缩略图拖动区（`.han-minimap`）是拖拽导航，排除在外。

**链接下划线滑入**（第 22 节）：正文里的链接平时保持原生下划线，hover 或键盘聚焦时一道紫色短杠从左滑到右盖上去，纯 `background-size` 过渡、零布局位移；触屏与 reduced-motion 维持原样，按钮和包图片的链接不参与。

**主题切换色彩渐变**（`han.js` 第 11 节 + 第 23 节样式）：点 masthead 明暗按钮的瞬间给 `<html>` 临时挂 `.theme-transition` 500ms，期间全站颜色（背景、文字、边框、阴影、图标填充）0.35 秒渐变换过去，时段一过摘掉类、平时的 hover 与滚动渐显不受影响；页面首载的主题落位仍是瞬时的。

**时间轴滚动点亮**（`han.js` 第 12 节 + 第 24 节样式）：`/timeline/` 的灰轴上叠一条严格重合的彩色渐变（南大紫 → 金），随滚动按视口位置从上往下点亮（容器上的 `--han-timeline-progress` + `scaleY`，纯变换零布局）；彩轴带 0.6s 缓出过渡，一次滚轮之后能看到一段柔和的「追上来」，不是硬跳一格。reduced-motion 下 JS 不跑、直接静态全彩，打印走第 17 节保持灰轴。

**回到顶部按钮**（`han.js` 第 13 节 + 第 25 节样式）：JS 生成的右下角紫圆钮（页面 HTML 一行不动），滚过半屏才浮出、点击平滑回顶；≥1200px 自动挪到缩略图左侧不重叠（z-index 40，缩略图 30、导航下拉 100）；reduced-motion 照常显隐只是没有过渡动画，打印不印。

**卡片 3D 轻微倾斜**（`han.js` 第 14 节）：指针在成果卡片（`.archive__item`）上移动时按偏离中心量 ±3.5° 微倾，并保留第 16 节的 hover 上浮 —— 全写在行内 transform 里、指针离开即清空交还 CSS，每帧最多重算一次（rAF 节流）；透视用 transform 内联的 `perspective()` 不动父容器，只在精细指针且允许动效的设备上挂，触屏与 reduced-motion 完全不参与。

**首页首段打字机**（`han.js` 第 15 节 + 第 27 节样式）：首页（`/` 与 `/en/`）第一段逐字打出来，行尾挂一根闪烁的竖条，全程匀速。开关是页面 front matter 的 `typed_intro: true` —— `_layouts/single.html` 据此给 `.page__content` 打 `data-typed-intro`，脚本只取该容器的**第一个 p**（博局镜装饰是 div，不掺和）。几条刻意的取舍：

- **原文始终在 HTML 里**：服务端渲染的就是完整一段，脚本只是把 DOM 逐字改写，所以无 JS、关 JS 打印、抓取、首屏 SEO 都不受影响；reduced-motion 用户脚本直接不跑（第 17 节样式再兜底藏掉光标）。
- **计时用 rAF 的时间戳**：不是「每帧加一个字」。切走标签页再回来会按真实时间一次性补齐缺的字，不会永远停在半句上。
- **全程匀速，速度由字数算出来**：总时长定死 2.6 秒，每字的间隔 = 总时长 ÷ 字数，中英文各按自己的长度摊 —— 中文 212 字与英文 710 字都是 2.6 秒打完，字多的自然打得快。旧版给每字卡了 6 / 26 毫秒的上下限、标点后另有停顿：英文被下限钉在 5.9 毫秒要打 4.2 秒（比中文的 2.9 秒慢一大截），停顿又让速度忽快忽慢。
- **锁住段落高度**：打字期间下面所有内容都在往上爬，等于每次访问白送一次布局位移，所以起步前量一次满行高度写进 `min-height`，打完撤掉。
- **点一下就好**：`pointerdown` / 滚轮 / 按键任意一次都立刻补完 —— 想选中复制这段文字的人总得先按一下或拖一下，于是「点一下就好」顺带把复制也救了。
- **行内标签不丢**：按子节点切段，`<strong>` / `<em>` / `<a>` 连标签带属性留着，只往里逐字填 `textContent`，加粗与链接不会被抹平。


**性能与跨设备加固**（这一轮的取舍都写在改动处）：

- **图标字体子集化**（`tools/subset-fonts.js`，`npm run fonts`）：Font Awesome Free 的两套完整字体是 277KB woff2，而全站只用到十几个图标 —— 首屏传输量的三分之二。脚本扫源码里出现的 `fa-*` 类名（含 `assets/js` 全部脚本 —— 主题按钮的 `fa-moon` 是 `_main.js` 运行时换上的，页面上只有 `fa-sun`，漏扫就没有月亮的码位）、到 `_sass/vendor/font-awesome/_variables.scss` 查码位、交给 `pyftsubset` 生成子集，**加图标只要写进模板或脚本，重跑一次即可**，不用回来改码位表。子集始终从 `assets/webfonts/full/` 里的完整原字生成（该目录不发布），不要就地二次子集化：拿已经缺了码位的文件再切一次，之前丢掉的字形回不来。当前 277KB → 11KB（woff2），ttf 兜底同样瘦身。依赖 Python 的 `fonttools` + `brotli`（`pip install fonttools brotli`）；没装时脚本只打印码位、不动文件。
- **图标 CSS 同时子集化**（`assets/css/fontawesome.scss` + `_sass/_icon-names.scss`，随 `npm run fonts` 一起生成）：字体瘦了，CSS 还在把上游整本图标表编译进产物 —— `fontawesome.css` 压缩后 75KB，比 main.css 还大，而全站只用到 67 个图标。入口改成按上游 bundle 的顺序引核心部分（只去掉扫全表的那两条 `@each`），`@font-face` 与家族权重两段照抄上游 `solid.scss` / `brands.scss`（那两个文件尾部各带全量循环，不能整份引），图标规则改由 `npm run fonts` 扫出的名单驱动。当前 75KB → 9.8KB，67 条图标规则与全量编译**逐字节一致**，少的只是根本没用到的选择器。名单与字体出自同一次扫描 —— **加图标还是只写模板、重跑一次 fonts**，漏了名字字体和 CSS 会一起缺。
- **同步与 async 的两份大脚本也压**：`vivus.js`（34KB，同步阻塞解析）与 `han.js`（50KB，async）页面上改为加载 `npm run build:js` 生成的 `vivus.min.js`（12.8KB，`--comments` 保住 MIT 头）与 `han.min.js`（14.7KB）。压缩只是 `uglify-js -c -m`，源码与注释都在原文件里，**改完源码要重跑 `build:js`**（`main.min.js` 一直如此，现在多这两份）。
- **删掉没人用的样式与外链**：`main.scss` 里去掉 `layout/json_cv`、`layout/forms`、`layout/notices`、`syntax` 四块（站内没有 json_cv 页、没有表单控件、`notice--` 只出现在 IE9 条件注释里、`highlight` 一个都没渲染），main.css 压缩后 73KB → 60KB；`head/custom.html` 里 jsDelivr 的 academicons 整块删除（`_config.yml` 的 academia / arxiv / orcid / googlescholar 全为空，全站没有一个 `ai-*` 类名），顺带省掉每次访问一次跨域握手；将来真要挂 ORCID / Google Scholar 时把那段加回来。
- **`main.min.js` 的 `screen.orientation` 判空**（`assets/js/plugins/jquery.greedy-navigation.js`）：它在 Safari / iOS 16.4 以下不存在，而 `main.min.js` 是整包 `type="module"`，模块顶层一抛错，后面的 `setTheme`、主题按钮、联系方式按钮全都不执行 —— 症状正是「换到这台设备上主题永远是亮的、按钮点不动」。改完记得 `npm run build:js`。
- **主题跟着设备走**：`_includes/head/custom.html` 里加了一段内联脚本，在首次绘制前按 `localStorage` → 系统 `prefers-color-scheme` 的顺序定下 `data-theme`（不再等 `main.min.js` 取回下载才执行，也不再受上面的报错影响）；`_sass/theme/_han_dark.scss` 的暗色变量表抽成 mixin，另用 `@media (prefers-color-scheme: dark) + html:not([data-theme="light"])` 兜住「脚本没跑」的情况。
- **`100vh` 改成 `100vh` + `100dvh` 两行**（缩略图与固定侧栏）：iOS 的 `100vh` 是地址栏收起时的最大视口高，地址栏展开时底部会露不到屏外；不认 `dvh` 的旧浏览器忽略第二条。
- **刘海屏**：`viewport-fit=cover` + `.han-top` 用 `max(24px, env(safe-area-inset-*))`，没有 `env()` 的浏览器照旧 24px。
- **触摸目标与 hover**：主题切换改成真正的 `<button>`（原先是 `role="button"` 的 `<a>`，键盘不可达），点击区从 25px 放到 44×44；回到顶部按钮 42→48px；导航下划线与回到顶部的 hover 反馈包进 `@media (hover: hover)`，免得触摸设备点一下就留着高亮。
- **`forced-colors`（Windows 高对比度）**：系统会接管颜色但不接管背景图，所以流光、光斑、缩略图那几层直接收掉，正文与图标交给系统配色（SVG 的 fill/stroke 本来就会被强制成单色，正好是清晰的线稿）。
- **正文字体栈补中文**（`_sass/theme/_han_*.scss` 的 `$sans-serif`）：系统栈在前，后面补 PingFang SC / 微软雅黑 / Noto Sans CJK —— 只靠通用 `sans-serif` 兜底，在「默认字体不含中文」的机器上会掉成豆腐块。
- **侧栏竖屏规则收进 `:not(.is-fit)`**（`_sass/layout/_sidebar.scss`）：iPad Pro 竖屏宽 1024px ≥ `$large`，放在外面会让流式态比固定态多出 1em，fit 门控切换时头像会跳一下。
- **主题切换的渐变不再拖累全站**（`_han.scss` §23 + `han.js` 第 11 节）：原先过渡规则写成 `html.theme-transition *`（连 `::before` / `::after` 一起、六个属性、带 `!important`、挂 500ms），一次点击要同时驱动正文 942 个节点加缩略图克隆的 436 个节点，968ms 只渲染 18 帧、最长一帧 150ms —— 正是「点下去要等一下、颜色一卡一卡刷」的来源。现在只覆盖真正带主题色的表面（约 20 个选择器）、去掉最贵的 `box-shadow`、时长收到 0.28s，缩略图那一整棵克隆树直接硬切（它只有 100px 宽，渐变看不见但成本翻倍），摘类定时也从 500ms 收到 320ms（原先颜色早已换完、类还挂着，那段时间 hover 与滚动渐显都被压着）。
- **履历条目的时间统一成一处样式**：日期原先散在三种位置、三种颜色里（任职/学历条目写在句首且与正文同色、项目写在一对括号里、获奖年份是加粗），同一页上看起来像三种东西。现在日期一律作为数据字段存在 `_data/profile.yml`（`daterange` / `daterange_en`，文案里不再混写时间），由 `_includes/han-cv-timeline.html` 与 `_includes/han-education.html` 统一包成 `.han-cv-date`（比正文浅一档、数字等宽、去掉加粗），学位大标题末尾、条目句首、项目括号、获奖年份四处都走它；同一段里带嵌套列表的条目会被 kramdown 判成「松散」多套一层 `<p>` 导致疏密不匀，履历页已有一条 `.archive li > p` 把这类 `<p>` 的外边距归零。时间轴**没有外层容器**：Jekyll 的 kramdown 默认 `parse_block_html: false`，`<div>` 里的 markdown 不解析（`markdown="1"` 也无效），加包装会把列表变成带星号的纯文本，所以样式只挂在 `.han-cv-period__head` 与 `.han-cv-date` 上。
- **首屏不再等渐显**（`han.js` 第 6 节）：已经在视口内的元素直接点亮，不进观察者队列 —— 淡入对首屏没意义，却会让 LCP 白白晚一拍（一次 IO 往返 + 0.65 秒过渡）。
- **缩略图不再每次 resize 都重建**：重建 = 克隆一遍整页 DOM（几百节点）+ 几百次 `getComputedStyle`，原先拖窗口时每秒能触发几十次；现在 rAF 合并一次，并由 `geometryKey()` 判断尺寸是否真的变了。滚动跟随也不再每次 `querySelector`，直接用本次构建出的节点引用。
- **主题按钮与固定链接的无障碍/双语**：`ui-text.yml` 新增 `theme_toggle_label`（中英）与 `permalink_label`（中英），原先四个 `archive-single*` 片段里硬编码的英文 `Permalink` 一并本地化。

**性能微优化**：侧栏头像改用 `images/avatar.webp`（400×400、14KB，原 PNG 119KB 只留给 `og_image` 分享预览），`<img>` 补了 `width/height` 免加载时布局抖动；作品缩略图 `loading="lazy"` 延后屏外图片；光斑、卡片倾斜、时间轴与回到顶部全部 rAF 节流、每帧最多写一次。（原先这里的「jsDelivr 提前 `preconnect`」已随 academicons 一并删除。）

**侧栏线稿自绘**（`assets/js/vivus.js` + `han.js` 第 8 节 + 第 20 节样式）：侧栏联系方式列表（电子邮件、GitHub 等）下方有一幅线稿，滚进视口时由 vivus.js（MIT，maxwellito/vivus v0.4.6，npm dist 原样 vendor 在 `assets/js/vivus.js`，页面引 `build:js` 压出的 `vivus.min.js`）逐笔错峰描出，约 3.3 秒画完。素材是南大官网 www.nju.edu.cn「数说南大」背景 SVG（1 polygon + 8 polyline），内联在 `_includes/author-profile.html` 尾部 —— 只要页面渲染作者侧栏就有这幅图；vivus 的 `<script>` 在 `_includes/scripts.html` 用**同一条件**（`page.author_profile or layout.author_profile`，与 `sidebar.html` 引入侧栏的条件一致，全站各集合 front matter 默认 true）加载，所以凡是有联系方式列表的页面都带动画，没有侧栏的页面两者都不出现。三重兜底：`window.Vivus` 不存在直接退出；`han.js` 里没有 `#svgpx` 直接退出；**reduced-motion 用户不创建 Vivus —— SVG 平时就是完整线稿，只有被创建时才会先藏起来等动画，所以「不创建」= 静态全图**。线稿描边颜色走 `--han-patina`，南大紫 / 青铜绿 / 暗色主题自动跟随。线稿看得见、动得了的前提是侧栏能滚进视口 —— 宽屏侧栏由 `han.js` 第 9 节做 fit 门控：装得下一屏才固定（`.is-fit`），装不下就保持文档流随页滚动，否则左列多出内层滚动条、`inViewport` 永不触发。

**移动端作者名片**（`_han.scss` 第 28 节 + `_includes/author-profile.html`）：窄屏（<925px）上侧栏原本是三个 table-cell 横排 —— 头像｜姓名简介｜关注按钮，而线稿因为塞在按钮那个 `.author__urls-wrapper` 里面，跟着按钮挤在同一格、还沾上了那个容器的 `cursor: pointer`。现在：头像与姓名简介包进 `.author__head`，线稿挪成 `.author-card` 的直接子元素，用两列网格摆位 —— **第 1 行「头像 + 文字」在左、线稿在右，第 2 行关注按钮跨两列**。宽屏整块回到普通块流（`.author__head` 用 `display: contents` 让两个子元素直接参与父级块流；即使浏览器不认，留成普通块也一样，视觉逐像素不变）。线稿宽度 `clamp(84px, 30vw, 132px)`，手机上约 117px。桌面端唯一的差别：线稿在 925–1200px 这一档宽了 14px（原先它被 `.author__urls-wrapper` 的 14px 右内边距压着），≥1200px 仍以 175px 封顶。

**窄屏的横向溢出**（第 18 节末尾）：≤360px 的屏幕上「近期成果」那条引文里的 CNKI 长链接会撑出 40px 横向滚动 —— 它是一整段没有断点机会的**纯文本**（不是 `<a>`，链接那套样式管不到），于是 `<li>` 的盒子仍然是 288px 宽、文字却画到了 360px：量元素边界量不出来，只有 `documentElement.scrollWidth` 看得到（`check:links` 的横向溢出断言在 390px 视口下刚好测不到这一档）。`.page__content` / `.archive` 上补 `overflow-wrap: anywhere`（`break-word` 只在盒子已溢出后才断，治不了这个，所以两条都写）。

**减少动效与打印**（第 17 节）：系统开启「减少动态效果」时新老动效一并静止（含博局镜旋转与呼吸、缩略图进度、流光、光斑、渐显、点击涟漪、时间轴点亮）；回到顶部按钮照常显隐、只是没有过渡动画；打印时装饰层不印（含回到顶部按钮与时间轴彩轴）、渐显元素直接给完整不透明度，不会打出来一片空白。

**分享到（中文 微信 · QQ · X，英文维持原五个）**（`_includes/social-share.html` + `assets/js/share-wechat.js` + `_sass/_han.scss` 第 29 节）：分享区按 locale 分叉 —— **中文页只有三个按钮，微信在最左**（微信 → QQ → X），Bluesky / Facebook / LinkedIn / Mastodon 一律不出现；**英文页一个字节都没改**，仍是原来五个、连顺序都保持 Bluesky → Facebook → LinkedIn → Mastodon → X（X 一直排最后，没为了跟中文对齐去动它）。

微信之所以是 `<button>` 而不是链接，是因为它**没有**网页端分享 URL：JS-SDK 的分享接口要公众号 AppID 加服务端签名，静态站凑不出签名，任何 `wxshare://` 之类的私有协议都不能保证到人。所以点了弹出**本页地址的二维码**（微信「扫一扫」直接打开）外加一个「复制链接」，两条路都通；二维码由 `assets/js/qrcode.min.js`（qrcode-generator@1.4.4，MIT，20KB，带原版权头）在**本机**算出来，白底黑码 —— 暗色主题下也不反色，扫码靠的是对比度不是配色。

- **点开才下载**：`qrcode.min.js` 不在首屏，绝大多数访客不会点微信，不该为它付 20KB。二维码库的地址是从 `share-wechat.js` 自己的 `src` 推出来的，所以 `_config.yml` 改 `baseurl` 时它自动跟着走（这条有断言：脚本挂到 `/sub/` 下时要请求 `/sub/assets/js/qrcode.min.js`）。
- **门控两道**：`_includes/scripts.html` 只在 `page.share` 且 locale 含 `zh` 时输出脚本（英文页渲染出来是 Bluesky 那套，加载它纯属浪费）；按钮 HTML 自带 `hidden`，脚本成功跑完才摘掉 —— 没 JS 时宁可不显示，也不给一个点了没反应的按钮。
- **用 `defer` 不用 `async`**：脚本第一步就 `querySelector` 分享区，async 有跑到文档解析完之前的风险，那时它会判定「没有微信按钮」直接 return，按钮就永远藏着。
- **文案一个字都不写在 JS 里**：全部来自 `_data/ui-text.yml` 的 `zh` 段（`share_wechat` / `share_qq` / `share_dialog_label` / `share_scan_hint` / `share_copy_link` / `share_copied_link` / `share_close`），由模板打成 `.page__share` 上的 `data-label-*`。换语言只动 YAML。
- **图标要重建子集**：`fa-weixin`（U+F1D7）与 `fa-qq`（U+F1D6）是新用到的字形，改完要 `npm run fonts`，否则字体里没有这两个码位、按钮上就是豆腐块（`npm run check:icons` 会拦）。同一次扫描会连 `fontawesome.css` 的图标名单（`_sass/_icon-names.scss`）一起更新 —— 字体与 CSS 要缺一起缺，所以一次 `fonts` 就够。
- **两条测试**：`tests/social-share.test.mjs` 断言渲染出来的按钮集合（中英各是哪几个、什么顺序、绝对地址、`rel="noopener noreferrer"`、文案与 ui-text 一致）—— 按钮集合的差异只存在于 `{% if %}` 分支里，源码看不出、构建也不报错；`tools/check-dom-behavior.mjs` 第 6 项在浏览器里断言弹层交互与按需加载（按钮显隐、`role="dialog"`、二维码 path、首屏不请求二维码库、ESC 关闭、1366px 无溢出）。

---

## 四、日常维护

### 改内容的两种方式

**方式 A：直接在 GitHub 网页上改（推荐，不用装任何东西）**

1. 打开仓库，进入要改的文件（例如 `_pages/cv.md`）
2. 点右上角的**铅笔图标**
3. 改完在页面底部填一句说明，点 **Commit changes**
4. 等 1–2 分钟，刷新网站即可看到

想新增文件：进入对应文件夹 → **Add file → Create new file** → 填文件名 → 粘贴内容 → Commit。

**方式 B：本地改完再 push**

```bash
# 改完文件后
git add .
git commit -m "更新履历"
git push
```

**方式 C：网页后台表单（最不容易写错）**

打开 <https://newnju.github.io/admin/> → 点 **Sign in with GitHub** → 左侧选要改的条目 → 表单里改 → 点 **Save**。

后台会自动把内容写成符合校验的文件并提交，不用碰 YAML。详细说明见下面的[「后台表单（Decap CMS）」](#后台表单decap-cms)一节。

> 三种方式最终都是改仓库里的文件、走同一条构建流水线，效果完全一样。


### 改哪里

| 想改什么 | 改哪个文件 |
| --- | --- |
| 站点标题、简介、侧栏信息、联系方式 | `_config.yml` |
| 顶部导航栏的栏目与顺序 | `_data/navigation.yml` |
| 界面按钮文案（中文 / 英文） | `_data/ui-text.yml` 的 `zh` / `en` 段 |
| **主题配色** | `_sass/theme/_han_light.scss`、`_han_dark.scss` |
| **动态背景、光斑、滚动渐显、点击涟漪**（第 13–17、21 节） | `_sass/_han.scss` 末尾几节 + `assets/js/han.js` 第 6–7、10 节；色斑与光斑配色的变量在 `_sass/theme/_han_*.scss` 与 `_han.scss` 第 8 节（点击涟漪 `--han-ripple` 也在第 8 节） |
| **链接滑入、主题渐变、时间轴点亮、回到顶部、卡片倾斜、项目页字号**（第 22–26 节） | `_sass/_han.scss` 第 22–26 节（第 26 节纯样式、无 JS，包装层在 `_pages/portfolio.html` 与 en 版）+ `assets/js/han.js` 第 11–14 节；明暗切换本体在 `assets/js/_main.js`（`han.js` 第 11 节只负责挂过渡类） |
| **首页首段打字机**（首页第一段逐字打出、行尾闪烁光标） | 开关是 `_pages/about.md` 与 `_pages/en/about.md` 的 front matter `typed_intro: true`（后台字段在 `admin/config.yml`，键名登记在 `schemas/page.schema.json`）；`_layouts/single.html` 据此给 `.page__content` 打 `data-typed-intro`；行为在 `assets/js/han.js` 第 15 节（节奏常量也在那一节），光标样式在 `_sass/_han.scss` 第 27 节，reduced-motion 与打印的兜底在第 17 节。**改完正文不用动它**：字数变了速度自动跟着变（间隔 = 总时长 ÷ 字数），总时长始终不变 |
| **侧栏线稿自绘**（南大官网「数说南大」背景线稿，凡有侧栏联系方式列表的页面） | SVG 内联在 `_includes/author-profile.html` 尾部（**在 `.author__urls-wrapper` 之外**，作为 `.author-card` 的直接子元素）；动画库 vendor 在 `assets/js/vivus.js`、加载在 `_includes/scripts.html`（门控 `page.author_profile or layout.author_profile`，与 `sidebar.html` 引入侧栏同一条件）；初始化是 `assets/js/han.js` 第 8 节；描边颜色与尺寸在 `_sass/_han.scss` 第 20 节（`--han-patina`），**窄屏的两列摆位（按钮另起一行、线稿靠右）在第 28 节** |
| **侧栏固定 / 滚动行为**（宽屏装得下一屏才固定，否则流式随页滚动） | `_sass/layout/_sidebar.scss` 的 `.is-fit` 规则 + `assets/js/han.js` 第 9 节（fit 门控，预算里的顶栏让位每轮现量，不用写死数值） |
| **窄屏汉堡菜单**（≤768px 时顶栏条目整体收进汉堡，只留站点名） | 折叠逻辑在 `assets/js/han.js` 第 2 节（六个栏目 + 语言切换 + 主题切换 + 登录一起进下拉，回到宽屏按原序插回站点名之后）；下拉里的样式（限高 70vh 可滚、主题按钮对齐同级链接）在 `_sass/_han.scss` 第 9 节。汉堡按钮的显示条件是「下拉里确实折了东西」（`.has-overflow`，由 `han.js` 打），不只看窄屏 —— 宽屏放不下时末尾栏目也会被折进去（实测 900px 上下履历正好被折），按钮不出现就点不到。`jquery.greedy-navigation.js` 只负责「量宽度决定往哪折」与量顶栏高度，展开/收起统一由 `han.js` 管 —— 两边都绑 click 会把同一个类切两遍、互相抵消 |
| **顶栏让位高度**（顶栏 `position: fixed`，内容要让开它） | 真实高度由 `assets/js/plugins/jquery.greedy-navigation.js` 每轮量出（顶栏是 `fit-content`，18px 根字号下约 58.5px），内联写进 `body` 的 `padding-top`，同时写成 CSS 变量 `--han-masthead-h` 给 `_sidebar.scss` 的 `.is-fit` 用；`_sass/theme/_han_*.scss` 的 `$masthead-height`（`3.0889em`）只作无脚本与变量缺省时的兜底。该插件原本还会给 `.sidebar` 加同尺寸的 `padding-top`（原主题里侧栏恒为固定），现已删除 —— 本站侧栏是 fit 门控的两态，无条件加会在流式态凭空多出约 55px 空白。**插件源码改完要跑 `npm run build:js` 重新生成 `assets/js/main.min.js`**（页面加载的是这个打包产物，不是插件文件本身） |
| **全站已无 jQuery**（`main.min.js` 100.4KB → 17.6KB，gzip 后每页少约 30KB） | 原先 jQuery 只被 `_main.js`（主题切换、联系方式折叠）与 `greedy-navigation.js`（量宽度折行）用到，已全部改写成原生 DOM，行为由 `npm run check:behavior` 逐条断言。文件名 `jquery.greedy-navigation.js` 沿用上游命名、内容已是原生实现，只是改名要动多处引用，不值当。唯一残留的 jQuery 用法在 `_includes/comments-providers/staticman.html`，而 `comments.provider` 是 `false`，那个文件永远不会被 include |
| **明暗主题**（跟随系统偏好，可手动覆盖） | 落位在 `_includes/head/custom.html` 的内联脚本（首次绘制前定 `data-theme`）+ `_sass/theme/_han_dark.scss` 的变量 mixin（含 `prefers-color-scheme` 兜底）；切换按钮在 `_includes/masthead.html`，文案取 `ui-text.yml` 的 `theme_toggle_label`；点击处理在 `assets/js/_main.js` 的 `toggleTheme`（打进 `main.min.js`，改完要 `npm run build:js`） |
| **顶栏登录按钮**（主题切换右侧，进 Decap 后台的入口） | `_includes/masthead.html` 的 `#login-link`（`persist tail`：宽屏永远排在主题按钮右边，窄屏随整条顶栏进下拉），链接是 `base_path` 拼出的 `/admin/`，文案取 `ui-text.yml` 的 `login_label`（中英）；图标 `fa-right-to-bracket` —— **换图标后跑 `npm run fonts`**，字形与 `fontawesome.css` 出自同一次扫描，漏跑就是豆腐块；宽屏 44×44 居中在 `_sass/layout/_navigation.scss`，下拉里全宽左对齐在 `_sass/_han.scss` 第 9 节。点进去走 GitHub OAuth 白名单，见「后台登录 / 权限」一行 |
| **图标字体 + CSS 子集**（字体 277KB → 11KB，`fontawesome.css` 75KB → 9.8KB） | `tools/subset-fonts.js`（`npm run fonts`），码位由源码与 `assets/js` 脚本里出现的 `fa-*` 类名反查 `_sass/vendor/font-awesome/_variables.scss` 得到；完整原字在 `assets/webfonts/full/`（不发布），产物是 `assets/webfonts/fa-{solid-900,brands-400}.{woff2,ttf}`。同一次扫描还生成 `_sass/_icon-names.scss` 的图标名单，`assets/css/fontawesome.scss` 只按名单编译用到的图标（规则与全量逐字节一致，缺的只是没人用的）。**写图标时家族前缀要对**：Font Awesome 6 里 `fa-rss-square` 已改名 `fa-square-rss` 且搬进 **solid**，写成 `fab` 就是页脚上一个空豆腐块（`npm run check:icons` 专门查这个，纯文本比对，不要 Python） |
| **首页自我介绍** | `_pages/about.md` |
| **教育背景、联系方式、工作与任职**（主页中英两版；履历页的「联系方式」章节已按需求删除，不再 include `han-contact.html`） | `_data/profile.yml`（education / work / contact；条目上的 `period` 字段决定它进履历哪段时期块）。渲染逻辑在 `_includes/han-education.html` / `han-contact.html`（现只剩主页在用），履历合并时间轴在 `han-cv-timeline.html`，一般不用动 |
| **履历页结构**（章节顺序、证书、技能） | `_pages/cv.md` 与 `_pages/en/cv.md`。「学历与经历」标题已按需求删除（合并时间轴直接跟在页题下）；章节顺序为 合并时间轴 → 荣誉 → 论文列表 → 证书 → 技能 → 会议与暑期学校 → 教学与助教。该节内容已改由 `_data` 与集合驱动，见上下几行 |
| **履历条目的时间样式**（日期统一 `.han-cv-date`） | 日期是数据而不是文案：`_data/profile.yml` 每个 education / work 条目带 `daterange` / `daterange_en`（中英各一份），渲染时在 `_includes/han-cv-timeline.html`（学位大标题末尾用逗号、条目句首用冒号）与 `_includes/han-education.html`（关于页，句首）包成 `.han-cv-date`；样式只有 `_sass/_han.scss` 第 19 节一处 |
| **履历时间轴的分期与内容**（博士 / 硕士 / 本科三个学历大块，过渡期内容排在博士与硕士块之间；块内嵌任职、项目、获奖，均为裸列表不加小节标签） | `_data/profile.yml` 的 `period`（phd / gap / master / bachelor）、`_data/awards.yml` 各条目的 `period`、`_portfolio/*` 的 `period`；标题样式在 `_sass/_han.scss` 第 19 节 |
| **获奖与荣誉的数据**（`/timeline/` 时间轴 + 首页「荣誉」「获奖」两节 + 履历时间轴与「荣誉」节） | `_data/awards.yml`。`key: honours` 那一组是「荣誉」，单独显示在首页与履历页的「荣誉」小节（不参与分期）；其余年份分组显示在「获奖」小节、时间轴页，并按 `period` 进履历时期块 |
| **分享到**（中文 微信 · QQ · X，英文维持原五个） | 目标按语言分叉在 `_includes/social-share.html`（`_locale contains 'zh'` 走微信/QQ/X，否则原样输出 Bluesky/Facebook/LinkedIn/Mastodon/X）；微信是 button 不是链接 —— 弹层逻辑 `assets/js/share-wechat.js`，由 `_includes/scripts.html` 在「`page.share` 且 locale 含 zh」时以 `defer` 输出；二维码库 `assets/js/qrcode.min.js`（qrcode-generator@1.4.4，MIT）点开才下载，路径从脚本自身 `src` 推导；样式 `_sass/_han.scss` 第 29 节；文案 `_data/ui-text.yml` 的 `zh` 段 `share_*` 七个键（换语言只动 YAML）。**改完记得 `npm run fonts`** —— `fa-weixin` / `fa-qq` 是新字形，不重建子集就是豆腐块。测试 `tests/social-share.test.mjs`（按钮集合）+ `tools/check-dom-behavior.mjs` 第 6 项（弹层交互） |
| 论文条目 | `_publications/` 下的 Markdown 文件。论文页、履历页「论文列表」、主页「近期成果」（自动取最新 3 篇）与 RSS feed 全部随它更新，不用手改页面 |
| 项目与作品条目 | `_portfolio/` 下的 Markdown 文件。front matter 的 `date`（排序）、`daterange`（履历展示的日期跨度，如 `2019.09 – 2021.09`）、`period`（进履历哪段时期块）会同步到履历时间轴 |
| 会议与暑期学校条目 | `_talks/` 下的 Markdown 文件 |
| 教学 / 助教条目 | `_teaching/` 下的 Markdown 文件 |
| **英文版页面** | `_pages/en/` 下的同名文件 |
| **`*_en` 字段（自动翻译）** | 术语表在 `tools/translate-glossary.yml`、行为与覆盖策略在 `tools/translate-en.mjs`（`npm run translate:en` / `npm run check:translate`）、每处英文对应的中文哈希在 `tools/translate-state.json`（进仓库，删掉即回到保守状态）。中文没变就不覆盖人工译文 —— 见上面「英文版」一节 |
| **后台登录 / 权限** | `oauth-proxy/worker.js`（Cloudflare Worker）。白名单 `ALLOWED_GITHUB_USERS` 是强制的 —— 不配后台登不进去；postMessage 锁 `SITE_ORIGIN`；state cookie 用完即废；每次登录尝试写一行审计日志。**部署在 GitHub 上做**（`.github/workflows/workers.yml`，改完推 main 即生效），密钥只进仓库 Secrets、不进仓库文件。行为有测试：`node --test tests/oauth-proxy.test.mjs` |
| **访客统计** | 默认关闭。开关是 `_config.yml` 的 `analytics.visit_endpoint`（留空 = 一个请求都不发）；打点脚本 `assets/js/visit.js`；收数据的 Worker 与库表在 `analytics/`（D1 + Cloudflare GeoIP）。**不存明文 IP**，只存按天轮换盐的哈希；不写 cookie、不引第三方脚本；浏览器开了 Do Not Track / Global Privacy Control 就不上报。部署（同样走 GitHub Actions）见 [`analytics/README.md`](analytics/README.md) |
| 首页的博局镜图 | `_includes/han-mirror.html` |
| 头像 | 侧栏显示的是 `images/avatar.webp`（400×400、正方形、背景已抠透明，14KB；由原图转出，原 `avatar.png` 119KB 只留给 `og_image` 分享预览），引用在 `_config.yml` 的 `author.avatar` 与 `_data/authors.yml` —— 换头像时两处一起改、并重转一次 WebP。尺寸与位置在 `_sass/_han.scss` 第 6 节：照片 158px 见方、不加外框（描边 / 光圈 / 内边距都去掉了），大屏下整块**上移 30px**、右移 4px，头像顶端因此固定落在「顶栏下沿 + 6px」。**头像必须是正方形**，主题用 `border-radius: 50%`，非正方形会被裁成椭圆。`images/profile.svg` 是备用的「武」字头像 |
| 项目配图 | 没有默认封面。想加就把图放进 `images/portfolio/`，在条目 front matter 里用 `excerpt: "<img src='/images/portfolio/xxx.svg'><br/>一句话简介"` 引它（模板自带的示例 SVG 已删除，目录是空的） |

### 新增条目

**一条论文** —— 在 `_publications/` 下新建文件，文件名建议以日期开头（如 `2026-03-01-my-paper.md`）：

```yaml
---
title: "论文标题"
title_en: "Paper Title"          # 选填
collection: publications
category: manuscripts            # manuscripts=期刊论文, conferences=会议论文, books=专著
permalink: /publication/2026-my-paper
excerpt: '一句话摘要'
excerpt_en: 'One-line abstract.'  # 选填
date: 2026-03-01
venue: '期刊或会议名称'
citation: '武嘉文. 论文标题[J]. 期刊名, 2026, (01): 1-10.'
bibtex: |
  @article{wu2026mypaper,
    author  = {武嘉文},
    title   = {论文标题},
    journal = {期刊名},
    year    = {2026}
  }
---

正文可以在这里写，会显示在条目详情页。
```

加完这一篇，论文列表页、履历页「论文列表」、主页「近期成果」（按 `date` 自动取最新 3 篇）与 RSS feed 全部同步更新 —— 主页与履历页不再手抄论文清单，不存在「加了论文、主页忘了改」。

**一个项目** —— 在 `_portfolio/` 下新建文件，文件名以 `portfolio-6-`、`portfolio-7-` 递增开头，就会排在列表末尾：

```yaml
---
title: "项目名称"
title_en: "Project Name"          # 选填
excerpt: "一句话简介"            # 想配图就写 "<img src='/images/portfolio/xxx.svg'><br/>一句话简介"
collection: portfolio
permalink: /portfolio/my-project
---
```

**一场会议 / 暑校** —— 在 `_talks/` 下新建 `talk-9-xxx.md`：

```yaml
---
title: "会议名称"
collection: talks
type: "学术会议"                  # 会显示在条目标题下方
permalink: /talks/my-talk
venue: "主办单位"
location: "中国 · 南京"
datetext: "2026.05"              # 可留空，留空则页面上不显示时间
---
```

### 后台表单（Decap CMS）

<https://newnju.github.io/admin/> 是本站自带的网页后台，用 GitHub 账号登录，能直接改：

| 后台左侧的分类 | 对应文件 |
| --- | --- |
| 论文 / 项目 / 会议 / 教学 | `_publications/`、`_portfolio/`、`_talks/`、`_teaching/` 下的条目 |
| 页面（中）/ 页面（英） | `_pages/`、`_pages/en/` |
| 个人资料 | `_data/profile.yml`（教育、工作、联系方式） |
| 获奖与荣誉 | `_data/awards.yml` |
| 导航栏 | `_data/navigation.yml` |

几点要留意：

1. **保存 = 提交**。点 Save 会直接在 `main` 上产生一次 commit，走和手动 push 完全一样的流水线，出错同样会被 CI 拦住。
2. **后台没列出来的字段不会被改坏**（没动过就原样保留），但也没法在后台改。`_data/ui-text.yml` 与 `_data/authors.yml` **故意没纳入后台**，要改这两个走方式 A / B。
3. **新建条目**：集合右上角点 **New**，文件名自动按「日期 + 标题」生成，中文标题也能当文件名。
4. **正文框固定在 Markdown 原文模式**，粘贴 Markdown 原样保存，后台不会把 `{% include %}` 之类的代码改写坏。
5. 后台出问题就先用方式 A 改文件 —— 后台只是多一个入口，站点不依赖它。

字段配置在 `admin/config.yml`，校验规则在 `schemas/*.schema.json`。**两边必须一致**：
`tests/admin-config.test.mjs` 会自动逐字段比对，漏改一边 CI 就红。改字段时两边一起改。

#### 第一次用前要配一次登录

GitHub 登录走的是自建代理（client secret 不能写进公开仓库），**只需配一次**，
照 [`oauth-proxy/README.md`](oauth-proxy/README.md) 做完即可；之后**只有白名单里的
GitHub 账号**打开 `/admin/` 点登录能进，其余一律 403。

除了 OAuth App 的 client id / secret，还要配两个东西 —— **都填在仓库的
Settings → Secrets and variables → Actions 里，不要在本机跑 wrangler**：

| 名字 | 值 |
| --- | --- |
| `OAUTH_ALLOWED_USERS` | 自己的 GitHub 用户名。**不配 = workflow 拒绝部署；硬发的话后台登不进去** |
| `SITE_ORIGIN`（可选，普通变量即可） | Decap 前端来源，默认 `https://newnju.github.io` |

密钥与部署都由 `.github/workflows/workers.yml` 在 GitHub 上完成：推 main 即部署，
跑完用 `https://oauth.oaking.kdns.fr/healthz` 自检（`allowlist:true` 才算就绪）。
Cloudflare 的 API token 也只能由你在后台点出来，一次配好长期用 —— 完整清单见
[`oauth-proxy/README.md`](oauth-proxy/README.md) 第二节。

**「保存 = 提交」意味着登录权限等于仓库写权限**，所以那道门有三个属性值得记住：

- **默认拒绝**：白名单为空时 `/auth` 直接 503，不会「先放行再说」。改配置前如果
  `/admin/` 突然登不进去，先看 `healthz` 里的 `allowlist` 是不是 `false`。
- **服务端校验**：白名单是在 Worker 侧拿新换到的 token 调 `GET /user` 核对的，
  在 token 交到浏览器**之前**；不是靠前端藏按钮。
- **有审计记录**：每次登录尝试（开始 / 成功 / 被挡下 / state 不匹配 / 换 token 失败）
  都往 Workers Logs 写一行 JSON（谁、什么时间、哪个 IP、国家、城市）。Workers Logs
  默认只留 3 天；要留更久就在 `wrangler.toml` 里挂一个 Analytics Engine 的
  `AUDIT` 绑定，详见 README 的「审计记录」。

真要「随便谁都打不开」，还有一层：Cloudflare Access（Zero Trust）把
`oauth.oaking.kdns.fr` 挡在邮箱登录后面 —— 免费额度够，代价是多一次登录。

后台行为有单元测试，改 `oauth-proxy/worker.js` 之后跑一遍：

```bash
node --test tests/oauth-proxy.test.mjs
```

### 提交前自检

```bash
npm ci          # 第一次
npm run check   # 一键：校验 → 内容一致性 → 结构检查 → 40 个回归测试
```

`npm run check` 会挡掉这些问题：

| 命令 | 挡什么 |
| --- | --- |
| `npm run validate` | front matter 缺字段、类型不对、permalink 重复、`category` 拼错 |
| `npm run check:content` | 生成物与数据不同步 —— **只提示，不挡**：后台改完内容生成物必然过期，而后台没法跑生成器，所以 CI 每次 `jekyll build` 之前都会自动重新生成 |
| `npm run check:structure` | 列表塌成一段、Liquid 漏渲染、页面缺章节、薄包装片段里混进 Liquid、img 缺 width/height（CLS，图片加载完会把下面内容顶动） |
| `npm test` | JS 生成器与原 Liquid 模板**现场渲染**结果逐字节一致（40 个） |
| `npm run check:en` | 改了中文却没动对应 `*_en` 字段 —— **只提醒，不挡**（见下） |
| `npm run check:links` | 重复 id、假链接、站内 404、缺 alt、横向溢出 —— **只报不挡**（见下） |

CI 里这四步全部会跑，**任何一步红都不会部署**。构建产物上的四道（`check:structure` 后半段、`check:links`、`check:behavior`、`screenshots`）在 `jekyll build` 之后才跑，只有 `_site/` 存在时才执行，本地没装 Jekyll 会自动跳过并提示。

> 关键设计：所有比对都用**同一份当前数据现场渲染**，不依赖任何存下来的快照。
> 否则在后台改一个字，快照就过期了 —— 那等于白设门禁。

### 中英文是同一份数据，但要写两遍

**条目类内容（论文 / 项目 / 会议 / 教学 / 教育背景 / 工作 / 获奖 / 联系方式）本来就是一份数据、同一次构建出两版页面**，不需要「同步」机制 —— 生成器靠 `pick(中文, 英文, 是否英文页)` 取值：

```js
const text = pick(e.text, e.text_en, en);          // 履历条目
const title = pick(p.title, p.title_en, en);       // 项目 / 论文 / 会议
```

后台里中英字段也是并排的两个框，且 `*_en` 在 schema 里是 **`required` + `minLength: 1`** —— 漏填 CI 直接红。

**唯一需要人做的是英文措辞**，机器翻不出「校际合作学期交换」对应哪个英文说法。

有个坑是校验抓不到的：`*_en` 填了、但中文改了之后**忘了跟着改**，校验完全通过，英文页默默显示旧文案。`npm run check:en` 就是补这个洞 —— 它对比本次改动与上次提交，凡是「中文变了、对应 `*_en` 一字未动」就提一句：

```
en-sync: 1 处「改了中文、英文没动」
  ! _data/profile.yml — education[4].text_en：中文（text）「…」→「…」，但 text_en 仍是「…」
```

覆盖范围是所有成对字段（靠 `_en` 后缀自动识别，不写死清单）。有意的三种情况**不会**误报：

| 情况 | 为什么不算漏 |
| --- | --- |
| 中英一起改 | 两边都变了 |
| 只改英文 | 中文没动 |
| 有意把 `*_en` 清空 | 空值 = 主动回落中文，这是支持的用法 |

数组长度变了（插了新条目）会跳过深比较 —— 下标已不对齐，硬比会误报。

**不覆盖页面正文**：`_pages/about.md` 和 `_pages/en/about.md` 是两个独立文件，散文部分本来就各写各的（只有它们引用的那些数据驱动片段是共享的）。

只提醒不挡部署 —— 这是编辑习惯问题，不是构建错误。想让它挡就加 `--strict`。

> 构建产物那部分检查（`check:structure` 的后半段）只有在 `_site/` 存在时才跑。
> 本地没装 Jekyll 会自动跳过并提示；CI 是在 Jekyll 构建完之后才执行它，所以线上部署前一定能拦到。

**第五道：链接与可访问性**（`npm run check:links`，需要 `_site/`）

起一个本地静态服务，用 Chromium 顺着页面里的链接把全站爬一遍，抓「Jekyll 构建成功、
页面看着也正常，但 HTML 是坏的」那一类问题：

| 抓什么 | 真实案例 |
| --- | --- |
| 重复 id | 缩略图把整个 `<body>` 克隆了一份，于是 `main`、`svgpx`、`荣誉`… 每个 id 都出现两次 |
| 假链接 `href="#"` / `href=""` | 禁用的「上一页／下一页」写成 `<a href="#">`：读屏念成链接、Tab 能停、点了地址栏多个 `#` |
| 外链 `target=_blank` 缺 `rel=noopener` | tabnabbing |
| 站内链接 404、锚点不存在 | 顺着链接爬，资源也一起验 |
| 图片缺 alt、横向溢出、JS 报错 | |

这套检查的来历：一次审计顺手爬了全站，发现上面前两类**真实存在**，而构建日志里一个字都没提。

只报不挡（`--strict` 可改成挡），历史遗留一次清完比每次拦着更现实。

**第六道：交互行为**（`npm run check:behavior`，需要 `_site/`）

用 Chromium 真点一遍：主题按钮翻转 `data-theme` 与图标类、`localStorage` 落盘、刷新后记住、
联系方式折叠展开与收起、顶栏在 1366px / 760px 之间的折行与复原、`--han-masthead-h` 与
`body` 上内边距一致，以及中文详情页的微信分享弹层（摘掉 `hidden`、点开才下载二维码库、
`role="dialog"` 与 `aria-expanded` 同步、二维码画得出来、ESC 关闭、1366px 不横向溢出）。

**资源一律按本地 `_site` 取**：页面里的 CSS/JS 全是绝对地址（`_config.yml` 的 `site.url`
经 `_includes/base_path` 拼成 `base_path`），浏览器于是会去**生产站**拿，这道检查测的其实是
线上旧版 —— 新脚本一天没部署，它就一天测不到，还会把「还没上线」判成「上线后是坏的」（分享
按钮那次 CI 红正是这个）。现在跨 origin 的请求按路径改回本地 `_site`：磁盘上有就用本地的
（那才是被测对象），没有才放行（打点端点、外链本来就该出去）。

它的来历：把 jQuery 换成原生 JS 时，**截图只能看外观，看不出「点了有没有反应」**。
换库前后跑同一套断言，输出必须逐条一致（实测 `count`、`hidden`、`58.5px` 这些值完全相同），
这才是敢动主题脚本的底气。

**第七道：截图回归**（`npm run screenshots`，同样要先有 `_site/`）

用 Chromium 真的把首页、履历、时间轴等 9 个页面各截一张（桌面 + 手机两种宽度），顺带查
结构检查看不出来的问题：横向溢出、同源资源 404、JS 运行时报错、图片缺 `alt`、链接缺 `href`。
截图落在 `screenshots/`（已 gitignore）。

CI 里还会拿它和 `tests/__screenshots__/` 的基线做**像素比对**，无论成败都把截图与差异图
（`*-diff.png`）作为 artifact 上传，点开就能看见现场。

这里要分清两类结果：

| 类别 | 处理 | 原因 |
| --- | --- | --- |
| 运行时断言（溢出 / 404 / JS 报错 / 缺 alt、href） | **失败即挡住部署** | 确定性，每次都一样 |
| 像素比对 | **只报不挡**（加 `--strict-pixels` 可改成挡住） | 见下 |

像素比对不能当门禁的原因：18 张里通常有 16 张差异为 **0.000%**，但**侧栏那段作者简介**会
偶发「同样字号、同样换行、粗细却不同」的栅格化抖动，差异可达 1.2% —— 而真回归（少一个列表项）
只有 0.27%。**噪声比信号还大**，调阈值无法区分，与其天天误报挡部署，不如只当人工复核的线索。
内容、结构的真回归由上面四道确定性的关卡负责。

基线必须在 CI 环境下生成（字体渲染在 Windows 和 Linux 上必然不同），首次从 artifact 取回提交即可。

### 五个容易踩的坑

1. **`permalink` 不能重复**。两个条目用同一个 permalink，后一个会覆盖前一个。建议沿用「日期 + 短标题」的命名。
2. **日期格式必须是 `YYYY-MM-DD`**，写成 `2026.03.01` 会报错。会议条目的 `datetext` 是普通文字，不受此限制。
3. **YAML 里的引号要配对**。`title: "标题` 少一个引号会导致整页构建失败。标题里如果有英文冒号 `:`，务必用引号包起来。
4. **`category` 填错不会丢条目**（已做兜底）：填了 `manuscripts`/`conferences`/`books` 之外的词，或干脆没填，会归到「其他」分组里，不会被静默丢掉。
5. **`awards.yml` 的 `level` 只能填那五个词**，填别的会没有颜色和文字标签（不影响页面生成）。

> 改完发现页面没更新？先在本地跑 `npm run check`（见上一节），它会直接指出是哪个文件的哪一行。
> 本地没跑就先去仓库的 **Actions** 标签页看构建状态：红色叉号说明构建失败，点进去能看到具体是哪一行出的问题，通常是 YAML 格式。

---

## 五、本地预览（可选）

站点在 GitHub 上由 Jekyll 自动构建，本地预览不是必需的。

如果你想在本地看效果，需要先安装 Ruby 与 Jekyll：

```bash
gem install bundler jekyll
bundle install
bundle exec jekyll serve
```

然后访问 <http://127.0.0.1:4000>。Windows 下 Ruby 安装建议使用 [RubyInstaller](https://rubyinstaller.org/) 的 **Ruby+Devkit** 版本。

---

## 六、目录结构速查

```
├── _config.yml          站点全局配置（标题、作者、侧栏、分类名、中英双份字段）
├── _data/
│   ├── navigation.yml   顶部导航（含 title_en）
│   ├── ui-text.yml      界面文案（zh / en 两段，已含本站自定义键）
│   ├── awards.yml       获奖与荣誉数据（/timeline/ 的唯一数据源）
│   └── authors.yml      多作者署名
├── _includes/           页面片段（含 han-mirror / han-timeline / han-awards / han-bibtex）
│   └── generated/       由 JS 生成器产出的片段（不要手改，改了 CI 会红）
├── _layouts/            页面布局
├── _pages/              独立页面：about / cv / publications / portfolio / talks / teaching / timeline
│   └── en/              对应的英文页面
├── _sass/
│   ├── theme/_han_*.scss  han 主题的明暗两套色值
│   └── _han.scss         自定义样式层（纯 CSS）
├── _publications/       论文条目
├── _portfolio/          项目与作品条目
├── _talks/              会议与暑期学校条目
├── _teaching/           教学与助教条目
├── admin/               Decap CMS 网页后台（config.yml 是字段定义）
├── oauth-proxy/         GitHub 登录的 Cloudflare Worker 代理（不发布到站点；安全边界见其 README）
├── analytics/           访客统计的 Cloudflare Worker + D1（不发布到站点；默认关闭，见其 README）
├── schemas/             内容校验规则（validate.mjs 读这里）
├── tools/               内容生成器、校验器、结构检查器、中英同步与自动翻译（npm run check 跑这些）
├── tests/               回归测试（npm test，66 个：渲染产物、Decap 字段一致性、OAuth 门、访客统计）
├── .github/workflows/   CI：pages.yml 先校验测试再 Jekyll 构建、检查产物、部署站点；workers.yml 部署两个 Cloudflare Worker
├── assets/              样式与脚本（han.js 为本站自定义脚本：BibTeX 复制、引用复制、缩略图导航；页面引的 *.min.js 由 npm run build:js 从同目录源码压缩）
├── robots.txt           允许全站抓取，并声明 Sitemap 位置
└── images/              图片与头像
```

---

## 七、许可

站点内容（简历、文字、图片）版权归武嘉文所有。

主题模板 Academic Pages 基于 MIT 协议，原作者为 Michael Rose 与 Robert Zupko，见 `LICENSE`。
