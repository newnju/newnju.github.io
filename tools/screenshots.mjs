// 视觉回归（L5 第三层）：起一个本地静态服务器指向 _site，用 Chromium 截图，
// 顺便跑几条「Jekyll 构建成功也照样能犯」的运行时断言。
//
//   node tools/screenshots.mjs              截图 + 跑断言（不比对）
//   node tools/screenshots.mjs --compare    再和 tests/__screenshots__/ 的基线做像素比对
//   node tools/screenshots.mjs --update     把当前结果写成基线
//   node tools/screenshots.mjs --strict-pixels  像素有差异也算失败（默认只提示）
//
// 运行时断言失败会挡住部署；像素比对默认只报不挡 —— 侧栏那段文字的栅格化抖动
// 能到 1%，比真回归还大，当门禁用只会天天误报。详见下面 MAX_DIFF_RATIO 的说明。
//
// 像素比对的基线**必须在同一环境生成**（字体渲染在 Windows / Linux 上必然不同），
// 所以基线取自 CI 的 artifact，本地 Windows 跑 --compare 会全是噪音 —— 本地只跑断言。
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const SITE_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = path.join(SITE_ROOT, 'screenshots');
const BASELINE_DIR = path.join(SITE_ROOT, 'tests', '__screenshots__');
const siteDir = path.join(SITE_ROOT, '_site');

const args = new Set(process.argv.slice(2));
const compare = args.has('--compare') || (!args.has('--no-compare') && process.env.CI === 'true');
const update = args.has('--update');

// 同一环境下大部分截图是逐字节一致的（实测 18 张里 16 张差异为 0），
// 但侧栏那段作者简介偶发「同样字号粗细不同」的栅格化抖动，能到 1% 左右 —— 比
// 真回归（少一个列表项约 0.3%）还大，所以不能靠调阈值区分，只能分开对待：
//
//   运行时断言（溢出 / 404 / JS 报错 / alt / href）→ 确定性，失败即失败，挡住部署
//   像素比对                          → 仅供参考，只报不挡，差异图照样上传
const MAX_DIFF_RATIO = 0.001;
const STRICT_PIXELS = args.has('--strict-pixels');

const PAGES = [
  ['home', '/'],
  ['cv', '/cv/'],
  ['timeline', '/timeline/'],
  ['publications', '/publications/'],
  ['portfolio', '/portfolio/'],
  ['talks', '/talks/'],
  ['teaching', '/teaching/'],
  ['home-en', '/en/'],
  ['cv-en', '/en/cv/'],
];

const VIEWPORTS = [
  ['desktop', { width: 1366, height: 900 }],
  ['mobile', { width: 390, height: 844 }],
];

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

const failures = [];
const pixelNotes = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);

function startServer(root) {
  const server = http.createServer((req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (pathname.includes('\0')) {
      res.writeHead(400).end();
      return;
    }
    const resolve = (rel) => path.join(root, rel);
    let file = resolve(pathname);
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      const candidates = pathname.endsWith('/')
        ? [resolve(pathname + 'index.html')]
        : [resolve(pathname + '/index.html'), resolve(pathname + '.html'), resolve(pathname)];
      file = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
    }
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/** 滚一遍整页，把懒加载 / 滚动渐显的元素全部触发，再回顶部。 */
async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((done) => {
        let y = 0;
        const step = () => {
          y += window.innerHeight * 0.8;
          window.scrollTo(0, y);
          if (y < document.body.scrollHeight) requestAnimationFrame(step);
          else {
            window.scrollTo(0, 0);
            done();
          }
        };
        requestAnimationFrame(step);
      }),
  );
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
}

async function main() {
  if (!fs.existsSync(siteDir)) {
    console.log('screenshots: _site 不存在，跳过（先 bundle exec jekyll build）');
    return 0;
  }

  const { chromium } = await import('playwright');
  const server = await startServer(siteDir);
  const origin = `http://127.0.0.1:${server.address().port}`;

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  if (update) fs.mkdirSync(BASELINE_DIR, { recursive: true });

  const browser = await chromium.launch();
  let missingBaseline = 0;
  let compared = 0;
  let mismatched = 0;

  try {
    for (const [vpName, viewport] of VIEWPORTS) {
      const context = await browser.newContext({
        viewport,
        colorScheme: 'light',
        reducedMotion: 'reduce',
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      // 本站滚动渐显、BibTeX 折叠等都是 JS 加的类，截图前先把动效关死
      await page.addInitScript(() => {
        const style = document.createElement('style');
        style.textContent =
          '*,*::before,*::after{animation-duration:0s!important;animation-delay:0s!important;' +
          'transition-duration:0s!important;transition-delay:0s!important}';
        document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
      });

      for (const [shotName, url] of PAGES) {
        const where = `${url} @${vpName}`;
        const pageErrors = [];
        const missing = [];
        page.removeAllListeners('pageerror');
        page.removeAllListeners('response');
        page.on('pageerror', (err) => pageErrors.push(err.message));
        page.on('response', (res) => {
          if (res.status() === 404 && res.url().startsWith(origin)) missing.push(res.url());
        });

        await page.goto(origin + url, { waitUntil: 'load', timeout: 30_000 });
        await settle(page);

        for (const msg of pageErrors) fail(where, `JS 抛异常：${msg}`);
        for (const u of missing) fail(where, `同源资源 404：${u.replace(origin, '')}`);

        const audit = await page.evaluate(() => {
          const out = { overflow: 0, noAlt: [], noHref: [] };
          out.overflow = document.documentElement.scrollWidth - window.innerWidth;
          for (const img of document.querySelectorAll('img')) {
            if (!img.hasAttribute('alt')) out.noAlt.push(img.getAttribute('src') ?? '(no src)');
          }
          for (const a of document.querySelectorAll('a')) {
            if (!a.hasAttribute('href')) out.noHref.push((a.textContent ?? '').trim().slice(0, 30));
          }
          return out;
        });
        if (audit.overflow > 1) fail(where, `横向溢出 ${audit.overflow}px（窄屏被撑破）`);
        for (const src of audit.noAlt) fail(where, `图片缺 alt：${src}`);
        for (const t of audit.noHref) fail(where, `链接缺 href：「${t}」`);

        const file = `${shotName}-${vpName}.png`;
        const actualPath = path.join(OUT_DIR, file);
        await page.screenshot({ path: actualPath, animations: 'disabled' });

        const baselinePath = path.join(BASELINE_DIR, file);
        if (update) {
          fs.copyFileSync(actualPath, baselinePath);
        } else if (compare) {
          if (!fs.existsSync(baselinePath)) {
            missingBaseline += 1;
            continue;
          }
          compared += 1;
          const a = PNG.sync.read(fs.readFileSync(baselinePath));
          const b = PNG.sync.read(fs.readFileSync(actualPath));
          if (a.width !== b.width || a.height !== b.height) {
            mismatched += 1;
            fail(where, `截图尺寸变了：基线 ${a.width}×${a.height}，现在 ${b.width}×${b.height}`);
            continue;
          }
          const diff = new PNG({ width: a.width, height: a.height });
          const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, { threshold: 0.1 });
          const ratio = diffPixels / (a.width * a.height);
          if (ratio > MAX_DIFF_RATIO) {
            mismatched += 1;
            const diffFile = file.replace(/\.png$/, '-diff.png');
            fs.writeFileSync(path.join(OUT_DIR, diffFile), PNG.sync.write(diff));
            const msg =
              `像素差异 ${(ratio * 100).toFixed(3)}% 超过 ${(MAX_DIFF_RATIO * 100).toFixed(3)}%（见 ${diffFile}）`;
            if (STRICT_PIXELS) fail(where, msg);
            else pixelNotes.push(`${where}: ${msg}`);
          }
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  const total = PAGES.length * VIEWPORTS.length;

  // 像素差异始终打印出来（差异图也会上传），但默认不挡住部署 —— 见上面 MAX_DIFF_RATIO 的说明
  for (const n of pixelNotes) console.warn(`  ! ${n}`);

  if (failures.length) {
    console.error(`screenshots: FAIL — ${failures.length} 处`);
    for (const f of failures) console.error(`  x ${f}`);
    return 1;
  }

  let tail = `screenshots: PASS — ${total} 张图已出到 screenshots/`;
  if (update) {
    tail = `screenshots: PASS — ${total} 张图已写成基线（tests/__screenshots__/）`;
  } else if (compare) {
    tail =
      mismatched === 0
        ? `screenshots: PASS — 比对 ${compared}/${total} 张基线，无差异`
        : `screenshots: PASS — 比对 ${compared}/${total} 张基线，${mismatched} 张有像素差异（仅提示，见上面的 ! 行和 *-diff.png）`;
    if (missingBaseline) {
      tail += `\n  ${missingBaseline} 张还没有基线，本次只出图：把 CI 的 screenshots artifact 取回放进 tests/__screenshots__/ 即可开启比对`;
    }
  }
  console.log(tail);
  return 0;
}

process.exit(await main());
