#!/usr/bin/env node
// 把 tools/reference-liquid/ 里的原始 Liquid 模板渲染一遍 —— 这就是生成器的「外部真值」。
//
// 这里的 renderReference() 是**每次现场渲染**的（吃当前的 _data 与 front matter），
// tests/render.test.mjs 直接调它跟 JS 生成器逐字节比。这样改任何内容都不会让测试失效，
// 而「JS 重写有没有改变渲染语义」反而被更强地保证：任何分歧当场暴露。
//
// 直接跑本文件（npm run capture:reference）会把渲染结果写到 tests/fixtures/liquid/，
// 留一份便于肉眼对照的快照。这**不是**测试用的基准 —— 快照会随内容过期，所以它不进断言。
import fs from 'node:fs';
import path from 'node:path';
import { Liquid } from 'liquidjs';
import { SITE_ROOT } from './lib/content.mjs';
import { buildContext, liquidFilters } from './lib/jekyll-context.mjs';

export const TEMPLATES = [
  'han-education',
  'han-honours',
  'han-awards',
  'han-contact',
  'han-recent-pubs',
  'han-cv-timeline',
  'han-timeline',
];

export const LOCALES = ['zh', 'en'];

export async function renderReference(name, locale) {
  const source = fs.readFileSync(
    path.join(SITE_ROOT, 'tools', 'reference-liquid', `${name}.html`),
    'utf8'
  );
  const engine = new Liquid({ strictVariables: false });
  for (const [key, fn] of Object.entries(liquidFilters)) engine.registerFilter(key, fn);
  return engine.parseAndRender(source, buildContext(locale));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).endsWith('capture-reference.mjs');
if (isMain) {
  const outDir = path.join(SITE_ROOT, 'tests', 'fixtures', 'liquid');
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of TEMPLATES) {
    for (const locale of LOCALES) {
      const html = await renderReference(name, locale);
      fs.writeFileSync(path.join(outDir, `${name}.${locale}.html`), html, 'utf8');
      console.log(`tests/fixtures/liquid/${name}.${locale}.html  (${html.length} B)  ← 仅供肉眼对照`);
    }
  }
}
