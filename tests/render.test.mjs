// 生成器回归测试：tools/lib/render.mjs（JS）必须与 tools/reference-liquid/（原 Liquid）
// 对**同一份当前数据**的渲染结果逐字节一致。
//
// 为什么比「活的」Liquid 渲染，而不是仓库里存一份快照：
// 快照（tests/fixtures/liquid/）是迁移那一刻的输出，一旦在后台改了任何内容就必然
// 对不上 —— 那等于「用后台改一个字就发不上去」。改成每次都现场用 liquidjs 渲染原
// 模板，两边吃的是同一份数据，改什么都不影响这条断言，而「JS 重写有没有改变渲染
// 语义」这个真正的目的反而被更强地保证了：任何分歧都会当场暴露。
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFragment } from '../tools/lib/render.mjs';
import { TEMPLATES, LOCALES, renderReference } from '../tools/capture-reference.mjs';

function firstDifference(expected, actual) {
  let i = 0;
  while (i < expected.length && i < actual.length && expected[i] === actual[i]) i++;
  const window = (s) => JSON.stringify(s.slice(Math.max(0, i - 40), i + 40));
  return (
    `首个差异在字节 ${i}（长度 ${expected.length} vs ${actual.length}）\n` +
    `  期望 …${window(expected)}…\n  实际 …${window(actual)}…`
  );
}

for (const name of TEMPLATES) {
  for (const locale of LOCALES) {
    test(`render ${name} (${locale}) 与 Liquid 基准逐字节一致`, async () => {
      const expected = await renderReference(name, locale);
      const actual = renderFragment(name.replace(/^han-/, ''), locale, { limit: 3 });
      assert.equal(actual, expected, firstDifference(expected, actual));
    });
  }
}