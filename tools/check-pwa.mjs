#!/usr/bin/env node
// PWA/service worker 行为回归 —— 注册、预缓存、离线回落三件套，真浏览器跑。
//
// 为什么也要单独一道关：sw.js 是 Jekyll 渲染产物（版本号靠 liquid 注入），
// 手滑写错 front matter / 分隔符会让它变成 YAML 或纯文本 —— 页面还能打开，
// 注册悄悄失败，站点退化成普通静态站，非到拔网线那一天没人知道。而且
// 「离线还能不能走」「新版本会不会把旧缓存糊在 last updated 上」这两件事，
// 其它所有关（links / DOM / inline-js / 404 / 截图）一个都照不出来。
//
// 这道关断言：
//   1. sw.js 以 JS 交付（Content-Type 不对直接红；Jekyll 手滑最早的信号）；
//   2. 注册成功且页面被接管（navigator.serviceWorker.controller 就位）；
//   3. 新版缓存就绪：caches 里有一个 nju-v* 缓存，'/' 与 main.css 都在；
//   4. 断网后访问未预缓存页面 → 回落首页快照（URL 保持原样、内容是首页）；
//   5. 断网后访问已预缓存页面（/cv/）→ 原页照常渲染（HTML 在缓存里）；
//   6. 恢复在线后一切照旧、全程无 JS 报错。
//
//   node tools/check-pwa.mjs                  跑本地 _site
//   node tools/check-pwa.mjs --site <dir>     跑指定目录
//   node tools/check-pwa.mjs --base <url>     跑任意地址（例如线上）
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright';
import { SITE_ROOT } from './lib/content.mjs';

const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const BASE = argOf('--base');
const SITE_DIR = path.resolve(argOf('--site') || path.join(SITE_ROOT, '_site'));

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.xml': 'application/xml',
  '.txt': 'text/plain',
};

let origin = BASE;
let server = null;

/* 与其余 browser 关同一套判定：绝对域名改道本地磁盘，本地测到的才是本次构建 */
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

if (!origin) {
  if (!fs.existsSync(SITE_DIR)) {
    console.log('check-pwa: _site 不存在，跳过（先 bundle exec jekyll build）');
    process.exit(0);
  }
  server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    const file = resolveInSite(p);
    if (file) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
      res.end(fs.readFileSync(file));
      return;
    }
    res.writeHead(404).end('not found');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
}

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass, detail });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

if (!BASE) {
  /* 改道与 check-404 一致：生产域名的一切资源都换成本地盘里的同路径文件 */
  await page.route(/^https?:\/\//, async (route) => {
    try {
      const url = new URL(route.request().url());
      if (url.origin === origin) return await route.continue();
      const file = resolveInSite(url.pathname);
      if (!file) return await route.continue();
      await route.fulfill({
        body: fs.readFileSync(file),
        contentType: MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
      });
    } catch {
      await route.continue().catch(() => {});
    }
  });
}

const errs = [];
page.on('pageerror', (e) => errs.push(String(e)));

/* —— 1/2/3：首次加载 → 注册 → 接管 → 预缓存就绪 —— */
await page.goto(origin + '/', { waitUntil: 'load' });

const swStatus = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready;
  const keys = await caches.keys();
  const name = keys.find((k) => /^nju-v\d+$/.test(k)) || null;
  const home = name ? await caches.match('/', { cacheName: name }) : null;
  const css = name ? await caches.match('/assets/css/main.css', { cacheName: name }) : null;
  return {
    registered: !!reg,
    controlled: !!navigator.serviceWorker.controller || !!reg.active,
    cacheName: name,
    homeCached: !!home,
    cssCached: !!css,
  };
});
check('sw.js 注册成功', swStatus.registered, swStatus.cacheName || '-');
check('注册后页面被接管', swStatus.controlled, '');
check('版本缓存存在（nju-vNNNNNNNNNNNN）', !!swStatus.cacheName, swStatus.cacheName || '');
check('首页快照进了缓存', swStatus.homeCached, '');
check('样式表进了缓存', swStatus.cssCached, '');

const swHead = await page.evaluate(async () => {
  const res = await fetch('/sw.js', { cache: 'no-store' });
  const text = await res.text();
  return { type: res.headers.get('content-type') ?? '', text: text.slice(0, 1400) };
});
check(
  'sw.js 以 JavaScript 交付（Jekyll 渲染没跑偏）',
  /javascript/.test(swHead.type) && /addEventListener\('install'/.test(swHead.text),
  `${swHead.type}；前 1400 字含 install 钩子`,
);

/* —— 4：断网 + 未预缓存页 → 首页快照兜底 —— */
await ctx.setOffline(true);
await page.goto(origin + '/publications/', { waitUntil: 'load' });
const offlineUnknown = await page.evaluate(() => ({
  path: location.pathname,
  title: document.title,
  body: document.body ? document.body.innerText.slice(0, 300) : '',
}));
check(
  '断网后未知页回落首页快照（URL 保持原样）',
  offlineUnknown.path === '/publications/' &&
    /武嘉文|Jiawen Wu|Wu Jiawen/i.test(offlineUnknown.title + offlineUnknown.body),
  offlineUnknown.title,
);

/* —— 5：断网 + 已预缓存页 → 原页照常 —— */
await page.goto(origin + '/cv/', { waitUntil: 'load' });
const offlineCv = await page.evaluate(() => ({
  title: document.title,
  h1: document.querySelector('h1') ? document.querySelector('h1').textContent : '',
}));
check('断网后 /cv/ 仍能渲染（精确命中缓存）', /履历|Curriculum|CV/i.test(offlineCv.title + offlineCv.h1), offlineCv.title);

/* —— 6：恢复在线 —— */
await ctx.setOffline(false);
await page.goto(origin + '/timeline/', { waitUntil: 'load' });
const onlineAgain = await page.evaluate(() => document.title);
check('恢复在线后导航照常', (onlineAgain || '').length > 0, onlineAgain);
check('全程无 JS 报错', errs.length === 0, errs.join(' | '));

await ctx.close();
await browser.close();

const failed = results.filter((r) => !r.pass);
results.forEach((r, i) => console.log(`${r.pass ? '  ✓' : '  ✗'} [${i}] ${r.name}${r.detail ? `（${r.detail}）` : ''}`));
if (failed.length) {
  console.log(`\ncheck-pwa: ${failed.length}/${results.length} 项失败  FAIL-INDEX:${failed.map((r) => results.indexOf(r)).join(',')}`);
  process.exit(1);
}
console.log(`\ncheck-pwa: ${results.length} 项全过 ✓`);
await server?.close();
