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
// - 浏览器由 Lighthouse 自己拉起：CHROME_PATH 显式指向 Playwright 缓存里的
//   **完整 chromium**（runner 上唯一的 Chrome 就是它；不猜 PATH、不装系统版）；
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

/* 浏览器怎么起：让 Lighthouse 自己拉 chrome-launcher 起，我们只负责用
   CHROME_PATH 把「完整 chromium」的路径指清楚。走过两条弯路，都记在这：
   1) Playwright launch + LH --port 附着：LH 建 target 后 Page.navigate 时
      会被收走（Target closed），GitHub runner 上实测必挂；
   2) Playwright 默认 headless 用的是 chromium-headless-shell（阉割构建，
      缺 Storage 配额子系统），LH13 prepare 阶段会报
      Protocol error(Storage.getUsageAndQuota)。
   所以这里扫描 Playwright 缓存，只要 chromium-<rev> 的**完整**构建（排除
   headless_shell），把路径交给 chrome-launcher。 */

/** @returns {string} */
function findFullChromium() {
  const base = process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
    : process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
      : process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), '.cache', 'ms-playwright');
  const exe = process.platform === 'win32'
    ? ['chrome-win64', 'chrome.exe']
    : process.platform === 'darwin'
      ? ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium']
      : ['chrome-linux', 'chrome'];
  /** @type {string[]} */
  const found = [];
  if (fs.existsSync(base)) {
    for (const d of fs.readdirSync(base)) {
      // 只认完整构建：chromium-1243 版本号，不认 chromium_headless_shell-1243
      if (!/^chromium-\d+$/.test(d)) continue;
      const p = path.join(base, d, ...exe);
      if (fs.existsSync(p)) found.push(p);
    }
  }
  if (!found.length) {
    throw new Error(`check-lh: 找不到完整 chromium（扫了 ${base}）—— 先 npx playwright install chromium`);
  }
  // 多版本共存时取修订号最大的那颗
  found.sort((a, b) => {
    const rev = (s) => Number((s.match(/chromium-(\d+)/) || [])[1] || 0);
    return rev(b) - rev(a);
  });
  return found[0];
}

// Windows 本机不跑（预算关的家在 CI ubuntu）：沙箱环境里完整 chrome 起不来
// （ProcessSingleton 锁被拒），headless-shell 又缺配额子系统。CI linux 上
// 完整 chromium + chrome-launcher 是通途。
if (process.platform === 'win32') {
  console.log('check-lh: 本机 Windows 没有能跑的完整 Chrome（沙箱限制 + headless-shell 缺配额）——预算关交给 CI 跑');
  await server.close();
  process.exit(0);
}

const CHROME_PATH = findFullChromium();
console.log('check-lh: chromium =', CHROME_PATH);

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
  try {
    execFileSync(
      process.execPath,
      [LH_CLI, url,
        `--output-path=${outJson}`,
        '--output=json',
        '--only-categories=performance,accessibility,best-practices,seo',
        '--max-wait-for-load=120000',
        '--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage',
        '--quiet'],
      { cwd: SITE_ROOT, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CHROME_PATH } },
    );
  } catch (e) {
    await server.close();
    console.log(`check-lh: Lighthouse 审计 ${p} 失败（${e.status ?? 'exec'} 损）：`);
    console.log(String((e.stderr || e.stdout || '')).slice(0, 800));
    process.exit(1);
  }
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
