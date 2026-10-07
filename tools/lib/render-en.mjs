// 英文条目页的纯 JS 生成器（_pages/en/<集合>/<slug>.md）。
//
// 为什么需要生成而不是让 Jekyll 直接渲染：Jekyll 一个文档只产出一个页面，
// 中文条目（_publications 等四个集合）已经占了 /publication/… 这些 permalink，
// 英文页只能另起一批 /en/… 地址 —— 而 GitHub Pages 不允许自定义插件，页面级
// 的「同一数据渲染两遍」只能在构建前用 Node 做。模式与 tools/render-content.mjs
// 一致：产物提交进仓库，CI 每次 jekyll build 前重新生成（npm run build:content），
// npm run check 里只做 --warn 漂移提示 —— 后台（Decap）能改条目但跑不了脚本，
// 让漂移红等于「用后台改一个字就发不上去」。
//
// 每页产出什么：
//   front matter  —— 英文页模板（_layouts/single|talk.html）会读的字段全部在
//                    这里解析成英文（*_en 优先，缺了回落中文，由 validate 点名）。
//                    zh_url 回指中文原文：阅读数门控、两张站点地图的去重靠它。
//   正文          —— 条目的 body_en（英文译文）。zh 正文为空 → 页面无正文
//                    （与中文页一致）；zh 有正文但没翻 → 输出一段回链块，
//                    指回中文原文，绝不用中文正文冒充英文页。
//
// 输出必须确定：同一份数据两次生成逐字节一致（--check 靠这个判断漂移），
// 所以 front matter 用 yaml.stringify(lineWidth: 0)（不折行、键序即插入序）。
import path from 'node:path';
import { stringify as yamlStringify } from 'yaml';
import { SITE_ROOT, loadCollections } from './content.mjs';

/** 英文页模板会读的 front matter 键白名单 —— 与 schemas/page.schema.json 对齐，
 *  tests/render-en.test.mjs 拿它和 schema 互查，防止生成器写出 schema 不认识的键。 */
export const EN_PAGE_KEYS = [
  'layout', 'title', 'permalink', 'locale', 'author_profile', 'share', 'zh_url',
  'excerpt', 'venue', 'type', 'date', 'citation', 'bibtex', 'link',
];

const or = (v, fallback) => (v == null || v === '' || v === false ? fallback : v);
/** 英文页取 *_en，缺了回落中文。 */
const pick = (zh, en) => or(en, zh);

/** 条目正文还没英译时的回链块。文案走 ui-text（Liquid 在 Jekyll 里渲染），
 * 生成器只负责把 zh_url 焊进链接 —— URL 是数据不是界面文案。 */
function pendingBlock(zhUrl) {
  return (
    '> {{ site.data.ui-text[page.locale].body_en_pending | default: ' +
    '"This entry has not been translated yet — read the original in Chinese:" }} ' +
    '[{{ site.data.ui-text[page.locale].original_zh_label | default: "Chinese original" }}]' +
    `(${zhUrl})\n`
  );
}

/**
 * 一个条目 → 一页英文条目页的完整文件内容。
 * @param {{file: string, data: object, body: string}} entry loadFrontMatter 的结果
 * @param {string} collection 集合名（publications / portfolio / talks / teaching）
 */
export function renderEnPage(entry, collection) {
  const d = entry.data;
  if (!d.permalink) throw new Error(`${entry.file}: 没有 permalink，无法生成英文页`);

  const zhUrl = d.permalink;
  const enUrl = `/en${zhUrl}`;
  const slug = zhUrl.replace(/\/+$/, '').split('/').pop();

  const fm = {
    layout: collection === 'talks' ? 'talk' : 'single',
    title: pick(d.title, d.title_en),
    permalink: enUrl,
    locale: 'en',
    author_profile: true,
    share: true,
    zh_url: zhUrl,
  };
  // 只带 _layouts/single|talk.html 真会读的可选字段（与 page.schema.json 白名单一致）。
  if (or(d.excerpt, d.excerpt_en)) fm.excerpt = pick(d.excerpt, d.excerpt_en);
  if (or(d.venue, d.venue_en)) fm.venue = pick(d.venue, d.venue_en);
  if (or(d.type, d.type_en)) fm.type = pick(d.type, d.type_en);
  if (d.date) fm.date = String(d.date);
  if (or(d.citation, d.citation_en)) fm.citation = pick(d.citation, d.citation_en);
  if (d.bibtex) fm.bibtex = d.bibtex;
  if (d.link) fm.link = d.link;

  const zhBody = (entry.body ?? '').trim();
  let content = '';
  if (zhBody) {
    const enBody = (d.body_en ?? '').trim();
    content = enBody ? `${enBody}\n` : pendingBlock(zhUrl);
  }

  const head = yamlStringify(fm, { lineWidth: 0 }).trimEnd();
  return { file: path.posix.join('_pages/en', collection, `${slug}.md`), content: `---\n${head}\n---\n${content}` };
}

/** 全部条目 → 生成页清单。permalink 撞车在这里就抛 —— 同址两页后写覆盖前写，
 * 与 validate 的全站 permalink 唯一性检查互为双保险。 */
export function buildEnPages() {
  const collections = loadCollections();
  const pages = [];
  const byUrl = new Map();
  for (const [collection, entries] of Object.entries(collections)) {
    for (const entry of entries) {
      const page = renderEnPage(entry, collection);
      const url = page.content.match(/^permalink: (\S+)$/m)?.[1];
      const prev = url ? byUrl.get(url) : undefined;
      if (url && prev) throw new Error(`英文页 permalink 撞车（${url}）：${page.file} 与 ${prev}`);
      if (url) byUrl.set(url, page.file);
      pages.push(page);
    }
  }
  return pages;
}
