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

配色取自汉代青铜镜与同期漆器：

| 颜色 | 色值 | 用途 |
| --- | --- | --- |
| 铜锈绿 | `#2f6b5a` | 主色：链接、时间轴节点、镜图 |
| 朱砂 | `#9e2b25` | 强调：标题左侧竖线、当前导航项下划线、国家级标签 |
| 宣纸 | `#fbf8f1` | 页面底色（不是纯白） |
| 错金 | `#b08d3f` | 国际级标签 |

- 主题由 `_config.yml` 的 `site_theme: "han"` 启用，对应 `_sass/theme/_han_light.scss` 与 `_han_dark.scss`
- 明暗切换用右上角的太阳 / 月亮图标（跟随系统偏好，也可手动固定）
- 想要别的颜色，只改这两个文件顶部那十几行色值即可；深绿在暗背景上不可读，所以暗色版把铜锈绿提亮成了 `#7cbfa2`
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
- 等 `load` 而非 `DOMContentLoaded` 再初始化，否则图片未就位、页面总高度偏小，比例会算错
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
| **首页自我介绍** | `_pages/about.md` |
| **履历页（教育、工作、荣誉、获奖、证书、技能）** | `_pages/cv.md` |
| **获奖与荣誉的数据**（`/timeline/` 时间轴 + 首页「荣誉」与「获奖」两节） | `_data/awards.yml`。`key: honours` 那一组是「荣誉」，单独显示在首页「荣誉」小节；其余年份分组显示在首页「获奖」小节与时间轴页 |
| 论文条目 | `_publications/` 下的 Markdown 文件 |
| 项目与作品条目 | `_portfolio/` 下的 Markdown 文件 |
| 会议与暑期学校条目 | `_talks/` 下的 Markdown 文件 |
| 教学 / 助教条目 | `_teaching/` 下的 Markdown 文件 |
| **英文版页面** | `_pages/en/` 下的同名文件 |
| 首页的博局镜图 | `_includes/han-mirror.html` |
| 头像 | `images/avatar.png`（400×400、正方形、背景已抠透明）。尺寸与位置在 `_sass/_han.scss` 第 6 节：照片本体 152px、圆圈（含光圈）162px，整体上移 22px、左移 8px。**头像必须是正方形**，主题用 `border-radius: 50%`，非正方形会被裁成椭圆。`images/profile.svg` 是备用的「武」字头像 |
| 项目配图 | `images/portfolio/` 下的 SVG 封面 |

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

**一个项目** —— 在 `_portfolio/` 下新建文件，文件名以 `portfolio-6-`、`portfolio-7-` 递增开头，就会排在列表末尾：

```yaml
---
title: "项目名称"
title_en: "Project Name"          # 选填
excerpt: "<img src='/images/portfolio/xxx.svg'><br/>一句话简介"
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
├── files/               放 PDF 等附件（如论文全文）
└── images/              图片与头像
```

---

## 七、许可

站点内容（简历、文字、图片）版权归武嘉文所有。

主题模板 Academic Pages 基于 MIT 协议，原作者为 Michael Rose 与 Robert Zupko，见 `LICENSE`。
