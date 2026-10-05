// 中英同步提醒：改了中文、却没动对应 *_en 字段时提一句。
//
// 为什么需要：_en 字段在 schema 里是「必填 + 非空」，所以漏填 CI 会红；但
// 「填了却没跟着改」是另一回事 —— 校验完全通过，英文页默默显示旧文案。
// 这个坑只能靠对比历史发现。
//
// 覆盖范围：任何成对字段（X ↔ X_en），不写死清单，靠后缀 `_en` 推。
//   _portfolio / _publications / _talks / _teaching  → title、excerpt、citation、venue、type、location
//   _data/profile.yml                                → text、daterange、notes、location（含 education / work 列表内）
//   _data/awards.yml                                 → text、year、note、date
//
// 不覆盖：_pages/*.md 与 _pages/en/*.md 的正文散文 —— 它们是两个独立文件，
// 本来就没有配对关系（后台里也是两个独立的 collection）。
//
// 只提醒，不挡部署：这是编辑习惯问题，不是构建错误。加 --strict 才会失败。
//
//   node tools/check-en-sync.mjs                   对比 HEAD~1（本地默认）
//   BASE_SHA=<sha> node tools/check-en-sync.mjs   对比指定提交（CI 用 push 前的那个）
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';
import matter from 'gray-matter';
import { SITE_ROOT } from './lib/content.mjs';

const STRICT = process.argv.includes('--strict');

const git = (...args) =>
  execFileSync('git', args, { cwd: SITE_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/** 数据文件按 YAML 解析，集合条目按 front matter 解析。页面正文不在范围内。 */
const PARSE = (rel) => {
  const raw = fs.readFileSync(path.join(SITE_ROOT, rel), 'utf8');
  if (rel.endsWith('.yml') || rel.endsWith('.yaml')) return parseYaml(raw);
  return matter(raw).data;
};

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** 统一成可比字符串；数组（notes 这类）比 JSON，顺序变了才算变。 */
const flat = (v) => {
  if (v === undefined || v === null) return '';
  return Array.isArray(v) ? JSON.stringify(v) : JSON.stringify(v);
};

const show = (v) => {
  if (Array.isArray(v)) return v.join(' / ');
  const s = String(v ?? '');
  return s.length > 42 ? s.slice(0, 42) + '…' : s;
};

const findings = [];
let compared = 0;

/** 递归比对 old/new，命中「base 变了而 _en 没变」就记一条。 */
function compare(oldData, newData, file, where = '') {
  if (isObj(oldData) && isObj(newData)) {
    for (const key of new Set([...Object.keys(oldData), ...Object.keys(newData)])) {
      const at = where ? `${where}.${key}` : key;
      if (key.endsWith('_en')) {
        const base = key.slice(0, -3);
        const before = oldData[base];
        const after = newData[base];
        const enBefore = oldData[key];
        const enAfter = newData[key];

        const baseChanged = flat(before) !== flat(after);
        const enChanged = flat(enBefore) !== flat(enAfter);
        // 空值 = 有意留空、回落中文，这是支持的用法，不算「忘了改」
        const enEmpty = enAfter === '' || enAfter === undefined || enAfter === null;

        if (baseChanged && !enChanged && !enEmpty) {
          findings.push({ file, at, base, from: show(before), to: show(after), en: show(enAfter) });
        }
        continue;
      }
      compare(oldData[key], newData[key], file, at);
    }
    return;
  }
  // 数组：长度变了说明插过条目，下标已不对齐，整体不比（避免误报）
  if (Array.isArray(oldData) && Array.isArray(newData)) {
    if (oldData.length !== newData.length) return;
    for (let i = 0; i < newData.length; i++) compare(oldData[i], newData[i], file, `${where}[${i}]`);
  }
}

// ------------------------------------------------------------------ 找变更文件
let baseSha = process.env.BASE_SHA || '';
if (!baseSha) {
  try {
    baseSha = git('rev-parse', 'HEAD~1').trim();
  } catch {
    console.log('en-sync: 没有可对比的历史提交（首次提交？），跳过');
    process.exit(0);
  }
}
if (!/^[0-9a-f]{7,40}$/.test(baseSha) || /^0+$/.test(baseSha)) {
  console.log('en-sync: BASE_SHA 不可用（新建分支？），跳过');
  process.exit(0);
}

let changed;
try {
  changed = git('diff', '--name-only', baseSha, 'HEAD').split('\n').map((s) => s.trim()).filter(Boolean);
} catch {
  console.log('en-sync: 取不到 diff（本地仓库可能没有完整历史），跳过');
  process.exit(0);
}

const TRACKED = /^(?:_data\/[^/]+\.ya?ml|_(?:portfolio|publications|talks|teaching)\/[^/]+\.md)$/;

for (const rel of changed.filter((f) => TRACKED.test(f))) {
  if (!fs.existsSync(path.join(SITE_ROOT, rel))) continue; // 被删了
  let oldText;
  try {
    oldText = git('show', `${baseSha}:${rel}`);
  } catch {
    continue; // 新增文件，没有「旧版」可比
  }
  let oldData, newData;
  try {
    oldData = rel.endsWith('.md') ? matter(oldText).data : parseYaml(oldText);
    newData = PARSE(rel);
  } catch {
    continue; // 解析不了就跳过，校验那边会报更清楚的错
  }
  compared += 1;
  compare(oldData, newData, rel);
}

// ------------------------------------------------------------------ 输出
if (!findings.length) {
  console.log(
    compared === 0
      ? 'en-sync: 本次没有内容文件改动，无需比对'
      : `en-sync: 比对 ${compared} 个文件，中英同步无遗漏`,
  );
  process.exit(0);
}

const lines = [`en-sync: ${findings.length} 处「改了中文、英文没动」`];
for (const f of findings) {
  lines.push(
    `  ! ${f.file} — ${f.at}：中文（${f.base}）「${f.from}」→「${f.to}」，但 ${f.base}_en 仍是「${f.en}」`,
  );
  // 做成 GitHub annotation，推送时就看得到，不必专门翻日志
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::warning file=${f.file}::中文（${f.base}）改了，但 ${f.base}_en 没动，英文页会显示旧文案`);
  }
}
lines.push('  请顺手把对应 *_en 字段改一下（这不是错误，不会挡住部署）。');
console.warn(lines.join('\n'));

process.exit(STRICT ? 1 : 0);