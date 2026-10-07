// 英文条目页生成器测试：tools/lib/render-en.mjs 的纯函数。
//
// 这里只测「确定性的、由仓库内容决定的」断言：地址规则、字段白名单、正文三分支、
// 两次生成逐字节一致。**故意不测**「仓库里生成的文件是否与数据同步」—— 后台
// （Decap）能改条目但跑不了生成器，那份漂移由 npm run check:content 的
// --check --warn 提示、CI build job 部署前重新生成，不能变成红灯挡部署。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { EN_PAGE_KEYS, renderEnPage, buildEnPages } from '../tools/lib/render-en.mjs';
import { loadCollections, SITE_ROOT } from '../tools/lib/content.mjs';

const PAGE_SCHEMA = JSON.parse(
  fs.readFileSync(path.join(SITE_ROOT, 'schemas', 'page.schema.json'), 'utf8'),
);

const fixture = (over = {}) => ({
  file: '_publications/fixture.md',
  data: {
    permalink: '/publication/fixture',
    title: '中文标题',
    title_en: 'English Title',
    venue: '中文期刊',
    excerpt: '中文摘要',
    date: '2025-01-01',
    ...over,
  },
  body: '中文正文',
});

test('front matter 键全部在 page.schema 白名单里（含生成器导出的键表）', () => {
  for (const key of EN_PAGE_KEYS) {
    assert.ok(PAGE_SCHEMA.properties[key], `EN_PAGE_KEYS 里的 ${key} 不在 page.schema.json`);
  }
  const built = buildEnPages();
  assert.ok(built.length > 0, '至少要生成一页');
  for (const page of built) {
    const { data } = matter(page.content);
    for (const key of Object.keys(data)) {
      assert.ok(PAGE_SCHEMA.properties[key], `${page.file} 写出了 schema 不认识的键 ${key}`);
    }
  }
});

test('地址：/en + 中文原文，全站唯一，zh_url 能指回中文条目', () => {
  const built = buildEnPages();
  const zhPermalinks = new Set(
    Object.values(loadCollections()).flatMap((entries) => entries.map((e) => e.data.permalink)),
  );
  const urls = built.map((p) => matter(p.content).data.permalink);
  assert.equal(new Set(urls).size, urls.length, '英文页 permalink 有重复');
  for (const page of built) {
    const { data } = matter(page.content);
    assert.ok(data.permalink.startsWith('/en/'), `${page.file} 不是 /en/ 地址`);
    assert.equal(data.zh_url, data.permalink.slice(3), `${page.file} zh_url 没指回中文原文`);
    assert.ok(zhPermalinks.has(data.zh_url), `${page.file} 的 zh_url 不对应任何中文条目`);
    assert.equal(data.locale, 'en');
    assert.equal(data.share, true);
    assert.equal(data.author_profile, true);
  }
});

test('路径与布局：talks 用 talk 布局，其余用 single；文件落在 _pages/en/<集合>/<slug>.md', () => {
  for (const page of buildEnPages()) {
    const parts = page.file.split('/');
    assert.deepEqual(parts.slice(0, 2), ['_pages', 'en'], page.file);
    assert.ok(['publications', 'portfolio', 'talks', 'teaching'].includes(parts[2]), page.file);
    const { data } = matter(page.content);
    assert.equal(data.layout, parts[2] === 'talks' ? 'talk' : 'single', page.file);
    assert.equal(path.posix.basename(page.file, '.md'), data.zh_url.replace(/\/+$/, '').split('/').pop(), page.file);
  }
});

test('正文三分支：有译文 / 待译回链 / 本来就没正文', () => {
  // 1) 有 body_en → 正文就是译文
  const withEn = renderEnPage({ ...fixture(), body: '中文正文', data: { ...fixture().data, body_en: 'English body.' } }, 'publications');
  assert.match(withEn.content, /---\nEnglish body\.\n$/);

  // 2) 有中文正文没译文 → 回链块（Liquid 取 ui-text 文案 + 指向中文原文的链接）
  const pending = renderEnPage(fixture(), 'publications');
  assert.match(pending.content, /body_en_pending/, '待译块要引用 ui-text 的文案键');
  assert.match(pending.content, /\(\/publication\/fixture\)/, '待译块要链回中文原文');
  assert.doesNotMatch(pending.content, /中文正文/, '绝不能把中文正文当英文页内容');

  // 3) 中文页本来就没正文 → 英文页也没有
  const empty = renderEnPage({ ...fixture(), body: '' }, 'publications');
  assert.ok(empty.content.endsWith('---\n'), '空正文页以 front matter 收尾');
  assert.equal(empty.content.split('---\n').length - 2, 1, '空正文页没有内容段');
});

test('英文字段缺了回落中文（*_en 优先）', () => {
  const noEn = renderEnPage(
    fixture({ title_en: undefined, venue_en: undefined, excerpt_en: undefined }),
    'publications',
  );
  const { data } = matter(noEn.content);
  assert.equal(data.title, '中文标题');
  assert.equal(data.venue, '中文期刊');
  assert.equal(data.excerpt, '中文摘要');
  assert.match(noEn.content, /\/en\/publication\/fixture/);

  const withEn = renderEnPage(fixture({ title_en: 'EN', venue_en: 'EN Venue' }), 'publications');
  const d2 = matter(withEn.content).data;
  assert.equal(d2.title, 'EN');
  assert.equal(d2.venue, 'EN Venue');
  assert.equal(d2.excerpt, '中文摘要', 'excerpt_en 缺了才回落中文摘要');
});

test('两次生成逐字节一致（--check 靠这个判断漂移）', () => {
  const a = buildEnPages();
  const b = buildEnPages();
  assert.equal(a.length, b.length);
  for (let i = 0; i < a.length; i++) {
    assert.equal(a[i].file, b[i].file);
    assert.equal(a[i].content, b[i].content, `${a[i].file} 两次生成不一致`);
  }
});

test('生成页数量 = 条目总数（每个条目一页英文）', () => {
  const total = Object.values(loadCollections()).reduce((n, entries) => n + entries.length, 0);
  assert.equal(buildEnPages().length, total);
});
