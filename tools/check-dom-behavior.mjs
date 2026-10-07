#!/usr/bin/env node
// 交互行为回归：主题切换、联系方式折叠、顶栏折行、顶栏高度变量、微信分享弹层。
//
// 为什么要有这个：把 jQuery 换成原生 JS 时，截图只能看出外观，看不出「点了有没有反应」。
// 这个文件把交互拆成可断言的行为，换库前后跑同一套，输出必须逐条一致。
//
//   node tools/check-dom-behavior.mjs                    跑本地 _site
//   node tools/check-dom-behavior.mjs --base <url>       跑任意地址（默认本地 _site）
//   node tools/check-dom-behavior.mjs --inject <file>    把 /assets/js/main.min.js
//                                                        换成指定文件（换库前后对比用）
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
const INJECT = argOf('--inject');
const SITE_DIR = path.join(SITE_ROOT, '_site');

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

/* 把 URL 路径解析成 _site 里的真实文件，本地服务器与下面的改道共用同一套
   规则 —— 两边对「这个地址有没有对应的本地文件」的判断必须一致。 */
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
    console.log('behavior: _site 不存在，跳过（先 bundle exec jekyll build）');
    process.exit(0);
  }
  server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    const file = resolveInSite(p);
    if (!file) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${server.address().port}`;
}

const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass, detail });

const browser = await chromium.launch();

async function newPage(viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  /* 页面里的资源全是绝对地址（_config.yml 的 site.url → base_path），于是浏览器
     会去**生产站**拿 CSS/JS，而不是拿我们刚构建的这份：本地检查测的其实是线上
     旧版 —— 新脚本一天没部署，这台检查就一天测不到它（微信按钮的 hidden 也就
     永远摘不掉，反过来把「还没上线」判成「上线后是坏的」）。
     这里把跨 origin 的请求按路径改回本地 _site：磁盘上有就吃本地的（那才是被测
     对象），没有才放行（打点端点、外链本来就该出去）。--base 是拿别的地址来跑
     的，不改道。后注册的 route 先匹配，所以 INJECT 仍压得住 main.min.js。 */
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
  if (INJECT) {
    const body = fs.readFileSync(path.resolve(INJECT), 'utf8');
    await page.route('**/assets/js/main.min.js', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body })
    );
  }
  return { ctx, page };
}

// ---------------------------------------------------------------- 1. 无 JS 报错
{
  const { ctx, page } = await newPage({ width: 1366, height: 900 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(origin + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  check('页面加载无 JS 报错', errs.length === 0, errs.join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- 2. 主题切换
{
  const { ctx, page } = await newPage({ width: 1366, height: 900 });
  await page.goto(origin + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  const before = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    stored: localStorage.getItem('theme'),
    icon: document.querySelector('#theme-icon')?.className ?? null,
    color: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
  }));

  await page.click('#theme-toggle');
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    stored: localStorage.getItem('theme'),
    icon: document.querySelector('#theme-icon')?.className ?? null,
    color: document.querySelector('meta[name="theme-color"]')?.getAttribute('content') ?? null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
  }));

  check('点主题按钮后 data-theme 翻转', before.theme !== after.theme, `${before.theme} → ${after.theme}`);
  check('点主题按钮后 localStorage 落盘', after.stored === 'dark' || after.stored === 'light', String(after.stored));
  check(
    '主题图标类随之互换',
    /fa-moon/.test(before.icon ?? '') !== /fa-moon/.test(after.icon ?? ''),
    `${before.icon} → ${after.icon}`,
  );
  // syncThemeColor() 读的是 document.body 的 background-color，而本站的背景
  // 画在更内层的元素上，body 算出来是 transparent —— 于是这行一直是空转，
  // 地址栏配色只由 custom.html 里那两条 media=prefers-color-scheme 决定，
  // 手动切主题时不会跟着变。这是**既有行为**，不是回归，所以这里只断言
  // 「调用没抛错、meta 在」，不去断言它会变。
  check('syncThemeColor 跑过且没抛错（meta 存在）', after.color !== null, `content=${after.color}`);

  // 再点一次应当回到原状
  await page.click('#theme-toggle');
  await page.waitForTimeout(400);
  const back = await page.evaluate(() => ({
    theme: document.documentElement.getAttribute('data-theme'),
    icon: document.querySelector('#theme-icon')?.className ?? null,
  }));
  check('再点一次回到原主题', back.theme === before.theme, `${after.theme} → ${back.theme}`);
  check('图标也复原', back.icon === before.icon, `${back.icon}`);

  // 刷新后应记住选择
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(900);
  const persisted = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  check('刷新后记住上次选择', persisted === before.theme, `${persisted}`);
  await ctx.close();
}

// ---------------------------------------------------------------- 3. 联系方式折叠
// 「关注」按钮只在 ≤900px 出现（≥1000px 时社交图标直接平铺，按钮 display:none），
// 所以这一项必须在窄一点的视口下测，否则点不到。
{
  const { ctx, page } = await newPage({ width: 880, height: 900 });
  await page.goto(origin + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1000);
  const btn = await page.$('.author__urls-wrapper button');
  if (!btn) {
    check('联系方式折叠按钮存在', false, '没找到 .author__urls-wrapper button');
  } else {
    const read = () =>
      page.evaluate(() => {
        const b = document.querySelector('.author__urls-wrapper button');
        const u = document.querySelector('.author__urls');
        return {
          open: b?.classList.contains('open') ?? null,
          display: u ? getComputedStyle(u).display : null,
        };
      });
    const a = await read();
    await btn.click();
    await page.waitForTimeout(600);
    const b = await read();
    check('点联系方式按钮后展开', a.display !== b.display, `${a.display} → ${b.display}`);
    check('按钮 open 类切换', a.open !== b.open, `${a.open} → ${b.open}`);
    await btn.click();
    await page.waitForTimeout(600);
    const c = await read();
    check('再点一次收回', c.display === a.display, `${b.display} → ${c.display}`);
  }
  await ctx.close();
}

// ---------------------------------------------------------------- 4. 顶栏折行
{
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await ctx.newPage();
  if (INJECT) {
    const body = fs.readFileSync(path.resolve(INJECT), 'utf8');
    await page.route('**/assets/js/main.min.js', (route) =>
      route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body })
    );
  }
  await page.goto(origin + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const readNav = () =>
    page.evaluate(() => {
      const btn = document.querySelector('#site-nav > button');
      const vis = document.querySelector('#site-nav .visible-links');
      const hid = document.querySelector('#site-nav .hidden-links');
      return {
        btnHidden: btn ? btn.classList.contains('hidden') : null,
        count: btn ? btn.getAttribute('count') : null,
        visible: vis ? vis.children.length : null,
        hidden: hid ? hid.children.length : null,
      };
    });

  const wide = await readNav();
  check('宽屏时汉堡按钮隐藏', wide.btnHidden === true, JSON.stringify(wide));
  check('宽屏时没有条目被折进隐藏列表', Number(wide.hidden) === 0, `hidden=${wide.hidden}`);

  await page.setViewportSize({ width: 760, height: 900 });
  await page.waitForTimeout(800);
  const narrow = await readNav();
  check('窄屏时汉堡按钮出现', narrow.btnHidden === false, JSON.stringify(narrow));
  check('窄屏时有条目被折进去', Number(narrow.hidden) > 0, `hidden=${narrow.hidden}`);
  // 注意别去断言 count === hidden：≤768px 时 han.js 第 2 节会自己把整个顶栏
  // 收进汉堡（那 8 条是它折的），而 count 记的是 greedy-navigation 自己
  // 那轮 breaks 的长度。两套机制，不能拿它们互相校验。
  check('折进去后可见条目变少', Number(narrow.visible) < Number(wide.visible), `${wide.visible} → ${narrow.visible}`);

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.waitForTimeout(800);
  const back = await readNav();
  check('拉回宽屏后复原', Number(back.visible) === Number(wide.visible) && Number(back.hidden) === 0, JSON.stringify(back));
  await ctx.close();
}

// ---------------------------------------------------------------- 5. 顶栏高度变量
{
  const { ctx, page } = await newPage({ width: 1366, height: 900 });
  await page.goto(origin + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const m = await page.evaluate(() => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--han-masthead-h').trim();
    const mast = document.querySelector('.masthead');
    return {
      varValue: v,
      bodyPadTop: document.body.style.paddingTop,
      mastHeight: mast ? Math.round(mast.getBoundingClientRect().height) : 0,
    };
  });
  check('--han-masthead-h 已设置且大于 0', /^[0-9.]+px$/.test(m.varValue) && parseFloat(m.varValue) > 0, JSON.stringify(m));
  check('body 上内边距约等于顶栏高度', Math.abs(parseFloat(m.bodyPadTop) - m.mastHeight) <= 2, JSON.stringify(m));
  await ctx.close();
}

// ---------------------------------------------------------------- 6. 微信分享弹层
// 「分享到」的中文按钮集合由 tests/social-share.test.mjs 断言（渲染层），这里只管
// 交互：按钮默认隐藏 → 脚本摘掉 hidden → 点开才有二维码 → 二维码库**点开时才**
// 下载（首屏不该为了一个可能没人点的按钮多带 20KB）。页面用集合详情页，
// 那一块「分享到」才存在。
{
  const { ctx, page } = await newPage({ width: 1366, height: 900 });
  const requested = [];
  page.on('request', (r) => {
    if (/qrcode\.min\.js$/.test(r.url())) requested.push(r.url());
  });
  await page.goto(origin + '/publication/2025-four-gods-mirror', { waitUntil: 'load' });
  await page.waitForTimeout(900);

  const before = await page.evaluate(() => {
    const btn = document.querySelector('[data-share-wechat]');
    return {
      exists: !!btn,
      hidden: btn ? btn.hasAttribute('hidden') : null,
      qrRequested: null,
    };
  });
  check('中文详情页有微信按钮', before.exists === true);
  check('脚本跑完后按钮可见', before.hidden === false, `hidden=${before.hidden}`);
  check('首屏没有加载二维码库', requested.length === 0, `${requested.length} 个请求`);

  if (before.exists) {
    await page.click('[data-share-wechat]');
    await page.waitForTimeout(700);
    const opened = await page.evaluate(() => {
      const panel = document.querySelector('.han-sharecard');
      const svg = panel?.querySelector('svg');
      const path = svg?.querySelector('path');
      return {
        open: !!panel && !panel.hidden,
        role: panel?.getAttribute('role'),
        qrLoaded: !!window.qrcode,
        hasPath: !!path && (path.getAttribute('d') || '').length > 40,
        hasUrl: (panel?.querySelector('.han-sharecard__url')?.textContent || '').includes('newnju.github.io'),
        expanded: document.querySelector('[data-share-wechat]')?.getAttribute('aria-expanded'),
      };
    });
    check('点开微信出现弹层', opened.open === true, JSON.stringify(opened));
    check('弹层是 dialog 且 aria-expanded 同步', opened.role === 'dialog' && opened.expanded === 'true', JSON.stringify(opened));
    check('二维码库在点开时才加载', requested.length === 1 && opened.qrLoaded === true, `请求 ${requested.length} 个`);
    check('二维码真的画出来了（path 有内容）', opened.hasPath === true);
    check('弹层里能看到本页绝对地址', opened.hasUrl === true);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const closed = await page.evaluate(() => document.querySelector('.han-sharecard')?.hidden);
    check('ESC 关闭弹层', closed === true, `hidden=${closed}`);
  }

  // 窄屏也不能溢出
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  check('详情页 1366px 无横向溢出', overflow <= 1, `${overflow}px`);
  await ctx.close();
}

// ---------------------------------------------------------------- 7. 登录按钮两态
// 未登录：人像图标 fa-circle-user（静态默认，JS 不跑也是它），点击进 /admin/；
// 已登录：Decap 的登录态键（decap-cms-user）存在 → 换回登录图标，点击弹
// 确认框退出。这里用「手工塞键 + 刷新」模拟登录成功，确认/取消两条路都测。
{
  const { ctx, page } = await newPage({ width: 1366, height: 900 });
  const read = () =>
    page.evaluate(() => {
      const a = document.querySelector('#login-link a');
      const i = a && a.querySelector('i');
      return {
        icon: i ? i.className : null,
        href: a ? a.getAttribute('href') : null,
        aria: a ? a.getAttribute('aria-label') : null,
        state: a ? a.getAttribute('data-state') : null,
        stored: localStorage.getItem('decap-cms-user'),
      };
    });

  await page.goto(origin + '/', { waitUntil: 'load' });
  await page.waitForTimeout(900);
  const out = await read();
  check('默认（未登录）是人像图标', /fa-circle-user/.test(out.icon ?? ''), out.icon);
  check('默认 data-state=out 且指向 /admin/', out.state === 'out' && /\/admin\/$/.test(out.href ?? ''), `${out.state} ${out.href}`);

  // 模拟 Decap 登录成功写入的那份键
  await page.evaluate(() =>
    localStorage.setItem('decap-cms-user', JSON.stringify({ backendName: 'github', login: 'newnju', token: 'fake' })),
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(900);
  const inS = await read();
  check('有登录态时图标切回登录图标', /fa-right-to-bracket/.test(inS.icon ?? ''), inS.icon);
  check('有登录态时 data-state=in 且 aria 是退出文案', inS.state === 'in' && /退出|Sign out/.test(inS.aria ?? ''), `${inS.state} ${inS.aria}`);

  // 点击 → 确认框 → 接受：键被清、图标回到人像
  page.once('dialog', (d) => d.accept());
  await page.click('#login-link a');
  await page.waitForTimeout(400);
  const cleared = await read();
  check('确认退出后登录键被清除', cleared.stored === null, String(cleared.stored));
  check('确认退出后图标回到人像', /fa-circle-user/.test(cleared.icon ?? ''), cleared.icon);

  // 取消确认：登录态原样保留
  await page.evaluate(() =>
    localStorage.setItem('decap-cms-user', JSON.stringify({ backendName: 'github', login: 'newnju', token: 'fake' })),
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(700);
  page.once('dialog', (d) => d.dismiss());
  await page.click('#login-link a');
  await page.waitForTimeout(400);
  const kept = await read();
  check('取消确认则保持登录', kept.stored !== null && /fa-right-to-bracket/.test(kept.icon ?? ''), kept.icon);
  await ctx.close();
}

// ------------------------------------------------- 8. 英文条目页（/en/…）
// tools/render-en.mjs 生成的页面要像真正的英文页：标题与正文是英文译文（不是
// 中文原文顶着英文外壳）、语言切换回得到中文原文、分享是英文五件套（无微信）、
// 阅读数容器凭 zh_url 放行、页面自身没有 JS 报错。
{
  const { ctx, page } = await newPage({ width: 1366, height: 900 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  await page.goto(origin + '/en/publication/2025-four-gods-zhi-wen', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => {
    const h1 = document.querySelector('h1');
    const content = document.querySelector('.page__content');
    const sw = document.querySelector('.lang-switch a');
    const share = document.querySelector('.page__share');
    const btns = share ? [...share.querySelectorAll('.btn')] : [];
    const pv = document.querySelector('.page__views');
    const nav = [
      ...document.querySelectorAll(
        '#site-nav .visible-links li:not(.lang-switch):not(#login-link) a',
      ),
    ].map((a) => a.getAttribute('href'));
    /* base_path 是完整域名（_includes/base_path），站内链接一律绝对地址；而本地
       测试页跑在 127.0.0.1 上，两者 origin 不同 —— 站内 origin 从站点标题链接
       （= base_path + /en/）推导，跟它同源的折成 pathname 参与检查，真正的外链
       （github.com 等）丢弃。 */
    const home = document.querySelector('#site-nav .masthead__menu-item--lg a');
    const siteOrigin = home
      ? new URL(home.getAttribute('href'), location.origin).origin
      : location.origin;
    const navPaths = nav
      .filter((h) => {
        try {
          const u = new URL(h, location.origin);
          return u.origin === siteOrigin || u.origin === location.origin;
        } catch {
          return false;
        }
      })
      .map((h) => new URL(h, location.origin).pathname);
    return {
      h1: h1 ? h1.textContent : '',
      content: content ? content.textContent : '',
      swHref: sw ? sw.getAttribute('href') : null,
      shareCount: btns.length,
      shareHidden: btns.filter((b) => b.hidden).length,
      wechat: !!document.querySelector('[data-share-wechat]'),
      pvPath: pv ? pv.getAttribute('data-path') : null,
      pvText: pv ? pv.textContent : '',
      navPaths,
    };
  });

  check('英文条目页 h1 是英文标题', /Zhi and Wen/.test(info.h1) && !/质与文/.test(info.h1), info.h1.trim());
  check(
    '英文条目页正文是英文译文',
    /The paper was presented/.test(info.content) && !/本文在南京大学历史学院/.test(info.content),
  );
  {
    const swPath = info.swHref ? new URL(info.swHref, origin).pathname : '';
    check(
      '语言切换回中文原文',
      swPath === '/publication/2025-four-gods-zhi-wen',
      `${info.swHref} → ${swPath}`,
    );
  }
  check(
    '英文分享是五件套且无隐藏',
    info.shareCount === 5 && info.shareHidden === 0,
    `${info.shareCount} 个 / hidden=${info.shareHidden}`,
  );
  check('英文页没有微信按钮', info.wechat === false);
  check(
    '阅读数容器按 zh_url 放行且路径是本页',
    info.pvPath === '/en/publication/2025-four-gods-zhi-wen' && /Reads/.test(info.pvText),
    `${info.pvPath} ${info.pvText.trim()}`,
  );
  check(
    '英文导航链接都带 /en 前缀',
    info.navPaths.length >= 3 && info.navPaths.filter((h) => !h.startsWith('/en')).length === 0,
    JSON.stringify(info.navPaths),
  );
  check('英文页没有 JS 报错', pageErrors.length === 0, pageErrors.join('; '));
  await ctx.close();
}

// ------------------------------------------------- 9. 页脚（层叠 + 计数行）
// 短视口（1280×720）滚到底时，fit 态固定侧栏（position: fixed + transform，
// 定位绘制层）的线稿 .han-drawline 会压在普通流页脚的文字上（实测重叠 48px）；
// 页脚靠 position: relative 也进定位层、按 DOM 序赢 —— 断言重叠区命中测试顶层
// 是页脚而不是线稿。计数行 markup 要有 pv / 今日 / 今日访客 三组数字和
// 「统计详情」链接，字号与最底下的版权行取同一个 $type-size-7。
// （visit.js 在 127.0.0.1 上按设计不取数，整块保持 hidden —— 可见性与数字
//  的回填留给线上验证，这里只查 markup 与层叠。）
{
  const { ctx, page } = await newPage({ width: 1280, height: 720 });
  await page.goto(origin + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const footer = document.querySelector('.page__footer');
    const drawline = document.querySelector('.han-drawline');
    const vis = document.querySelector('.page__footer-visits');
    const copy = document.querySelector('.page__footer-copyright');
    if (!footer || !drawline || !vis || !copy) return { missing: true };
    const fb = footer.getBoundingClientRect();
    const vb = drawline.getBoundingClientRect();
    const oy0 = Math.max(fb.y, vb.y);
    const oy1 = Math.min(fb.bottom, vb.bottom);
    let hit = null;
    if (oy1 > oy0) {
      const e = document.elementFromPoint(vb.x + vb.width / 2, (oy0 + oy1) / 2);
      hit = e
        ? { el: e.getAttribute('class') || e.tagName, inFooter: footer.contains(e), inDrawline: drawline.contains(e) }
        : null;
    }
    return {
      missing: false,
      footerPos: getComputedStyle(footer).position,
      overlap: Math.round(oy1 - oy0),
      hit,
      visHTML: vis.innerHTML.replace(/\s+/g, ' '),
      visFont: getComputedStyle(vis).fontSize,
      copyFont: getComputedStyle(copy).fontSize,
    };
  });
  check('页脚 position: relative（进定位绘制层）', info.footerPos === 'relative', info.footerPos);
  check(
    '线稿与页脚重叠区的顶层是页脚（线稿不盖页脚文字）',
    info.overlap <= 0 || (info.hit && info.hit.inFooter && !info.hit.inDrawline),
    `overlap=${info.overlap}px hit=${JSON.stringify(info.hit)}`,
  );
  check(
    '计数行含 pv / 今日 / 今日访客 与统计详情链接',
    /data-fill="pv"/.test(info.visHTML) &&
      /data-fill="today_pv"/.test(info.visHTML) &&
      /data-fill="today_uv"/.test(info.visHTML) &&
      /<a[^>]+href="[^"]*\/stats"/.test(info.visHTML),
    info.visHTML.slice(0, 200),
  );
  check('计数行字号与版权行一致', info.visFont === info.copyFont, `${info.visFont} vs ${info.copyFont}`);
  await ctx.close();
}

await browser.close();
if (server) server.close();

const bad = results.filter((r) => !r.pass);
console.log(`behavior: ${results.length - bad.length}/${results.length} 项通过${INJECT ? `（注入 ${path.basename(INJECT)}）` : ''}`);
for (const r of results) console.log(`  ${r.pass ? '✓' : '✗'} ${r.name}${r.detail ? `  —— ${r.detail}` : ''}`);
process.exit(bad.length ? 1 : 0);