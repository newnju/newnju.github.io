#!/usr/bin/env node
// 内联脚本语法守门 —— 把 compress_html 吃掉内联 <script> 的事故制度化。
//
// 为什么要有这个：站点的 compress_html 布局（penibelst jch，default→compress
// 链）会把每个内联 <script> 压成一行。脚本里有行注释的话，注释之后的整段
// 代码会被吞掉 —— Jekyll 构建照样成功，五道 CI 关全是绿的，浏览器在线上
// 控制台报 "Unexpected end of input"，脚本整个静默阵亡（2026-10 的 404 页
// 事故：内联的换装/自助引擎 + 太空侵略者在线上从未真正跑起来过）。
//
// 所以这道关不看源码、不看仓库里的文件，直接对**最终的 _site HTML**（也就
// 是真正会部署出去的那一份，压缩后的最终形态）里的每个可执行内联脚本做
// 语法校验：凡 SyntaxError 一律失败，把这类故障拦在部署之前。
//
//   node tools/check-inline-js.mjs               扫本地 _site
//   node tools/check-inline-js.mjs --site <dir>  扫指定目录
//
// 跳过不算错的：带 src 的外链脚本、type 为 JSON / JSON-LD / importmap 的
// 数据块（不是 JS）、type="module" 的内联模块（vm.Script 不支持
// import/export 语法，本站目前也没有内联模块 —— 出现时会明确数出来提醒）。
//
// 想让脚本活下来只有两条路：写成完全没有行注释、也不含敏感空白的多行脚本
// （不推荐 —— 压缩行为随时可能变），或者像 assets/js/*.min.js 那样放外链
// 文件。页面专属 JS 一律外链，是本站定死的规矩。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { SITE_ROOT } from './lib/content.mjs';

const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};
const SITE = path.resolve(argOf('--site') || path.join(SITE_ROOT, '_site'));

if (!fs.existsSync(SITE)) {
  console.log('inline-js: 没有构建产物，跳过（先 bundle exec jekyll build）');
  process.exit(0);
}

// —— 收集 _site 下全部 .html ——
const htmls = [];
(function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p);
    else if (name.endsWith('.html')) htmls.push(p);
  }
})(SITE);

// <script> 标签的 attrs 里有没有可执行形态。
// type 缺省执行；只有标准 JS 类型执行；JSON/JSON-LD/importmap 是数据块；
// module 不进语法校验（vm.Script 不吃 import/export），单独数出来。
function scriptKind(attrs) {
  const type = (attrs.match(/\btype\s*=\s*["']([^"']*)["']/i) || [])[1];
  const hasSrc = /\bsrc\s*=/i.test(attrs);
  if (hasSrc) return 'external';
  if (type === undefined) return 'js';
  const t = type.trim().toLowerCase();
  if (t === '' || t === 'text/javascript' || t === 'text/javascript; charset=utf-8' ||
      t === 'application/javascript' || t === 'application/x-javascript' ||
      t === 'text/ecmascript' || t === 'module') {
    return t === 'module' ? 'module' : 'js';
  }
  return 'data';
}

const problems = [];
const counted = { html: 0, js: 0, data: 0, external: 0, module: 0 };

for (const file of htmls) {
  const rel = path.relative(SITE, file).split(path.sep).join('/');
  counted.html += 1;
  const html = fs.readFileSync(file, 'utf8');
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    let code = m[2];
    const kind = scriptKind(attrs);
    if (kind === 'external' || kind === 'data') { counted[kind] += 1; continue; }
    if (kind === 'module') {
      counted.module += 1;
      problems.push(`${rel} — 内联 type="module" 出现了（本站没有地方用它，vm.Script 也校验不了），请改成外链或确认用途`);
      continue;
    }
    if (!code.trim()) { counted.js += 1; continue; }
    counted.js += 1;
    try {
      new vm.Script(code, { filename: rel });
    } catch (e) {
      // 定位脚本内部第几行，方便直接跳到出问题的语句
      const lineInFile = html.slice(0, m.index).split('\n').length;
      const firstLine = String(code).split('\n')[0].trim().slice(0, 120);
      problems.push(
        `${rel}:${lineInFile} — 内联脚本语法错误（多半被 compress_html 压成一行后行注释吞了代码）：` +
        `${e.message}；脚本首行：${firstLine}`,
      );
    }
  }
}

console.log(
  `inline-js: 扫 ${counted.html} 个页面 · 内联可执行脚本 ${counted.js} 个 · ` +
  `数据块/外链 ${counted.data + counted.external} 个 · 内联 module ${counted.module} 个`,
);
if (problems.length) {
  for (const p of problems) console.log('  ✗ ' + p);
  process.exit(1);
}
console.log('inline-js: 全部内联脚本语法完整 ✓');
