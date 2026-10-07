#!/usr/bin/env node
// L5 结构断言 —— 防「列表塌成一段」「Liquid 被删掉」这类**构建成功但页面错**的事故。
//
//   node tools/check-structure.mjs
//
// 分两半：
//   1. 源码级：页面里的 {% include %} 不能少，han-* include 必须还是薄包装。
//      不需要构建，本地和 CI 的 check 阶段都能跑。
//   2. 产物级：_site 存在时才跑（CI 在 jekyll build 之后跑），
//      断言条目之间真的有 </li>、没有漏渲染的 Liquid。
//
// 关键点：这两类问题 Jekyll 都会**成功构建**，错误只体现在最终 HTML 上，
// 所以必须在 deploy 之前单独拦一道。
import fs from 'node:fs';
import path from 'node:path';
import { parse } from 'node-html-parser';
import { SITE_ROOT, loadData, readText } from './lib/content.mjs';

const problems = [];
const fail = (where, message) => problems.push(`${where}: ${message}`);

// ------------------------------------------------------------------ 源码级

// 页面删掉一个 include，构建照样成功，只是那一节整块消失。
const REQUIRED_INCLUDES = {
  '_pages/about.md': [
    'han-honours.html',
    'han-education.html',
    'han-recent-pubs.html',
    'han-awards.html',
    'han-contact.html',
  ],
  '_pages/cv.md': ['han-cv-timeline.html', 'han-honours.html'],
  '_pages/timeline.md': ['han-timeline.html'],
  '_pages/en/about.md': [
    'han-honours.html',
    'han-education.html',
    'han-recent-pubs.html',
    'han-awards.html',
    'han-contact.html',
  ],
  '_pages/en/cv.md': ['han-cv-timeline.html', 'han-honours.html'],
  '_pages/en/timeline.md': ['han-timeline.html'],
};

for (const [file, includes] of Object.entries(REQUIRED_INCLUDES)) {
  let src;
  try {
    src = readText(file);
  } catch {
    fail(file, '文件不见了');
    continue;
  }
  for (const inc of includes) {
    if (!src.includes(`include ${inc}`)) fail(file, `缺少 {% include ${inc} %} —— 这一节会整块消失`);
  }
}

// han-* 必须还是薄包装：只做语言分支 + include 生成物。
// 一旦有人往里塞回 {% for %}，字节级回归测试和这里会同时红。
const HAN_INCLUDES = [
  'han-education',
  'han-honours',
  'han-awards',
  'han-contact',
  'han-recent-pubs',
  'han-cv-timeline',
  'han-timeline',
];

for (const name of HAN_INCLUDES) {
  const file = `_includes/${name}.html`;
  const src = readText(file);
  if (!src.includes('include generated/')) fail(file, '没有指向 _includes/generated/，包装层断了');
  if (/{%-?\s*for\b/.test(src)) fail(file, '包装层里出现了 {% for %} —— 内容应该只在生成物里');
  if (/\{\{/.test(src)) fail(file, '包装层里出现了 {{ }} 输出，说明逻辑被挪回来了');
}

for (const name of fs.readdirSync(path.join(SITE_ROOT, '_includes', 'generated'))) {
  const file = `_includes/generated/${name}`;
  const src = readText(file);
  if (!src.includes('{% raw %}') || !src.includes('{% endraw %}')) {
    fail(file, '生成物必须整段包在 {% raw %} … {% endraw %} 里');
    continue;
  }
  const inner = src.replace('{% raw %}', '').replace('{% endraw %}', '');
  if (/{%|{{/.test(inner)) fail(file, '生成物里还有未包裹的 Liquid 标记');
}

// ------------------------------------------------------------------ 产物级

const siteDir = path.join(SITE_ROOT, '_site');

// /api/summary 会回给前端的全部字段（analytics/worker.js 的 summary()），
// 产物里所有 data-fill 只准写这里面的键。
const SUMMARY_FIELDS = new Set(['pv', 'today_pv', 'today_uv', 'page_pv']);

function walkHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    else if (entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

const plain = (html) => decodeEntities(html.replace(/<[^>]+>/g, ''));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** 允许标签/空白穿插在字符之前，这样含 **加粗**、换行的条目也能在原始 HTML 里定位。
 *  注意必须写成 `(?:<...>|s)*字` 而不是 `(?:<...>|字)` —— 后者会让标签分支
 *  「代替」这个字把标签吃掉，匹配在少一个字的地方就结束了，后面全跟着错位。 */
function tagTolerant(text) {
  return Array.from(text)
    .map((ch) => `(?:<[^>]*>|\\s)*${ch === ' ' ? '' : esc(ch)}`)
    .join('');
}

function findRaw(raw, needle, from = 0) {
  return new RegExp(tagTolerant(needle)).exec(raw.slice(from));
}

function assertListedSeparately(raw, entries, where, label) {
  let offset = 0;
  let prevEnd = null;
  for (const [i, entry] of entries.entries()) {
    const hit = findRaw(raw, entry, offset);
    if (!hit) {
      fail(where, `${label}没渲染出来：「${entry.slice(0, 40)}」`);
      return;
    }
    const start = offset + hit.index;
    const end = start + hit[0].length;
    if (prevEnd !== null && !raw.slice(prevEnd, start).includes('</li>')) {
      fail(
        where,
        `${label}相邻两条之间没有 </li> —— 列表塌成了一段：` +
          `「${entries[i - 1].slice(0, 20)}」/「${entry.slice(0, 20)}」`,
      );
    }
    prevEnd = end;
    offset = end;
  }
}

if (!fs.existsSync(siteDir)) {
  console.log('structure: 只跑了源码级检查（_site 不存在，构建产物检查跳过）');
} else {
  for (const rel of ['index.html', 'cv/index.html', 'timeline/index.html', 'publications/index.html', '404.html']) {
    if (!fs.existsSync(path.join(siteDir, rel))) fail(`_site/${rel}`, '构建产物缺这个页面');
  }

  // 1) 漏渲染的 Liquid。BibTeX 里会出现 {{，所以先剥掉 <pre>/<code>。
  for (const file of walkHtml(siteDir)) {
    const src = fs.readFileSync(file, 'utf8');
    const withoutCode = src.replace(/<(pre|code)\b[\s\S]*?<\/\1>/gi, '');
    const hit = withoutCode.match(/{%|{{/);
    if (hit) {
      const line = withoutCode.slice(0, hit.index).split('\n').length;
      fail(path.relative(SITE_ROOT, file), `有漏渲染的 Liquid（第 ${line} 行附近：${hit[0]}…）`);
    }
  }

  const data = loadData();
  const homePath = path.join(siteDir, 'index.html');
  const cvPath = path.join(siteDir, 'cv/index.html');
  const timelinePath = path.join(siteDir, 'timeline/index.html');

  const read = (p) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');

  // 2) 教育背景必须是真列表 —— 这里正是之前塌成一行的地方。
  const home = read(homePath);
  if (home) {
    const education = (data.profile?.education ?? []).map((e) => e.text.replace(/\*\*/g, ''));
    if (education.length >= 2) assertListedSeparately(home, education, '_site/index.html', '教育背景条目');

    const honours = data.awards?.groups?.find((g) => g.key === 'honours');
    const firstHonour = honours?.items?.[0]?.text;
    if (firstHonour && !plain(home).includes(firstHonour)) {
      fail('_site/index.html', `首页「荣誉」小节没渲染出来：「${firstHonour.slice(0, 40)}」`);
    }
  }

  // 3) 履历页：每条的日期跨度都得在
  const cv = read(cvPath);
  if (cv) {
    const cvText = plain(cv);
    for (const e of [...(data.profile?.education ?? []), ...(data.profile?.work ?? [])]) {
      if (!cvText.includes(e.daterange)) {
        fail('_site/cv/index.html', `履历里找不到日期跨度「${e.daterange}」`);
      }
    }
  }

  // 4) 时间轴：每个年份分组都得在
  const timeline = read(timelinePath);
  if (timeline) {
    const timelineText = plain(timeline);
    for (const group of data.awards?.groups ?? []) {
      if (!timelineText.includes(group.year)) {
        fail('_site/timeline/index.html', `时间轴里找不到年份分组「${group.year}」`);
      }
    }
  }

  // 5) 每个 <img> 必须自带 width 与 height —— 没有比例预留，图片一加载完
  //    就把下面的内容顶下去（CLS）。头像一直带着；page__hero、archive teaser、
  //    sidebar 配图这几个分支现在一张都没渲染（没有页面定义 header/teaser），
  //    将来谁启用了，这道会在部署前把缺尺寸的图拦下来。
  for (const file of walkHtml(siteDir)) {
    const rel = path.relative(SITE_ROOT, file);
    const root = parse(fs.readFileSync(file, 'utf8'));
    for (const img of root.querySelectorAll('img')) {
      if (!img.getAttribute('width') || !img.getAttribute('height')) {
        const hint = (img.getAttribute('src') || '<img>').slice(0, 70);
        fail(rel, `img 缺 width/height（会带来 CLS）：${hint}`);
      }
    }

    // data-fill 的键必须是 /api/summary 真能回的字段 —— visit.js 按 attr 名
    // 取响应里的同名键，键写错（写成 site_pv，接口回的是 pv）不会抛错，只会
    // 永远显示「—」且整块保持 hidden，只有上线才看得出来。集合与
    // analytics/worker.js 的 summary() 输出对齐。
    for (const el of root.querySelectorAll('[data-fill]')) {
      const key = el.getAttribute('data-fill');
      if (!SUMMARY_FIELDS.has(key)) {
        fail(rel, `data-fill="${key}" 不是 /api/summary 的字段（只认 ${[...SUMMARY_FIELDS].join(' / ')}）`);
      }
    }
  }
}

// ------------------------------------------------------------------ 输出

if (problems.length) {
  console.log(`\nstructure: FAIL（${problems.length} 条）`);
  for (const p of problems) console.log(`  x ${p}`);
  process.exit(1);
}
console.log('structure: PASS');
