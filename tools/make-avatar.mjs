#!/usr/bin/env node
// 重采样头像，产出 srcset 要的多档尺寸。
//
// 为什么需要：avatar.webp 是 400×400（13.6 KB），而 CSS 里固定按 158px 见方显示
// —— 1x 屏上白白多传 2.53 倍的像素。带 srcset 之后 1x 只下 160px（4.1 KB）。
//
// 换头像后要重跑一次（npm run avatar），否则新图和旧尺寸对不上。
// 保留 400×400 的 avatar.webp 作为不支持 srcset 的老浏览器的兜底，
// 它同时也是 og_image 之外的站内引用。
//
// 不引新依赖：用已装好的 playwright（Chromium 的 canvas）做重采样与编码。
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { SITE_ROOT } from './lib/content.mjs';

const SRC = path.join(SITE_ROOT, 'images', 'avatar.webp');
const WIDTHS = [160, 320]; // 1x / 2x（CSS 里固定 158px）
const QUALITY = 0.82;

if (!fs.existsSync(SRC)) {
  console.error(`avatar: 找不到 ${path.relative(SITE_ROOT, SRC)}`);
  process.exit(1);
}

const b64 = fs.readFileSync(SRC).toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<canvas id="c"></canvas>');

const before = fs.statSync(SRC).size;
console.log(`avatar: 原图 avatar.webp ${(before / 1024).toFixed(1)} KB`);

for (const w of WIDTHS) {
  const dataUrl = await page.evaluate(
    async ({ b64, w, quality }) => {
      const img = new Image();
      img.src = 'data:image/webp;base64,' + b64;
      await img.decode();
      const c = document.getElementById('c');
      c.width = w;
      c.height = w;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, w);
      return c.toDataURL('image/webp', quality);
    },
    { b64, w, quality: QUALITY }
  );
  const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
  const out = path.join(SITE_ROOT, 'images', `avatar-${w}.webp`);
  fs.writeFileSync(out, buf);
  console.log(`avatar: avatar-${w}.webp ${w}×${w}  ${(buf.length / 1024).toFixed(1)} KB`);
}

await browser.close();
console.log('avatar: 换过头像记得重跑本命令（npm run avatar）。');