#!/usr/bin/env node
// 把 _data/*.yml 与各集合的 front matter 渲染成 _includes/generated/*.html，
// 供 _includes/han-*.html 的薄包装 include。
//
//   node tools/render-content.mjs             生成/覆盖
//   node tools/render-content.mjs --check     只比对，有漂移就退出码 1
//   node tools/render-content.mjs --check --warn  只比对，漂移只提示（退出码 0）
//
// 为什么还提交生成物：Pages 切到 GitHub Actions 之前，分支构建仍然要用它们；
// 提交了才能「先让 CI 绿、再切源」，两步之间站点始终可用。
//
// 为什么漂移不再挡部署：**后台（Decap）只能写文件，没法跑这个脚本**。
// 在后台改任何会影响生成物的内容（项目、会议、获奖、个人资料……），生成物就会
// 立刻过期 —— 让漂移红，等于「用后台改一个字就发不上去」。所以：
//   · build job 每次 jekyll build 之前都重新生成一遍，产物永远是最新的；
//   · npm run check 里只提示（--warn），不挡部署；
//   · 真出问题由生成之后的结构断言和截图断言兜着 —— 那两道看的是最终 HTML。
import fs from 'node:fs';
import path from 'node:path';
import { SITE_ROOT } from './lib/content.mjs';
import { renderFragment } from './lib/render.mjs';
import { TEMPLATES, LOCALES } from './capture-reference.mjs';

const OUT_DIR = path.join(SITE_ROOT, '_includes', 'generated');
const check = process.argv.includes('--check');
const warn = process.argv.includes('--warn');

function wrap(fragment) {
  // raw 包一层：万一将来有人在引用、标题里写了 {{ 或 {%，Jekyll 也不会去解析它。
  return `{% raw %}${fragment}{% endraw %}`;
}

const targets = TEMPLATES.flatMap((template) =>
  LOCALES.map((locale) => ({
    name: `${template}.${locale}.html`,
    fragment: template.replace(/^han-/, ''),
    locale,
  }))
);

fs.mkdirSync(OUT_DIR, { recursive: true });

let stale = 0;
for (const target of targets) {
  const expected = wrap(renderFragment(target.fragment, target.locale, { limit: 3 }));
  const file = path.join(OUT_DIR, target.name);
  const actual = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;

  if (check) {
    if (actual !== expected) {
      stale += 1;
      const msg = `_includes/generated/${target.name} 与数据不同步`;
      if (warn) console.warn(`! ${msg}`);
      else console.error(`✗ ${msg}`);
    }
    continue;
  }

  if (actual === expected) {
    console.log(`= _includes/generated/${target.name}（未变）`);
    continue;
  }
  fs.writeFileSync(file, expected, 'utf8');
  console.log(`✓ _includes/generated/${target.name}`);
}

if (check) {
  if (stale > 0) {
    if (warn) {
      console.warn(
        `\n${stale} 个生成文件过期 —— 不影响部署，build job 会在 jekyll build 前自动重新生成。` +
          `\n想现在就把仓库里这份也同步掉：npm run build:content`,
      );
    } else {
      console.error(`\n${stale} 个生成文件过期 —— 跑 \`npm run build:content\` 后重新提交。`);
      process.exit(1);
    }
  } else {
    console.log(`内容生成物与数据一致（${targets.length} 个文件）。`);
  }
}
