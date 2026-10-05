// 薄包装回归测试：渲染**真正的** _includes/han-*.html（含 {%- include %} 与
// 语言分支），断言输出与 Liquid 基准 fixture 完全一致。
// 这条测试证明「把循环搬进生成器、原文件改成薄包装」这一步没有改变任何输出。
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { Liquid } from 'liquidjs';
import { SITE_ROOT } from '../tools/lib/content.mjs';
import { buildContext, liquidFilters } from '../tools/lib/jekyll-context.mjs';
import { TEMPLATES, LOCALES, renderReference } from '../tools/capture-reference.mjs';

function engine() {
  const engine = new Liquid({
    jekyllInclude: true,
    relativeFilesystem: true,
    root: [path.join(SITE_ROOT, '_includes')],
    strictVariables: false,
  });
  for (const [key, fn] of Object.entries(liquidFilters)) engine.registerFilter(key, fn);
  return engine;
}

for (const name of TEMPLATES) {
  for (const locale of LOCALES) {
    test(`包装 ${name} (${locale}) 输出 == Liquid 基准`, async () => {
      const source = await import('node:fs').then((fs) =>
        fs.readFileSync(path.join(SITE_ROOT, '_includes', `${name}.html`), 'utf8')
      );
      const actual = await engine().parseAndRender(source, buildContext(locale));
      const expected = await renderReference(name, locale);
      assert.equal(actual, expected);
    });
  }
}
