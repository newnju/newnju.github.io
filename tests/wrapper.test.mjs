// 薄包装回归测试：渲染**真正的** _includes/han-*.html（含 {%- include %} 与
// 语言分支），断言输出与原 Liquid 模板的现场渲染完全一致。
// 这条测试证明「把循环搬进生成器、原文件改成薄包装」这一步没有改变任何输出。
//
// 关键设计：include 根目录用的是**临时目录 + 现场生成**的 generated/*.html，
// 而不是仓库里那一份。理由和 render.test.mjs 一样 —— 仓库里那份在后台改完内容后
// 必然过期，而 CI 每次构建都会重新生成，所以测试也应该吃新鲜的：
// 否则「用后台改一个字」就会让这条测试红，等于白设门禁。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Liquid } from 'liquidjs';
import { SITE_ROOT } from '../tools/lib/content.mjs';
import { buildContext, liquidFilters } from '../tools/lib/jekyll-context.mjs';
import { renderFragment } from '../tools/lib/render.mjs';
import { TEMPLATES, LOCALES, renderReference } from '../tools/capture-reference.mjs';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'han-includes-'));
process.on('exit', () => fs.rmSync(tmpRoot, { recursive: true, force: true }));

fs.mkdirSync(path.join(tmpRoot, 'generated'), { recursive: true });
for (const name of TEMPLATES) {
  // 原封不动地复制薄包装本身（它只 include generated/*，不需要其他片段）
  fs.copyFileSync(
    path.join(SITE_ROOT, '_includes', `${name}.html`),
    path.join(tmpRoot, `${name}.html`),
  );
  for (const locale of LOCALES) {
    // 和 tools/render-content.mjs 写盘时一样包一层 raw
    const fragment = renderFragment(name.replace(/^han-/, ''), locale, { limit: 3 });
    fs.writeFileSync(
      path.join(tmpRoot, 'generated', `${name}.${locale}.html`),
      `{% raw %}${fragment}{% endraw %}`,
      'utf8',
    );
  }
}

function engine() {
  const engine = new Liquid({
    jekyllInclude: true,
    relativeFilesystem: true,
    root: [tmpRoot],
    strictVariables: false,
  });
  for (const [key, fn] of Object.entries(liquidFilters)) engine.registerFilter(key, fn);
  return engine;
}

for (const name of TEMPLATES) {
  for (const locale of LOCALES) {
    test(`包装 ${name} (${locale}) 输出 == Liquid 基准`, async () => {
      const source = fs.readFileSync(path.join(tmpRoot, `${name}.html`), 'utf8');
      const actual = await engine().parseAndRender(source, buildContext(locale));
      const expected = await renderReference(name, locale);
      assert.equal(actual, expected);
    });
  }
}