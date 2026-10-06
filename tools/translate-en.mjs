#!/usr/bin/env node
// 中 → 英自动翻译：把中文数据里的文字成对翻成 *_en 字段。
//
//   node tools/translate-en.mjs              翻译并写回（默认）
//   node tools/translate-en.mjs --dry-run    只打印将要写入的内容，不落盘
//   node tools/translate-en.mjs --check      只报「中文改了但英文没跟上」，不翻译
//   node tools/translate-en.mjs --force      忽略哈希，全部重译（覆盖人工译文）
//   node tools/translate-en.mjs --only talks 只处理某类（profile / awards / publications /
//                                            portfolio / talks / teaching）
//
// 模型：OpenAI 兼容的 /v1/chat/completions，默认 Index-Translate-35B-A3B。
// 环境变量：TRANSLATE_BASE_URL / TRANSLATE_MODEL / TRANSLATE_API_KEY（有 key 才发
// Authorization 头）/ TRANSLATE_CONCURRENCY（默认 4）。结果进 .cache/translate/，
// 重跑同一句不花钱。
//
// ---------------------------------------------------------------------------
// 覆盖什么、为什么不覆盖什么
// ---------------------------------------------------------------------------
// 只碰 front matter 与 _data 里的成对字段（X → X_en）：
//   profile      text、notes
//   awards       text、note
//   publications title、excerpt、venue
//   portfolio    title、excerpt
//   talks        title、venue、type
//   teaching     title、venue、type
//
// 刻意不翻：
//   citation   GB/T 7714 与英文引文体例各有一套，机器翻出来的引文不能直接用；
//   location   「中国 · 南京」↔「Nanjing, China」，分隔符与语序都不同，且只有两种取值；
//   daterange / date / datetext
//              日期跨度在英文页有两种写法（"2021.09 – 2024.06" 与
//              "Sep 2022 – Sep 2023"），什么时候用哪种是人判断的；
//   bibtex / link / period / level / collection / category / permalink  不是文字。
// 名单之外还有一层兜底：EXCLUDE 里的键任何文件都不翻。
//
// 页面正文散文（_pages/en/*.md 的段落）不在范围内 —— 那是站内文气最重、也是
// `_includes/han-mirror.html` 之外最需要手工的一层；见 tools/check-en-sync.mjs 顶部。
//
// ---------------------------------------------------------------------------
// 「什么时候允许覆盖人工译文」—— 本工具唯一真正要紧的设计
// ---------------------------------------------------------------------------
// 状态文件 tools/translate-state.json 记着每处英文对应的那句**中文**的哈希：
//   · 中文没变          → 一个字都不碰，人工润色过的译文因此得以保留；
//   · 中文变了          → 重译并覆盖，逐条打出来供 review；
//   · 英文缺失          → 直接补上；
//   · 首次见到（无记录）→ 只登记哈希，不覆盖任何现成英文。
// 删掉状态文件 = 忘记一切，下次回到「只登记不覆盖」的保守状态。
//
// ---------------------------------------------------------------------------
// 为什么用「占位符 + 对照表」而不是把术语写进 prompt
// ---------------------------------------------------------------------------
// 送进模型之前，先把术语（tools/translate-glossary.yml）、Markdown 强调、夹杂的英文
// 专名、项目编号与日期挖成 ⟦n⟧，随文附上「⟦3⟧ = 四神博局镜 → four-deity TLV mirror」
// 这样的对照说明。模型只译中文散文、逐字带回符号，于是术语不会被改写、不会被音译、
// 不会顺手删掉 `**`。回填后再验三件事：占位符一个不少、没有漏出来的汉字、译文非空；
// 任何一条不过，**这一处保留原值不写**，只报错 —— 半句译文进页面比旧译文更糟。
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import crypto from 'node:crypto';
import YAML from 'yaml';
import { load as parseYaml } from 'js-yaml';
import { SITE_ROOT } from './lib/content.mjs';

const BASE_URL = (process.env.TRANSLATE_BASE_URL ?? 'https://index-translate.bilibili.com/v1').replace(/\/+$/, '');
const MODEL = process.env.TRANSLATE_MODEL ?? 'Index-Translate-35B-A3B';
const API_KEY = process.env.TRANSLATE_API_KEY ?? '';
const CONCURRENCY = Math.max(1, Number(process.env.TRANSLATE_CONCURRENCY) || 4);
const CACHE_DIR = path.join(SITE_ROOT, '.cache', 'translate');
const STATE_FILE = path.join(SITE_ROOT, 'tools', 'translate-state.json');
const GLOSSARY_FILE = path.join(SITE_ROOT, 'tools', 'translate-glossary.yml');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const DRY = flag('--dry-run');
const CHECK = flag('--check');
const FORCE = flag('--force');
const SOFT = flag('--soft'); // --check 只提示不失败（CI 用）
const ONLY = option('--only');

/** 每个来源翻哪些字段（键名不带 _en） */
const GROUPS = {
  profile: { file: '_data/profile.yml', keys: ['text', 'notes'] },
  awards: { file: '_data/awards.yml', keys: ['text', 'note'] },
  publications: { dir: '_publications', keys: ['title', 'excerpt', 'venue'] },
  portfolio: { dir: '_portfolio', keys: ['title', 'excerpt'] },
  talks: { dir: '_talks', keys: ['title', 'venue', 'type'] },
  teaching: { dir: '_teaching', keys: ['title', 'venue', 'type'] },
};

/** 任何文件都不翻的键 */
const EXCLUDE = new Set([
  'citation', 'location', 'daterange', 'datetext', 'date', 'year', 'bibtex',
  'link', 'period', 'level', 'collection', 'category', 'permalink', 'sitemap',
]);

const readRel = (rel) => fs.readFileSync(path.join(SITE_ROOT, rel), 'utf8');
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const getIn = (obj, p) => p.reduce((o, k) => (o == null ? undefined : o[k]), obj);

// ================================================================== 术语与占位符

const GLOSSARY = Object.entries(parseYaml(fs.readFileSync(GLOSSARY_FILE, 'utf8')))
  .filter(([zh, en]) => typeof zh === 'string' && zh.trim() && typeof en === 'string' && en.trim())
  .sort((a, b) => b[0].length - a[0].length); // 最长命中优先

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 占位符用纯 ASCII 的 [[n]]：实测 ⟦n⟧ 会被这个模型的分词器偶尔咬坏（数字被换成
// U+FFFD），而 [[n]] / <n> / XnX 都能原样回来。回填时仍兼容 ⟦n⟧、〈n〉这类变体。
const mark = (i) => `[[${i}]]`;
const MARK_RE = /(?:\[\[|⟦|【|<)\s*(\d{1,3})\s*(?:\]\]|⟧|】|>)/g;

/** 夹杂的拉丁串（含 ≥2 个拉丁字母才算，纯数字另走一条） */
function latinRuns(text) {
  return (
    text.match(
      /[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F0-9]*(?:[ \u00B7.,:/&'’()[\]#%-][A-Za-z\u00C0-\u024F0-9]+)*/g,
    ) ?? []
  );
}

/**
 * 把不可翻译的片段挖成 ⟦n⟧，返回掩码文本与对照表（对照表就是随文发给模型的说明）。
 * 顺序：Markdown → 项目编号 → 术语 → 拉丁专名 → 日期。术语排在拉丁之前，
 * 这样「南京大学新闻传播学院」这种整条先被挖走，不会被拆成碎片。
 */
function mask(text) {
  const legend = [];
  let out = text;
  /** hint 省略时就是「原文照搬」（编号、日期这类） */
  const take = (re, hint) => {
    out = out.replace(re, (m) => {
      legend.push({ src: m, out: hint ?? m });
      return mark(legend.length - 1);
    });
  };
  const takeStr = (s, hint) => {
    if (out.includes(s)) take(new RegExp(escapeRe(s), 'g'), hint);
  };

  // Markdown 强调与行内代码：原文照搬，模型不该碰
  out = out.replace(/\*\*[^*]+\*\*|`[^`]+`/g, (m) => {
    legend.push({ src: m, out: m });
    return mark(legend.length - 1);
  });
  // 项目编号（2018XSKY017 / 201911460038Y）
  take(/\b\d*[A-Z]{2,}[A-Z0-9]*\d[A-Z0-9]*\b/g);
  // 术语：整条挖走，「南京大学新闻传播学院」不会被拆成碎片
  for (const [zh, en] of GLOSSARY) takeStr(zh, en);
  // 夹杂的拉丁专名（UCLA、Eberhard Karls Universität Tübingen、D3.js…）
  for (const run of latinRuns(out)) {
    if ((run.match(/[A-Za-z]/g) ?? []).length >= 2) takeStr(run, run);
  }
  // 日期与年月区间：数字原样，不给模型改格式的机会
  take(/\d{4}\.\d{2}(?:\s*[–—-]\s*\d{4}\.\d{2})?/g);

  return { masked: out, legend };
}

function unmask(text, legend) {
  return text.replace(MARK_RE, (_, i) => legend[Number(i)]?.out ?? '').replace(/\s+/g, ' ').trim();
}

/** 片段是否还在。模型有时不逐字带回符号，而是直接把术语展开成英文 ——
 *  那也算它做对了：只要展开的内容与术语表一致（不比大小写，句首大写是它自己
 *  按英文语法加的，不算错）就算通过。 */
function lostFragments(text, legend) {
  const lower = text.toLowerCase();
  return legend.filter((item, i) => {
    const kept = new RegExp(`(?:\\[\\[|⟦|【|<)\\s*${i}\\s*(?:\\]\\]|⟧|】|>)`).test(text);
    return !kept && !lower.includes(item.out.toLowerCase());
  });
}

/** 译文里漏出来的汉字：说明模型没真翻 */
const han = (text) => text.match(/[\u3400-\u9FFF]/g) ?? [];

// ================================================================== 模型调用

const cacheKey = (masked, legend) =>
  crypto.createHash('sha256')
    .update(JSON.stringify([MODEL, masked, legend.map((l) => [l.src, l.out])]))
    .digest('hex');

function cacheRead(key) {
  const file = path.join(CACHE_DIR, `${key}.json`);
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}
function cacheWrite(key, value) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(path.join(CACHE_DIR, `${key}.json`), JSON.stringify(value));
}

/** 去掉模型偶尔加的寒暄、围栏与折行，只要译文本身 */
function tidy(raw) {
  let s = (raw ?? '').toString().trim();
  s = s.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '');
  s = s.replace(/^(译文|翻译结果?|英文|Translation|English)\s*[:：]\s*/i, '');
  s = s.replace(/^(Sure[^\n:]*:|Here (?:is|are)[^\n:]*:|The translation is)\s*/i, '');
  return s.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

async function callModel(masked, legend) {
  const key = cacheKey(masked, legend);
  const hit = cacheRead(key);
  if (hit) return { out: hit.out, cached: true };

  const messages = [
    {
      role: 'system',
      content:
        'You are a translation engine for an academic personal website. Translate the ' +
        'Chinese prose into English. Rules: (1) copy every ⟦n⟧ token through unchanged ' +
        'and never translate what is inside it; (2) keep the register factual and concise, ' +
        'matching the style of an academic CV: no leading article ("The Fifth Forum" → ' +
        '"Fifth Forum"), no explanatory additions; (3) output only the translation, with no ' +
        'preamble, notes or surrounding quotes; (4) never invent facts, names or numbers.',
    },
    {
      role: 'user',
      content:
        (legend.length
          ? `Keep verbatim:\n${legend.map((l, i) => `${mark(i)} = ${l.src} → ${l.out}`).join('\n')}\n\n`
          : '') + `Text:\n${masked}`,
    },
  ];

  let lastError = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}),
        },
        body: JSON.stringify({ model: MODEL, temperature: 0.2, top_p: 0.9, max_tokens: 2048, messages }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
      const json = await res.json();
      const out = tidy(json?.choices?.[0]?.message?.content);
      if (!out) throw new Error('模型返回空内容');
      cacheWrite(key, { out });
      return { out, cached: false };
    } catch (err) {
      lastError = String(err?.message ?? err);
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw new Error(lastError);
}

/** 翻一句中文。校验不过就抛错 —— 由调用方决定保留原值 */
async function translate(zh) {
  const { masked, legend } = mask(zh);

  // 整句都被术语 / 编号 / 日期占满时，一个汉字都不剩 —— 直接回填即可，
  // 不用问模型（实测模型遇到纯符号串反而会把 ⟦n⟧ 展开成英文）。
  if (!han(masked).length) {
    return { text: unmask(masked, legend), cached: true, offline: true };
  }

  const { out, cached } = await callModel(masked, legend);
  // 片段是否还在，要在**回填之前**查：回填之后 ⟦n⟧ 已经变成英文，符号当然找不到了
  const lost = lostFragments(out, legend);
  if (lost.length) {
    // 把模型原话带进报错：失败多半要靠人看一眼原文才好判断该不该手工补
    throw new Error(`片段丢失：${lost.map((l) => l.src).join('、')}｜模型原话「${out}」`);
  }
  const text = unmask(out, legend);
  if (!text) throw new Error('译文为空');
  const left = han(text);
  if (left.length) throw new Error(`译文还剩 ${left.length} 个汉字：「${left.slice(0, 8).join('')}」`);
  return { text, cached };
}

// ================================================================== 文件读写

/** front matter：只动 --- … --- 之间那段，围栏与正文原样保留 */
function splitFrontMatter(src) {
  const m = /^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/.exec(src);
  return m ? { open: m[1], body: m[2], close: m[3], rest: src.slice(m[0].length) } : null;
}

/**
 * 一个待改文件。渲染用 lineWidth: 0 —— 默认的 80 列折行会把没动过的长引号
 * 字符串也拆成两行，那正是这个工具最不该造成的 diff。
 */
function openYamlFile(rel) {
  const src = readRel(rel);
  const doc = YAML.parseDocument(src);
  const file = {
    rel,
    kind: 'yaml',
    src,
    doc,
    edits: [],
    render: () => doc.toString({ lineWidth: 0 }),
  };
  file.set = (p, v, before) => {
    doc.setIn(p, v);
    file.edits.push({ path: p.join('.'), before, after: v });
  };
  return file;
}
function openFrontMatterFile(rel) {
  const src = readRel(rel);
  const fm = splitFrontMatter(src);
  if (!fm) return null;
  const doc = YAML.parseDocument(fm.body);
  const file = {
    rel,
    kind: 'fm',
    src,
    fm,
    doc,
    edits: [],
    render: () => fm.open + doc.toString({ lineWidth: 0 }) + fm.close + fm.rest,
  };
  file.set = (p, v, before) => {
    doc.setIn(p, v);
    file.edits.push({ path: p.join('.'), before, after: v });
  };
  return file;
}
const dataOf = (file) => parseYaml(file.kind === 'yaml' ? file.src : file.fm.body);
const listFiles = (dir) => {
  const abs = path.join(SITE_ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => /\.(md|html)$/.test(f))
    .sort()
    .map((f) => path.posix.join(dir, f));
};

/**
 * 递归找出成对字段。zhPath 指向中文，enPath 指向对应 *_en
 * （notes 这种字符串数组则是 notes_en[i]）。EXCLUDE 与 _en 键都在这里挡掉，
 * 所以「英文当中文再翻一遍」这种事不会发生。
 */
function collect(node, keys, prefix, out) {
  if (Array.isArray(node)) {
    node.forEach((item, i) => collect(item, keys, [...prefix, i], out));
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    if (EXCLUDE.has(key)) continue;
    if (keys.includes(key)) {
      if (typeof value === 'string' && value.trim()) {
        out.push({ zhPath: [...prefix, key], enPath: [...prefix, `${key}_en`], zh: value });
      } else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
        value.forEach((v, i) => {
          if (typeof v === 'string' && v.trim()) {
            out.push({ zhPath: [...prefix, key, i], enPath: [...prefix, `${key}_en`, i], zh: v });
          }
        });
      }
      continue;
    }
    collect(value, keys, [...prefix, key], out);
  }
}

// ================================================================== 主流程

const loadState = () => {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')).fields ?? {};
  } catch {
    return {};
  }
};

const problems = [];
const files = new Map(); // rel -> 文件编辑句柄
const jobs = [];

if (ONLY && !GROUPS[ONLY]) {
  console.error(`translate: 不知道 --only ${ONLY}；可选：${Object.keys(GROUPS).join(' / ')}`);
  process.exit(2);
}

for (const [group, cfg] of Object.entries(GROUPS)) {
  if (ONLY && group !== ONLY) continue;
  const openOne = cfg.file ? openYamlFile : (rel) => openFrontMatterFile(rel);
  const rels = cfg.file ? [cfg.file] : listFiles(cfg.dir);
  for (const rel of rels) {
    const file = openOne(rel);
    if (!file) {
      if (cfg.dir) problems.push(`${rel}：没有 front matter，跳过`);
      continue;
    }
    const found = [];
    collect(dataOf(file), cfg.keys, [], found);
    if (!found.length) continue;
    files.set(rel, file);
    for (const f of found) {
      jobs.push({ group, rel, id: `${rel}#${f.zhPath.join('.')}`, ...f });
    }
  }
}

const state = loadState();
const nextState = { ...state };
let stateChanged = false;

/** 决定每处做什么；返回 [要动的活儿, 只登记哈希的活儿数] */
const todo = [];
let recorded = 0;
for (const job of jobs) {
  const current = getIn(dataOf(files.get(job.rel)), job.enPath);
  const hash = sha(job.zh);
  const known = state[job.id];

  let why;
  if (FORCE) why = 'force';
  else if (current === undefined || String(current ?? '').trim() === '') why = 'missing';
  else if (known === undefined) why = 'record';
  else if (known !== hash) why = 'changed';
  else continue;

  if (why === 'record') {
    nextState[job.id] = hash;
    stateChanged = true;
    recorded++;
    continue;
  }
  todo.push({ ...job, hash, why, current });
}

const label = (why) => (why === 'missing' ? '缺英文' : why === 'force' ? '强制重译' : '中文已改');

// ---- --check：只报，不翻，不写
if (CHECK) {
  for (const job of todo) {
    console.log(`  ${label(job.why)}  ${job.id}`);
    console.log(`      中：${job.zh}`);
    console.log(`      英：${job.current}`);
  }
  console.log(
    `\ntranslate: ${jobs.length} 处成对字段，${todo.length} 处待处理` +
      (recorded ? `，${recorded} 处首次登记（--check 不写状态）` : ''),
  );
  process.exit(todo.length && !SOFT ? 1 : 0);
}

// ---- 并发翻译
let done = 0;
let cached = 0;
async function worker() {
  for (;;) {
    const job = todo.shift();
    if (!job) return;
    try {
      const { text, cached: hit } = await translate(job.zh);
      files.get(job.rel).set(job.enPath, text, job.current);
      nextState[job.id] = job.hash;
      stateChanged = true;
      done++;
      if (hit) cached++;
      console.log(
        `  ${job.why === 'missing' ? '补' : '改'} ${job.id}\n` +
          `      中 ${job.zh}\n` +
          `      旧 ${job.current}\n` +
          `      新 ${text}${hit ? '  [缓存]' : ''}`,
      );
    } catch (err) {
      problems.push(`${job.id}：${String(err.message ?? err)} —— 保留原值`);
    }
  }
}
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length || 1) }, worker));

// ---- 落盘：只写真正改过的文件，写前确认「除目标字段外语义没变」
const written = [];
const skipped = [];
for (const [rel, file] of files) {
  if (!file.edits.length) continue;
  const next = file.render();
  if (next === file.src) continue;

  // 自查：重新解析，只允许 edits 里列出的路径发生变化
  const before = dataOf(file);
  const after = parseYaml(file.kind === 'yaml' ? next : splitFrontMatter(next).body);
  const changedPaths = [];
  const walk = (a, b, p) => {
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
        changedPaths.push(`${p.join('.')}：数组形状变了`);
        return;
      }
      a.forEach((v, i) => walk(v, b[i], [...p, i]));
      return;
    }
    if (a && b && typeof a === 'object' && typeof b === 'object') {
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], [...p, k]);
      return;
    }
    if (String(a ?? '') !== String(b ?? '')) changedPaths.push(p.join('.'));
  };
  walk(before, after, []);
  const expected = file.edits.map((e) => e.path);
  const unexpected = changedPaths.filter((p) => !expected.includes(p));
  if (unexpected.length) {
    problems.push(
      `${rel}：序列化顺带改了别的字段（${unexpected.slice(0, 6).join('、')}），已放弃写入`,
    );
    skipped.push(rel);
    continue;
  }
  if (!DRY) fs.writeFileSync(path.join(SITE_ROOT, rel), next);
  written.push(rel);
}

if (!DRY && stateChanged) {
  fs.writeFileSync(
    STATE_FILE,
    JSON.stringify(
      {
        model: MODEL,
        note: '每个 *_en 字段对应的那句中文的哈希。中文没变就不覆盖人工译文；删掉本文件即回到「只登记不覆盖」。',
        fields: Object.fromEntries(Object.entries(nextState).sort(([a], [b]) => a.localeCompare(b))),
      },
      null,
      2,
    ) + '\n',
  );
}

console.log(
  `\ntranslate: ${jobs.length} 处成对字段 → 翻译 ${done} 处（缓存命中 ${cached}）` +
    `${recorded ? `，登记 ${recorded} 处` : ''}` +
    `${written.length ? `，${DRY ? '将写入' : '已写入'} ${written.length} 个文件` : '，无文件改动'}` +
    `${skipped.length ? `，放弃 ${skipped.length} 个` : ''}` +
    `${DRY ? '（--dry-run 未落盘）' : ''}`,
);
for (const rel of written) console.log(`   ${rel}`);

if (problems.length) {
  console.error(`\ntranslate: ${problems.length} 处有问题：`);
  for (const p of problems) console.error(`  x ${p}`);
  process.exit(1);
}
