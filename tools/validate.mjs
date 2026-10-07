#!/usr/bin/env node
// L1 质量门：schema 校验 + 跨文件一致性检查。
//
//   npm run validate            错误即退出码 1（CI 直接红叉）
//   npm run validate -- --strict  把「缺英文」这类告警也当成错误
//
// 设计意图：把「YAML 少个引号 → 整站构建失败 → 线上静默停在旧版」这类事故
// 提前到提交前拦截。校验只读文件，不改任何东西。
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  SITE_ROOT,
  loadCollections,
  loadPages,
  loadData,
} from './lib/content.mjs';

const require = createRequire(import.meta.url);
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');

const errors = [];
const warnings = [];
const err = (where, message) => errors.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);

// ---------------------------------------------------------------- 载入 schema
const schemaDir = path.join(SITE_ROOT, 'schemas');
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const schemas = {};
for (const file of fs.readdirSync(schemaDir).filter((f) => f.endsWith('.schema.json'))) {
  const schema = JSON.parse(fs.readFileSync(path.join(schemaDir, file), 'utf8'));
  ajv.addSchema(schema, file);
  schemas[file.replace('.schema.json', '')] = ajv.getSchema(file);
}

function check(schemaName, where, data) {
  const validate = schemas[schemaName];
  if (!validate) {
    err(where, `找不到 schema ${schemaName}.schema.json`);
    return;
  }
  if (validate(data)) return;
  for (const e of validate.errors ?? []) {
    const at = e.instancePath || '(根)';
    err(where, `${at} ${e.message}${e.params?.allowedValues ? `（允许值：${e.params.allowedValues.join(' | ')}）` : ''}`);
  }
}

// ---------------------------------------------------------------- 逐文件校验
const collections = loadCollections();
const schemaFor = {
  publications: 'publication',
  portfolio: 'portfolio',
  talks: 'talk',
  teaching: 'teaching',
};

for (const [name, entries] of Object.entries(collections)) {
  for (const entry of entries) check(schemaFor[name], entry.file, entry.data);
}

const pages = loadPages();
for (const entry of [...pages.zh, ...pages.en, ...pages.entries]) check('page', entry.file, entry.data);

const data = loadData();
check('profile', '_data/profile.yml', data.profile);
check('awards', '_data/awards.yml', data.awards);
check('navigation', '_data/navigation.yml', data.navigation);

// ---------------------------------------------------------------- 跨文件一致性
// 1) permalink 全站唯一 —— 重复时后者静默覆盖前者，是最难发现的一种丢内容。
const permalinkOwners = new Map();
const claim = (permalink, where) => {
  if (!permalink) return;
  const prev = permalinkOwners.get(permalink);
  if (prev) err(where, `permalink 与 ${prev} 重复（${permalink}）：后一个会覆盖前一个`);
  else permalinkOwners.set(permalink, where);
};

for (const entries of Object.values(collections)) {
  for (const entry of entries) claim(entry.data.permalink, entry.file);
}
for (const entry of [...pages.zh, ...pages.en, ...pages.entries]) {
  claim(entry.data.permalink, entry.file);
  for (const from of entry.data.redirect_from ?? []) claim(from, `${entry.file} (redirect_from)`);
}

// 2) 导航必须指向真实存在的页面 —— 删页面忘了删导航是最常见的死链。
const known = new Set(permalinkOwners.keys());
for (const [i, item] of (data.navigation?.main ?? []).entries()) {
  if (!known.has(item.url)) {
    err('_data/navigation.yml', `main[${i}].url = ${item.url} 没有任何页面使用这个 permalink`);
  }
}

// 3) 英文页必须有同名中文页，反之亦然 —— 防止单边改版。
const zhNames = new Set(pages.zh.map((p) => path.posix.basename(p.file)));
for (const p of pages.en) {
  const base = path.posix.basename(p.file);
  if (!zhNames.has(base)) err(p.file, `缺少中文同名页 _pages/${base}`);
}
const enNames = new Set(pages.en.map((p) => path.posix.basename(p.file)));
for (const p of pages.zh) {
  const base = path.posix.basename(p.file);
  if (p.data.permalink !== '/404.html' && !enNames.has(base)) warn(p.file, `没有英文同名页 _pages/en/${base}`);
}

// 4) layout 必须真实存在
for (const entry of [...pages.zh, ...pages.en, ...pages.entries]) {
  const layout = entry.data.layout;
  if (layout && !fs.existsSync(path.join(SITE_ROOT, '_layouts', `${layout}.html`))) {
    err(entry.file, `layout: ${layout} 在 _layouts/ 下不存在`);
  }
}

// 5) 缺英文：不阻断构建（会回落中文），但要点名
const enPairs = [
  ['title', 'title_en'],
  ['excerpt', 'excerpt_en'],
  ['venue', 'venue_en'],
  ['citation', 'citation_en'],
  ['type', 'type_en'],
  ['location', 'location_en'],
];
for (const entries of Object.values(collections)) {
  for (const entry of entries) {
    for (const [zh, en] of enPairs) {
      if (entry.data[zh] && !entry.data[en]) warn(entry.file, `有 ${zh} 但没有 ${en}，英文页会显示中文`);
    }
    // 正文的英译是 body_en 字段（不在 front matter 配对表里，因为 zh 那侧是
    // 正文本身而不是字段）。缺了不挡构建 —— 英文条目页会回链中文原文。
    if (entry.body?.trim() && !entry.data.body_en?.trim()) {
      warn(entry.file, '有正文但没有 body_en，英文条目页只显示中文原文链接');
    }
  }
}
for (const [label, list] of [['education', data.profile?.education ?? []], ['work', data.profile?.work ?? []]]) {
  list.forEach((e, i) => {
    if (e.notes?.length && (!e.notes_en || e.notes_en.length !== e.notes.length)) {
      warn(`_data/profile.yml ${label}[${i}]`, 'notes 与 notes_en 条数不一致，英文页会回落中文');
    }
  });
}

// 6) 荣誉组必须存在且只有一份 —— 首页与履历的「荣誉」小节靠它
const awardGroups = data.awards?.groups ?? [];
const honours = awardGroups.filter((g) => g.key === 'honours');
if (honours.length === 0) warn('_data/awards.yml', '没有 key: honours 的分组，首页「荣誉」小节会是空的');
if (honours.length > 1) err('_data/awards.yml', `有 ${honours.length} 个 key: honours 分组，应该只有一个`);

// 7) 至少要有一个博士条目，否则履历时间轴第一块是空的
if (!(data.profile?.education ?? []).some((e) => e.period === 'phd')) {
  warn('_data/profile.yml', 'education 里没有 period: phd 的条目，履历时间轴会缺少博士块');
}

// ---------------------------------------------------------------- 输出
const total =
  Object.values(collections).reduce((n, l) => n + l.length, 0) +
  pages.zh.length +
  pages.en.length;

console.log(
  `校验了 ${Object.keys(collections).length} 个集合共 ${total} 个条目、` +
    `${pages.zh.length + pages.en.length + pages.entries.length} 个页面` +
    `${pages.entries.length ? `（含生成的英文条目页 ${pages.entries.length}）` : ''}、3 个数据文件`,
);
console.log(`  permalink 共 ${permalinkOwners.size} 条，全部唯一`);

if (warnings.length) {
  console.log(`\n告警 ${warnings.length} 条：`);
  for (const w of warnings) console.log(`  ! ${w}`);
}
if (errors.length) {
  console.log(`\n错误 ${errors.length} 条：`);
  for (const e of errors) console.log(`  x ${e}`);
}
if (errors.length || (STRICT && warnings.length)) {
  console.log('\nvalidate: FAIL');
  process.exit(1);
}
console.log('\nvalidate: PASS');
