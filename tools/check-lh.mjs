#!/usr/bin/env node
// Lighthouse 预算关 —— 性能与可访问性分数不再是文档里的人肉对照，直接进 CI。
//
// 为什么要有这个：docs/lighthouse-baseline.md 早就记了基线，但「记着」不等于
// 「守着」——一次引入巨额 JS/一张没优化的首图，分数掉下去没人知道。这道关
// 在 build 关里把 _site 起成本地服务，对首页与履历各跑一次 Lighthouse，
// 分数低于地板就红（地板 = 基线 − 5 分容差，吸收单次 run 的抖动）。
//
// 方法口径（与 docs/lighthouse-baseline.md 对齐）：
// - 默认 mobile 模拟节流（4G）——线上访客的主要形态；
// - 浏览器交给 Playwright 托管的 headless-shell（见下方注释），LH 以 --port 附着；
// - 目标设成**本地 _site** 而不是生产站：预部署就能红，且不受本机代理噪声影响；
// - 分数小幅波动是常态（参照基线文档的 TBT 噪声记录），连续跌破地板才算真回归
//   —— 在 CI 里偶尔抖红一次，重跑本 job 即可判真伪。
//
//   npm run check:lh
//   node tools/check-lh.mjs --site <dir>      跑指定目录（默认 _site）
//
// 版本口径：Lighthouse 13（12→13 的算法变化会让绝对分数搬家，届时重跑一轮
// 校准，把地板与 docs/lighthouse-baseline.md 一起更新——方向即趋势，绝对值
// 以同一版本内部比较为准）。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { SITE_ROOT } from './lib/content.mjs';

const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const SITE_DIR = path.resolve(argOf('--site') || path.join(SITE_ROOT, '_site'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.xml': 'application/xml', '.txt': 'text/plain',
};

// 预算表：页面 → 四类分数地板（＝基线 − 5）。加新页面时同步补一行 +
// docs/lighthouse-baseline.md 记一次新页面的观测。
const PAGE_FLOORS = {
  '/': { performance: 68, accessibility: 84, 'best-practices': 95, seo: 95 },
  '/cv/': { performance: 84, accessibility: 80, 'best-practices': 95, seo: 95 },
};

if (!fs.existsSync(SITE_DIR)) {
  console.log('check-lh: _site 不存在，跳过（先 bundle exec jekyll build）');
  process.exit(0);
}

// —— 本地起 _site 静态服务 ——
function resolveInSite(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch { p = pathname; }
  let file = path.join(SITE_DIR, p);
  if (!file.startsWith(SITE_DIR)) return null;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const cands = p.endsWith('/')
      ? [path.join(SITE_DIR, p + 'index.html')]
      : [path.join(SITE_DIR, p + '/index.html'), path.join(SITE_DIR, p + '.html'), path.join(SITE_DIR, p)];
    file = cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
  }
  return file || null;
}

const server = http.createServer((req, res) => {
  const file = resolveInSite(new URL(req.url, 'http://x').pathname);
  if (!file) { res.writeHead(404).end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise(
  /** @type {(r: (v?: undefined) => void) => void} */ ((r) => server.listen(0, '127.0.0.1', () => r())),
);
const origin = `http://127.0.0.1:${/** @type {import('node:net').AddressInfo} */ (server.address()).port}`;

/* 浏览器怎么起：Playwright 托管 headless-shell（所有其它浏览器检查都已经在
   用它，本机与 CI 都稳定），LH 以 --port 附着。两个坑都记在这：
   1) 完整 chromium 不靠谱：Playwright 托管 + --port、chrome-launcher 用
      CHROME_PATH 自拉，在 runner 上都是 Page.navigate 时 Target closed；
   2) headless-shell 是阉割构建，缺 Storage 配额子系统：LH13 默认的存储重置
      （prepare 阶段 Storage.getUsageAndQuota）会挂死。用官方开关
      --disable-storage-reset 跳过重置 —— 每个页面都新起一个浏览器（全新
      profile），缓存本来就是干净的，语义与重置等价。
   注：这条路 2026-10-21 在本机 Windows 实测跑通（Chrome 153 / LH 13.5）。 */

/** 临时占一个端口再放掉：给 chrome 的 --remote-debugging-port 用。 */
async function pickDebugPort() {
  const temp = http.createServer();
  await new Promise(
    /** @type {(r: (v?: undefined) => void) => void} */ ((r) => temp.listen(0, '127.0.0.1', () => r())),
  );
  const port = /** @type {import('node:net').AddressInfo} */ (temp.address()).port;
  await new Promise(
    /** @type {(r: (v?: undefined) => void) => void} */ ((r) => temp.close(() => r())),
  );
  return port;
}

const LH_CLI = path.join(SITE_ROOT, 'node_modules', 'lighthouse', 'cli', 'index.js');
const problems = [];
const rows = [];

for (const p of Object.keys(PAGE_FLOORS)) {
  if (!resolveInSite(p)) {
    // 页面在本次构建里不存在（例如英文页被裁掉）——红，别静默
    problems.push(`${p} 在 _site 里不存在（预算表里却要它）`);
    continue;
  }
  const url = origin + p;
  const outJson = path.join(os.tmpdir(), `lh-${p.replace(/[^\w]/g, '_')}.json`);

  // 每页新起一个浏览器：--disable-storage-reset 之下，全新 profile 是「干净
  // 缓存」的唯一保证（两页复用同一浏览器会让 /cv/ 蹭到 / 的 SW 与缓存）。
  const debugPort = await pickDebugPort();
  let browser;
  try {
    browser = await chromium.launch({ args: [`--remote-debugging-port=${debugPort}`] });
  } catch (e) {
    await server.close();
    console.log(`check-lh: 起 headless-shell 失败（这是环境问题不是站点回归）：\n${String(e).slice(0, 600)}`);
    process.exit(1);
  }

  try {
    execFileSync(
      process.execPath,
      [LH_CLI, url,
        `--port=${debugPort}`,
        `--output-path=${outJson}`,
        '--output=json',
        '--only-categories=performance,accessibility,best-practices,seo',
        '--max-wait-for-load=120000',
        '--disable-storage-reset',
        '--quiet'],
      { cwd: SITE_ROOT, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (e) {
    await browser.close().catch(() => {});
    await server.close();
    console.log(`check-lh: Lighthouse 审计 ${p} 失败（${e.status ?? 'exec'} 损）：`);
    console.log(String((e.stderr || e.stdout || '')).slice(0, 1200));
    process.exit(1);
  }
  await browser.close().catch(() => {});
  const report = JSON.parse(fs.readFileSync(outJson, 'utf8'));
  fs.rmSync(outJson, { force: true });
  const cats = report.categories ?? {};
  const got = {};
  for (const k of Object.keys(PAGE_FLOORS[p])) {
    got[k] = cats[k]?.score == null ? null : Math.round(cats[k].score * 100);
  }
  rows.push({ page: p, got, floors: PAGE_FLOORS[p] });
  for (const k of Object.keys(PAGE_FLOORS[p])) {
    if (got[k] == null) { problems.push(`${p} — ${k} 分数缺失（审计没跑完？看 LH 的 runWarnings）`); continue; }
    const floor = PAGE_FLOORS[p][k];
    if (got[k] < floor) problems.push(`${p} — ${k} ${got[k]} 分，低于地板 ${floor}（基线−5容差）`);
  }
}

await server.close();

const head = '页面            | 性能 | 可访问性 | 最佳实践 | SEO';
console.log(`\n${head}\n${'-'.repeat(head.length)}`);
for (const r of rows) {
  const f = r.floors;
  const cell = (k) => {
    const v = r.got[k];
    const bad = v == null || v < f[k];
    return `${bad ? '✗' : '✓'} ${v ?? '—'}（≥${f[k]}）`;
  };
  console.log(`${r.page.padEnd(16)}| ${cell('performance')} | ${cell('accessibility')} | ${cell('best-practices')} | ${cell('seo')}`);
}

if (problems.length) {
  for (const p of problems) console.log('  ✗ ' + p);
  console.log('\ncheck-lh: FAIL —— 低于预算。可先重跑本关确认不是单次抖动，连续两次红即真回归。');
  process.exit(1);
}
console.log('\ncheck-lh: 预算全数达标 ✓');
