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
- 图相对常规浮动位置**上移 30px**；大屏（≥925px，即主题的 `$large`）再**右移 60px**（`_sass/_han.scss` 第 2 节的 `top` 与紧随其后的媒体查询），更贴近页面右上角；窄屏（≤600px）上移归零、恢复居中
- 右移要设 925px 这道门槛，是因为该宽度起 `.page` 才用 `span(10 of 12) + suffix(2 of 12)`、正文栏右侧空出约 2/12 宽的空白栏，右移 60px 仍落在栏内；而 925px 以下 `.page` 占满整行，图离视口右缘只剩约 19px，硬移会把整页撑出横向滚动条（实测 700 / 900px 各溢出 40 余 px）
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
```

等级标签的颜色和文字（中英）都自动处理，不用碰 HTML。

其中带 `key: honours` 的那一组（显示名「荣誉」）会**单独渲染到首页的「荣誉」小节**，所以那几条就是主页上显示的内容；
其余年份分组则渲染到首页的「获奖」小节（紧凑版，不带等级标签）。首页与时间轴都按 `key` 取这一组，
所以改 `year` 的显示文字不会影响首页。条目的 `text_en`、补充说明的 `note_en` 与分组的 `year_en` 都是选填，英文页优先取它们、缺省回落中文。

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

实现方式是克隆整页 DOM，用 `transform: scale()` 缩进 132px 宽的窄条里，只动视口方块的位置，不触发重排。

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
窄条固定 132px，只有视口恰好 1320px 时 `132 / 1320` 才等于 0.1：再宽缩略图比窄条宽、
右缘被裁（1440px 时裁掉约 12px），再窄则右侧留白。所以先 `document.body.appendChild(shell)`
再量宽度 —— 窄条是 `position: fixed`，不参与排版，这一步不会改变随后量到的页面宽高。
改动后实测 1200 / 1440 / 1920px 三种视口下，克隆体宽度都与窄条可视宽度（131px）严丝合缝。

**跟随滚动**分两条路，都为「不滞后」服务：

- 支持 `animation-timeline: scroll()` 的浏览器（Chrome 115+ 等）交给 CSS 滚动驱动动画，
  方块在合成线程上跟随滚动条，拖滚动条时与内容完全同步；
- 其余浏览器回退到 JS 监听 `scroll`，**刻意不做 `requestAnimationFrame` 节流** ——
  节流会让方块比滚动条慢一帧，拖滚动条时肉眼可见滞后。每次滚动只写一次 `transform`，开销可以接受。

**拖动缩略图**用 Pointer Events：按下即定位、拖动即跟随、松手结束，并用 `setPointerCapture` 保证
指针移出窄条后仍收得到事件。这里必须即时定位（`scrollTo(0, y)`），**不能用**
`scrollTo({behavior: "smooth"})` —— smooth 会把拖动途中的每个目标位置排成一段动画，指针早已移开、
画面还在追，于是拖动感明显滞后；原生滚动条跟手，正是因为它没有动画队列。样式里的
`touch-action: none` 则避免触屏把这次按下当成翻页手势。

还有一处隐蔽的坑：主题在 `html` 上写了 `scroll-behavior: smooth`（`_sass/layout/_base.scss`），
这条规则会让**不带参数的** `scrollTo(0, y)` 也走动画，把刚修掉的滞后悄悄请回来。
所以定位时临时把根元素的内联 `scroll-behavior` 压成 `auto`、滚完立即还原
（`assets/js/han.js` 的 `scrollToPoint`），页内锚点的平滑滚动不受影响。
改动这段后务必实测：拖动缩略图时页面应逐帧跟手，而不是「慢慢追上」。

几个要点：

- 克隆体里的 `fixed` / `sticky` 元素必须压回普通流，且**这一步要在删除节点之前做**，
  否则原树与克隆树的元素索引会错位，定位修正整体失效
- 侧栏 `.sidebar` 在宽屏下是 `position: fixed` + `height: 100vh`，在缩略容器里既脱离文档流
  又占满整屏，因此缩略图内直接隐藏，只呈现正文
- 初始化不等 `load` 才第一次建图（图片与字体就位后再校正比例），而是「解析完成 + 同源样式就位」即建，见上面的「出现时机」；否则外链一慢，缩略图要等十几秒
- 比例按宽度定，缩略图通常比窄条矮（1440px 下首页 320px、最长的一页 cv 370px，都远低于 800px 的窄条）；
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

**光标光斑**（`assets/js/han.js` 第 7 节 + 第 14 节样式）：一团 420px 的柔光跟着指针走。只在精细指针（`hover: hover and pointer: fine`）上启用，`requestAnimationFrame` 节流每帧最多写一次坐标；没有这段脚本时色斑停在默认坐标，不影响任何内容。

**滚动渐显**（`_includes/head/custom.html` 内联引导 + `han.js` 第 6 节 + 第 15 节样式）：列表卡片、时间轴条目、荣誉条目、内容区小标题进入视口时轻微上浮淡入，只触发一次。三重兜底保证「动效坏了也不藏内容」：隐藏态只在 `<html data-reveal>` 与 `.han-reveal` 同时存在时才生效（引导脚本没跑、用户开了减少动效，正文照常可见）；`han.js` 里没有 IntersectionObserver 或没选中元素会立刻撤销标记；内联脚本 3 秒没等到 `han.js` 的就绪标记 `__hanRevealReady` 也自动撤销。

**hover 微交互**（第 16 节）：卡片上浮 3px、时间轴与荣誉条目右移 4px 并染品牌色，仅限有指针且不介意动效的设备（`@media (hover: hover)` 门控）。

**侧栏线稿自绘**（`assets/js/vivus.js` + `han.js` 第 8 节 + 第 20 节样式）：侧栏联系方式列表（电子邮件、GitHub 等）下方有一幅线稿，滚进视口时由 vivus.js（MIT，maxwellito/vivus v0.4.6，npm dist 原样 vendor 在 `assets/js/vivus.js`）逐笔错峰描出，约 3.3 秒画完。素材是南大官网 www.nju.edu.cn「数说南大」背景 SVG（1 polygon + 8 polyline），内联在 `_includes/author-profile.html` 尾部 —— 只要页面渲染作者侧栏就有这幅图；vivus 的 `<script>` 在 `_includes/scripts.html` 用**同一条件**（`page.author_profile or layout.author_profile`，与 `sidebar.html` 引入侧栏的条件一致，全站各集合 front matter 默认 true）加载，所以凡是有联系方式列表的页面都带动画，没有侧栏的页面两者都不出现。三重兜底：`window.Vivus` 不存在直接退出；`han.js` 里没有 `#svgpx` 直接退出；**reduced-motion 用户不创建 Vivus —— SVG 平时就是完整线稿，只有被创建时才会先藏起来等动画，所以「不创建」= 静态全图**。线稿描边颜色走 `--han-patina`，南大紫 / 青铜绿 / 暗色主题自动跟随。

**减少动效与打印**（第 17 节）：系统开启「减少动态效果」时新老动效一并静止（含博局镜旋转与呼吸、缩略图进度、流光、光斑、渐显）；打印时两层装饰不印、渐显元素直接给完整不透明度，不会打出来一片空白。

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

### 改哪里

| 想改什么 | 改哪个文件 |
| --- | --- |
| 站点标题、简介、侧栏信息、联系方式 | `_config.yml` |
| 顶部导航栏的栏目与顺序 | `_data/navigation.yml` |
| 界面按钮文案（中文 / 英文） | `_data/ui-text.yml` 的 `zh` / `en` 段 |
| **主题配色** | `_sass/theme/_han_light.scss`、`_han_dark.scss` |
| **动态背景、光斑、滚动渐显**（第 13–17 节） | `_sass/_han.scss` 末尾几节 + `assets/js/han.js` 第 6–7 节；色斑与光斑配色的变量在 `_sass/theme/_han_*.scss` 与 `_han.scss` 第 8 节 |
| **侧栏线稿自绘**（南大官网「数说南大」背景线稿，凡有侧栏联系方式列表的页面） | SVG 内联在 `_includes/author-profile.html` 尾部；动画库 vendor 在 `assets/js/vivus.js`、加载在 `_includes/scripts.html`（门控 `page.author_profile or layout.author_profile`，与 `sidebar.html` 引入侧栏同一条件）；初始化是 `assets/js/han.js` 第 8 节；描边颜色与尺寸在 `_sass/_han.scss` 第 20 节（`--han-patina`） |
| **首页自我介绍** | `_pages/about.md` |
| **教育背景、联系方式、工作与任职**（主页与履历、中英四处同步更新） | `_data/profile.yml`（education / work / contact；条目上的 `period` 字段决定它进履历哪段时期块）。渲染逻辑在 `_includes/han-education.html` / `han-contact.html`，履历合并时间轴在 `han-cv-timeline.html`，一般不用动 |
| **履历页结构**（章节顺序、证书、技能） | `_pages/cv.md` 与 `_pages/en/cv.md`。「学历与经历」一节已改由 `_data` 与集合驱动，见上下几行 |
| **履历时间轴的分期与内容**（博士 / 硕士 / 本科三个学历大块，过渡期内容排在博士与硕士块之间；块内嵌任职、项目、获奖，均为裸列表不加小节标签） | `_data/profile.yml` 的 `period`（phd / gap / master / bachelor）、`_data/awards.yml` 各条目的 `period`、`_portfolio/*` 的 `period`；标题样式在 `_sass/_han.scss` 第 19 节 |
| **获奖与荣誉的数据**（`/timeline/` 时间轴 + 首页「荣誉」「获奖」两节 + 履历时间轴与「荣誉」节） | `_data/awards.yml`。`key: honours` 那一组是「荣誉」，单独显示在首页与履历页的「荣誉」小节（不参与分期）；其余年份分组显示在「获奖」小节、时间轴页，并按 `period` 进履历时期块 |
| 论文条目 | `_publications/` 下的 Markdown 文件。论文页、履历页「论文列表」、主页「近期成果」（自动取最新 3 篇）与 RSS feed 全部随它更新，不用手改页面 |
| 项目与作品条目 | `_portfolio/` 下的 Markdown 文件。front matter 的 `date`（排序）、`daterange`（履历展示的日期跨度，如 `2019.09 – 2021.09`）、`period`（进履历哪段时期块）会同步到履历时间轴 |
| 会议与暑期学校条目 | `_talks/` 下的 Markdown 文件 |
| 教学 / 助教条目 | `_teaching/` 下的 Markdown 文件 |
| **英文版页面** | `_pages/en/` 下的同名文件 |
| 首页的博局镜图 | `_includes/han-mirror.html` |
| 头像 | `images/avatar.png`（400×400、正方形、背景已抠透明）。尺寸与位置在 `_sass/_han.scss` 第 6 节：照片本体 152px、圆圈（含光圈）162px，整体上移 22px、左移 8px。**头像必须是正方形**，主题用 `border-radius: 50%`，非正方形会被裁成椭圆。`images/profile.svg` 是备用的「武」字头像 |
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

### 五个容易踩的坑

1. **`permalink` 不能重复**。两个条目用同一个 permalink，后一个会覆盖前一个。建议沿用「日期 + 短标题」的命名。
2. **日期格式必须是 `YYYY-MM-DD`**，写成 `2026.03.01` 会报错。会议条目的 `datetext` 是普通文字，不受此限制。
3. **YAML 里的引号要配对**。`title: "标题` 少一个引号会导致整页构建失败。标题里如果有英文冒号 `:`，务必用引号包起来。
4. **`category` 填错不会丢条目**（已做兜底）：填了 `manuscripts`/`conferences`/`books` 之外的词，或干脆没填，会归到「其他」分组里，不会被静默丢掉。
5. **`awards.yml` 的 `level` 只能填那五个词**，填别的会没有颜色和文字标签（不影响页面生成）。

> 改完发现页面没更新？去仓库的 **Actions** 标签页看构建状态。红色叉号说明构建失败，点进去能看到具体是哪一行出的问题，通常是 YAML 格式。

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
├── assets/              样式与脚本（han.js 为本站自定义脚本：BibTeX 复制、引用复制、缩略图导航）
├── robots.txt           允许全站抓取，并声明 Sitemap 位置
└── images/              图片与头像
```

---

## 七、许可

站点内容（简历、文字、图片）版权归武嘉文所有。

主题模板 Academic Pages 基于 MIT 协议，原作者为 Michael Rose 与 Robert Zupko，见 `LICENSE`。
