import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SITE_ROOT } from '../tools/lib/content.mjs';
import { renderFragment } from '../tools/lib/render.mjs';
import { TEMPLATES, LOCALES } from '../tools/capture-reference.mjs';

function fixture(name, locale) {
  return fs.readFileSync(
    path.join(SITE_ROOT, 'tests', 'fixtures', 'liquid', `${name}.${locale}.html`),
    'utf8'
  );
}

function firstDifference(expected, actual) {
  let i = 0;
  while (i < expected.length && i < actual.length && expected[i] === actual[i]) i++;
  const window = (s) => JSON.stringify(s.slice(Math.max(0, i - 40), i + 40));
  return `首个差异在字节 ${i}（长度 ${expected.length} vs ${actual.length}）\n  期望 …${window(expected)}…\n  实际 …${window(actual)}…`;
}

for (const name of TEMPLATES) {
  for (const locale of LOCALES) {
    test(`render ${name} (${locale}) 与 Liquid 基准逐字节一致`, () => {
      const expected = fixture(name, locale);
      const actual = renderFragment(name.replace(/^han-/, ''), locale, { limit: 3 });
      assert.equal(actual, expected, firstDifference(expected, actual));
    });
  }
}
