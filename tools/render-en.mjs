#!/usr/bin/env node
// 英文条目页生成 CLI。核心逻辑在 tools/lib/render-en.mjs（纯函数，tests/ 直接测）。
//
//   node tools/render-en.mjs             生成/覆盖（并清掉条目删除后的孤儿页）
//   node tools/render-en.mjs --check     只比对，有漂移就退出码 1
//   node tools/render-en.mjs --check --warn  只比对，漂移只提示（退出码 0）
//
// 为什么漂移只提示不挡部署：与 _includes/generated 同一个理由 —— 后台（Decap）
// 能改条目但跑不了生成器，「改一个字就发不上去」不可接受。CI 的 build job 在
// jekyll build 前会跑 npm run build:content，部署出去的永远是重新生成的那份；
// 仓库里这份过期只影响检视，由 --warn 点名。
import fs from 'node:fs';
import path from 'node:path';
import { SITE_ROOT } from './lib/content.mjs';
import { buildEnPages } from './lib/render-en.mjs';

const check = process.argv.includes('--check');
const warn = process.argv.includes('--warn');

const targets = buildEnPages();
const wanted = new Set(targets.map((t) => t.file));

/** _pages/en 下深度 > 3 的 .md（= 生成页；顶层手写页深度是 3）。 */
function listGenerated(dir = '_pages/en', out = []) {
  const abs = path.join(SITE_ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const name of fs.readdirSync(abs).sort()) {
    const rel = path.posix.join(dir, name);
    const child = path.join(SITE_ROOT, rel);
    if (fs.statSync(child).isDirectory()) listGenerated(rel, out);
    else if (rel.endsWith('.md') && rel.split('/').length > 3) out.push(rel);
  }
  return out;
}

if (check) {
  let stale = 0;
  for (const t of targets) {
    const abs = path.join(SITE_ROOT, t.file);
    const actual = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
    if (actual !== t.content) {
      stale += 1;
      const msg = `${t.file} 与数据不同步`;
      if (warn) console.warn(`! ${msg}`);
      else console.error(`✗ ${msg}`);
    }
  }
  for (const orphan of listGenerated()) {
    if (!wanted.has(orphan)) {
      stale += 1;
      const msg = `${orphan} 是孤儿生成页（条目已删或改名）`;
      if (warn) console.warn(`! ${msg}`);
      else console.error(`✗ ${msg}`);
    }
  }
  if (stale > 0) {
    if (warn) {
      console.warn(
        `\n${stale} 个英文条目页过期 —— 不影响部署，build job 会在 jekyll build 前自动重新生成。` +
          `\n想现在就把仓库里这份也同步掉：npm run build:content`,
      );
    } else {
      console.error(`\n${stale} 个英文条目页过期 —— 跑 \`npm run build:content\` 后重新提交。`);
      process.exit(1);
    }
  } else {
    console.log(`英文条目页与数据一致（${targets.length} 个文件）。`);
  }
  process.exit(0);
}

let written = 0;
for (const t of targets) {
  const abs = path.join(SITE_ROOT, t.file);
  const actual = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : null;
  if (actual === t.content) continue;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, t.content, 'utf8');
  written += 1;
  console.log(`✓ ${t.file}`);
}
let removed = 0;
for (const orphan of listGenerated()) {
  if (wanted.has(orphan)) continue;
  fs.rmSync(path.join(SITE_ROOT, orphan));
  removed += 1;
  console.log(`✗ ${orphan}（孤儿，已删）`);
}
console.log(
  `英文条目页：${targets.length} 个目标，${written ? `写入 ${written} 个` : '无文件改动'}` +
    `${removed ? `，删除孤儿 ${removed} 个` : ''}`,
);
