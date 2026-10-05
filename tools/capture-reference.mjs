#!/usr/bin/env node
// 一次性工具：把 tools/reference-liquid/ 里的原始 Liquid 模板渲染成基准文件，
// 写进 tests/fixtures/liquid/。基准文件是生成器的「外部真值」——
// 之后 tools/lib/render.mjs 的任何改动都必须逐字节复现这些输出。
//
// 只有在**有意**改变渲染语义时才需要重跑（npm run capture:reference），
// 重跑前请先确认参考模板本身没有被误改。
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
      console.log(`tests/fixtures/liquid/${name}.${locale}.html  (${html.length} B)`);
    }
  }
}
