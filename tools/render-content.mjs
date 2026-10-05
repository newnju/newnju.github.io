#!/usr/bin/env node
// 把 _data/*.yml 与各集合的 front matter 渲染成 _includes/generated/*.html，
// 供 _includes/han-*.html 的薄包装 include。
//
//   node tools/render-content.mjs           生成/覆盖
//   node tools/render-content.mjs --check   只比对，有漂移就退出码 1（CI 用）
//
// 为什么提交生成物：Pages 切到 GitHub Actions 之前，分支构建仍然要用它们；
// 提交了才能「先让 CI 绿、再切源」，两步之间站点始终可用。
// 漂移由 --check 抓 —— 只改数据忘了重新生成，或者手改了生成物，都会红。
import fs from 'node:fs';
import path from 'node:path';
import { SITE_ROOT } from './lib/content.mjs';
import { renderFragment } from './lib/render.mjs';
import { TEMPLATES, LOCALES } from './capture-reference.mjs';

const OUT_DIR = path.join(SITE_ROOT, '_includes', 'generated');
const check = process.argv.includes('--check');

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
      console.error(`✗ _includes/generated/${target.name} 与数据不同步`);
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
    console.error(`\n${stale} 个生成文件过期 —— 跑 \`npm run build:content\` 后重新提交。`);
    process.exit(1);
  }
  console.log(`内容生成物与数据一致（${targets.length} 个文件）。`);
}
