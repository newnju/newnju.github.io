# 参与贡献

这是武嘉文的个人学术主页（<https://newnju.github.io>）。欢迎提交问题报告与改进建议；
涉及个人简历、论文列表、照片等内容的数据更正，请先开 issue 或直接邮件联系，不要直接改内容文件。

## 本地环境

| 依赖 | 版本 | 用途 |
| --- | --- | --- |
| Ruby + Bundler | 与 `Gemfile` 一致（`github-pages`） | Jekyll 构建 |
| Node.js | >= 20（CI 用 22） | 校验、构建脚本、行为测试 |
| Playwright Chromium | `npx playwright install chromium` | `check:404` / `check:pwa` / `check:lh` |

```bash
npm ci
bundle install
bundle exec jekyll serve   # http://127.0.0.1:4000
```

## 提交前自检

```bash
npm run check
```

它会依次跑：front matter 校验 → 内容生成物一致性 → 结构检查 → ESLint → `tsc --noEmit` → 回归测试（当前 110 个）。

改到下面这些地方时，再补跑对应命令：

| 改动 | 必须跑 |
| --- | --- |
| `assets/js/*.js` | `npm run build:js`，并提交更新后的 `*.min.js`（`npm run check:min-sync` 逐字节守护） |
| 新增 Font Awesome 图标 | `npm run fonts`（子集字体），再 `npm run check:icons` |
| 404 页脚本 | 保持外链：`compress_html` 会破坏内联 `//` 注释 |
| 中文字段 | 同步 `*_en`；`npm run check:en` 与 `npm run check:translate` 会提醒漂移 |
| 页面结构 / 样式 | `npm run check:links`、`npm run check:behavior`、`npm run screenshots` |
| PWA / Service Worker | `npm run check:pwa`（真浏览器断网断言） |
| 性能相关 | `npm run check:lh`（需先构建 `_site/`；CI 是主场） |

每道闸门具体挡什么，见 README 的「提交前自检」。

## 设计约束

- **运行时零外部依赖**：页面不引 CDN、不引第三方字体/统计脚本；`devDependencies` 只用于构建与校验。
- **源文件与产物同批提交**：`*.js` 与 `*.min.js`、`_data` 与生成的内容片段，不能只改一半。
- **中英同源**：条目数据一次维护、两版渲染；英文措辞需要人工确认，机器翻译只做草稿。
- **可访问性与性能是门禁**：Lighthouse 预算、DOM 行为、PWA 离线都有 CI 断言，不接受「先合并再修」。

## 提交与 PR

- 改动建议走 `feat/…`、`fix/…`、`docs/…` 分支并发起 PR；维护者直接推 `main` 时同样要让 CI 全绿。
- 提交信息用 `类型: 摘要`（`feat` / `fix` / `docs` / `ci` / `refactor` / `test` / `chore`），正文写「为什么」，不要复述 diff。
- PR 必须让 `Pages / check` 与 `Pages / build` 全绿；deploy 关的金丝雀在生产站失败时同样视为未完成。
- 视觉改动请在 PR 里附截图，或说明 `screenshots/` 的对比结果。

## 许可证

代码以 MIT 发布（见 [`LICENSE`](LICENSE)）；站点内容版权归作者所有，见 README 的「许可」一节。
