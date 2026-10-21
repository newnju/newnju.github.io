#!/usr/bin/env node
// 404 页专属行为回归 —— 交互断言 + /en/ 换装断言，真浏览器跑。
//
// 为什么单独一道关：CI 的链路爬取（check:links）只顺着导航走，404 页不在
// 爬取集合里；截图基线也不是它的；像素比对更照不出「脚本死了但 DOM 还在」。
// 而 404 恰恰是这种故障的首发地：2026-10 的 compress_html 事故里，本页的
// 太空侵略者与换装/自助引擎在线上全员静默阵亡，CI 五道关照样全绿。
// 这里把这页该动的地方各按一下：
//
//   中文（<缺路径>）：游戏点亮、开场三件套与页面内 JSON 一致、
//                    点「开始」后遮罩摘除，全程无 JS 报错；
//   /en/ 缺路径    ：换装引擎把 zh 块藏起来、en 块亮出来、lang 改成 en、
//                    文案换成英文一套，全程无 JS 报错。
//
// 断言的「期望值」直接从页面自己的 <script type="application/json"> 里读 ——
// 文案改了不用改这里；这里要守的是「JSON 确实被脚本填进了 DOM」。
//
//   node tools/check-404.mjs                  跑本地 _site（缺路径回退 404.html）
//   node tools/check-404.mjs --site <dir>     跑指定目录
//   node tools/check-404.mjs --base <url>     跑任意地址（例如线上）
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

/* 与 check-dom-behavior.mjs 同一套判定：这个地址在目录里有没有实体文件。
   两边必须一致 —— 没有实体文件的路径才走 404 fallback。 */
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
    console.log('check-404: _site 不存在，跳过（先 bundle exec jekyll build）');
    process.exit(0);
  }
  server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    /* GitHub Pages 的行为：不存在的路径由根 /404.html 兜底，状态码 404，
       location.pathname 保持原样 —— 404 页的引擎正是靠这个决定语言。 */
    const file = resolveInSite(p);
    if (file) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
      res.end(fs.readFileSync(file));
      return;
    }
    const fallback = path.join(SITE_DIR, '404.html');
    if (!fs.existsSync(fallback)) { res.writeHead(404).end('not found'); return; }
    res.writeHead(404, { 'Content-Type': MIME['.html'] });
    res.end(fs.readFileSync(fallback));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
}

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass, detail });

const browser = await chromium.launch();

async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1500 } });
  const page = await ctx.newPage();
  /* 同 check-dom-behavior 的改道逻辑：页面资源全是绝对地址
     （_config.yml 的 site.url），不拦的话浏览器会去生产站拿 CSS/JS，
     本地检查测到的就是线上旧版。磁盘上有就吃本地盘的，没有才放行。 */
  if (!BASE) {
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
  return { ctx, page };
}

/* 读页面自己的游戏文案 JSON + 各处 DOM 实况 */
function probe(page, lang) {
  return page.evaluate((lang) => {
    const i18n = JSON.parse(document.getElementById('n404-inv-i18n').textContent)[lang];
    const $ = (id) => document.getElementById(id);
    const hidden = (id) => $(id) ? $(id).hasAttribute('hidden') : null;
    const text = (id) => $(id) ? $(id).textContent : null;
    return {
      i18n,
      game: { exists: !!document.getElementById('n404-inv'), hidden: hidden('n404-inv') },
      hud: { score: text('n404-inv-l-score'), hi: text('n404-inv-l-hi'), wave: text('n404-inv-l-wave') },
      start: { btn: text('n404-inv-start'), hint: text('n404-inv-start-h'), title: text('n404-inv-start-t') },
      mute: text('n404-inv-mute'),
      overlayHiddenStart: hidden('n404-inv-scr-start'),
      selfServiceZh: document.querySelector('.n404[data-n404="zh"]')?.hasAttribute('hidden') ?? null,
      selfServiceEn: document.querySelector('.n404[data-n404="en"]')?.hasAttribute('hidden') ?? null,
      htmlLang: document.documentElement.getAttribute('lang'),
      title: document.title,
    };
  }, lang);
}

// ---------------------------------------------------------------- 1. 中文
{
  const { ctx, page } = await newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto(`${origin}/definitely-missing-page-xyz`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const p = await probe(page, 'zh');
  const i = p.i18n;

  check('中文：游戏区块点亮（hidden 摘除）', p.game.exists && p.game.hidden === false,
    `exists=${p.game.exists} hidden=${p.game.hidden}`);
  check('中文：开场标题来自 JSON', p.start.title === i.start.title, JSON.stringify(p.start.title));
  check('中文：开始按钮文案来自 JSON', p.start.btn === i.start.btn,
    `${JSON.stringify(p.start.btn)} 期望 ${JSON.stringify(i.start.btn)}`);
  check('中文：操作提示来自 JSON', p.start.hint === i.start.hint,
    `${JSON.stringify(p.start.hint)} 期望 ${JSON.stringify(i.start.hint)}`);
  check('中文：HUD 标签来自 JSON（得分/最高/波次）',
    p.hud.score === i.hud.score && p.hud.hi === i.hud.hi && p.hud.wave === i.hud.wave,
    JSON.stringify(p.hud));
  check('中文：声音钮文案来自 JSON', p.mute === i.snd.on, `${JSON.stringify(p.mute)} 期望 ${JSON.stringify(i.snd.on)}`);
  check('中文：语言提示块定着在 zh（en 块仍藏）', p.selfServiceEn === true, `en-hidden=${p.selfServiceEn}`);

  // 点开始：遮罩必须摘掉，且全程不许抛错
  await page.evaluate(() => document.getElementById('n404-inv-start').click());
  await page.waitForTimeout(500);
  const after = await probe(page, 'zh');
  check('中文：点开始后开场遮罩摘除', after.overlayHiddenStart === true, `hidden=${after.overlayHiddenStart}`);
  check('中文：全程无 JS 报错', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- 2. /en/ 路径
{
  const { ctx, page } = await newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto(`${origin}/en/definitely-missing-page-xyz`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const p = await probe(page, 'en');
  const i = p.i18n;

  check('英文：换装引擎把 <html lang> 改成 en', p.htmlLang === 'en', `lang=${p.htmlLang}`);
  check('英文：zh 自助块藏起来、en 块亮出来',
    p.selfServiceZh === true && p.selfServiceEn === false,
    `zh-hidden=${p.selfServiceZh} en-hidden=${p.selfServiceEn}`);
  check('英文：游戏区块点亮', p.game.exists && p.game.hidden === false, `hidden=${p.game.hidden}`);
  check('英文：开始按钮文案来自 JSON', p.start.btn === i.start.btn,
    `${JSON.stringify(p.start.btn)} 期望 ${JSON.stringify(i.start.btn)}`);
  check('英文：操作提示来自 JSON', p.start.hint === i.start.hint,
    `${JSON.stringify(p.start.hint)} 期望 ${JSON.stringify(i.start.hint)}`);
  check('英文：声音钮文案来自 JSON', p.mute === i.snd.on, `${JSON.stringify(p.mute)} 期望 ${JSON.stringify(i.snd.on)}`);
  check('英文：全程无 JS 报错', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? '  ✓' : '  ✗'} ${r.name}${r.detail ? `（${r.detail}）` : ''}`);
if (failed.length) {
  console.log(`\ncheck-404: ${failed.length}/${results.length} 项失败`);
  process.exit(1);
}
console.log(`\ncheck-404: ${results.length} 项全过 ✓`);
await server?.close();
