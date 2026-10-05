#!/usr/bin/env node
// 构建产物的链接与可访问性检查（跑在 _site 上，CI 里 jekyll build 之后执行）。
//
// 它抓的是「Jekyll 构建成功、页面看着也正常，但 HTML 是坏的」那一类问题。
// 起因是一次真实审计发现缩略图把整个 body 克隆了一份，于是文档里每个 id
// 都出现两次（main / svgpx / 荣誉 / …），而且克隆体里 23 个可聚焦元素
// 对键盘用户是「看不见却能 Tab 进去」的。这种问题肉眼和构建日志都看不出来。
//
// 检查项：
//   1. 重复 id                     —— HTML 无效，且 getElementById / #锚点 可能命中错的那份
//   2. href="#" / href=""          —— 假链接：读屏念成链接、Tab 能停、点了地址栏多个 #
//   3. 外链 target=_blank 缺 noopener —— tabnabbing
//   4. 站内链接 404                 —— 顺着页面里的链接爬，锚点也一起验
//   5. 图片缺 alt
//   6. 横向溢出                     —— 窄屏被撑破
//   7. JS 运行时报错 / 同源资源 404
//
// 只报不挡：除「站内 404」外其余多为历史遗留，挡住部署不划算 ——
// 真要挡可以加 --strict。用法：node tools/check-links.mjs [--strict]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { SITE_ROOT } from './lib/content.mjs';

const STRICT = process.argv.includes('--strict');
const SITE_DIR = path.join(SITE_ROOT, '_site');

if (!fs.existsSync(SITE_DIR)) {
  console.log('links: _site 不存在，跳过（先 bundle exec jekyll build）');
  process.exit(0);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.xml': 'application/xml', '.txt': 'text/plain',
};

const PORT = 0;
const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (p.includes('\0')) { res.writeHead(400).end(); return; }
  const root = SITE_DIR;
  let file = path.join(root, p);
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    const cands = p.endsWith('/')
      ? [path.join(root, p + 'index.html')]
      : [path.join(root, p + '/index.html'), path.join(root, p + '.html'), path.join(root, p)];
    file = cands.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
  }
  if (!file) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;

const problems = [];
const pagesSeen = new Set();
const queue = ['/'];
const assetsSeen = new Set();

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
const page = await ctx.newPage();

let jsErrors = 0;
page.on('pageerror', () => { jsErrors += 1; });

while (queue.length) {
  const p = queue.shift();
  if (pagesSeen.has(p)) continue;
  pagesSeen.add(p);

  // 单个 URL 出岔子（畸形、跳到怪协议、DNS 失败）不该让整轮检查崩掉 ——
  // 崩掉等于这道关卡形同虚设，还会掩盖真正该报的问题。
  let res = null;
  try {
    res = await page.goto(ORIGIN + p, { waitUntil: 'load', timeout: 30_000 });
  } catch (err) {
    problems.push(`${p} — 打不开：${String(err.message).split('\n')[0]}`);
    continue;
  }
  if (!res || res.status() !== 200) { problems.push(`${p} — 页面返回 ${res?.status()}`); continue; }

  const localMissing = [];
  const onResponse = (r) => {
    if (r.status() === 404 && r.url().startsWith(ORIGIN)) localMissing.push(r.url().slice(ORIGIN.length));
  };
  page.on('response', onResponse);

  const found = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map((e) => e.id);
    const seen = new Set(), dup = new Set();
    for (const id of ids) { if (seen.has(id)) dup.add(id); seen.add(id); }
    return {
      dupIds: [...dup],
      links: [...document.querySelectorAll('a[href]')].map((a) => ({
        href: a.getAttribute('href'), target: a.target, rel: a.rel,
      })),
      assets: [...document.querySelectorAll('img[src],script[src],link[href]')]
        .map((e) => e.getAttribute('src') ?? e.getAttribute('href'))
        .filter((u) => u && !/^(https?:)?\/\//.test(u) && !u.startsWith('data:')),
      noAlt: [...document.images].filter((i) => !i.hasAttribute('alt')).length,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });

  page.off('response', onResponse);
  for (const m of localMissing) problems.push(`${p} — 同源资源 404：${m}`);

  for (const id of found.dupIds) {
    problems.push(`${p} — 重复 id="${id}"（多半是克隆整页造成的）`);
  }
  if (found.noAlt) problems.push(`${p} — ${found.noAlt} 张图片缺 alt`);
  if (found.overflow > 1) problems.push(`${p} — 横向溢出 ${found.overflow}px`);

  for (const u of found.assets) assetsSeen.add(u.split('#')[0].split('?')[0]);

  for (const { href, target, rel } of found.links) {
    if (href === '' || href === '#') {
      problems.push(`${p} — 假链接 href="${href}"：应改为不带 href 的占位元素`);
      continue;
    }
    // 任何带 scheme 的都跳掉：https、mailto、tel…… 之前只判了「//」开头，
    // 结果 mailto:wujiawen@… 被当成相对路径，new URL 之后整串变成 pathname，
    // 再拼到 origin 后面就成了一个畸形 URL，浏览器去解析
    // wujiawen@smail.nju.edu.cn 这个主机名 —— 直接把整轮检查带崩。
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      if (/^https?:/i.test(href) && target === '_blank' && !/noopener/.test(rel)) {
        problems.push(`${p} — 外链 target=_blank 缺 rel=noopener：${href}`);
      }
      continue;
    }
    if (href.startsWith('//')) continue; // 协议相对，必然是外链
    if (href.startsWith('#')) {
      if (href.length > 1 && !(await page.$(href))) problems.push(`${p} — 锚点不存在：${href}`);
      continue;
    }
    // 只跟同源。解析失败、跳到外域、协议怪异的，一律不当成站内页面。
    let target2;
    try {
      target2 = new URL(href, ORIGIN + p);
    } catch {
      continue;
    }
    if (target2.origin !== ORIGIN) continue;
    if (target2.protocol !== 'http:' && target2.protocol !== 'https:') continue;
    const abs = target2.pathname;
    if (abs && !pagesSeen.has(abs)) queue.push(abs);
  }
}

for (const u of assetsSeen) {
  const r = await page.request.get(ORIGIN + u);
  if (!r.ok()) problems.push(`资源 ${r.status()}：${u}`);
}

if (jsErrors) problems.push(`有 ${jsErrors} 处 JS 运行时报错`);

await browser.close();
server.close();

console.log(`links: 爬了 ${pagesSeen.size} 个页面、${assetsSeen.size} 个资源，问题 ${problems.length} 处`);
for (const p of problems) console.log(`  x ${p}`);
process.exit(STRICT && problems.length ? 1 : 0);