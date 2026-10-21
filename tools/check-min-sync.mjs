#!/usr/bin/env node
// js 压缩产物与源码同步检查 —— 「改了 .js 忘跑 npm run build:js」的守门。
//
// 为什么要有这个：页面引用的都是 uglify 产物（main.min.js / han.min.js /
// vivus.min.js / n404.min.js），min 文件是手工跑 build:js 提交的。谁改了
// 源码忘了重压，线上跑的还是旧逻辑 —— CI 全绿、没有任何东西提示。
// 这道关在 CI 构建机上把每条 uglify 命令原样重跑一遍，输出与提交在仓库里
// 的 min 文件做**逐字节**比对：不一致就失败。uglify-js 的版本由
// package-lock.json 钉死，重跑结果确定，不会误报。
//
//   node tools/check-min-sync.mjs
//
// 新增压缩目标时：package.json 的 uglify:* 与本文件的 TARGETS 各加一行，
// 两处口径必须一致（源文件清单、参数、输出路径）。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SITE_ROOT } from './lib/content.mjs';

const UGLIFY_CLI = path.join(SITE_ROOT, 'node_modules', 'uglify-js', 'bin', 'uglifyjs');
const TARGETS = [
  {
    name: 'main', out: 'assets/js/main.min.js', args: ['-c', '-m'],
    files: ['assets/js/plugins/jquery.greedy-navigation.js', 'assets/js/_main.js', 'assets/js/theme.js'],
  },
  { name: 'vivus', out: 'assets/js/vivus.min.js', args: ['-c', '-m', '--comments'], files: ['assets/js/vivus.js'] },
  { name: 'han', out: 'assets/js/han.min.js', args: ['-c', '-m'], files: ['assets/js/han.js'] },
  { name: 'n404', out: 'assets/js/n404.min.js', args: ['-c', '-m'], files: ['assets/js/n404.js'] },
];

if (!fs.existsSync(UGLIFY_CLI)) {
  console.log('min-sync: 没装 node_modules，跳过（先 npm ci）');
  process.exit(0);
}

const problems = [];
for (const t of TARGETS) {
  const committed = path.join(SITE_ROOT, t.out);
  if (!fs.existsSync(committed)) {
    problems.push(`${t.out} 不存在 —— 跑 npm run build:js 再提交`);
    continue;
  }
  const tmp = path.join(os.tmpdir(), `min-sync-${t.name}.js`);
  let err = null;
  try {
    /* 参数顺序照 package.json 的 uglify:* 抄：输入文件在前，选项在后 ——
       反过来会把文件名当成 -c/-m 的选项值吃掉。 */
    execFileSync(process.execPath, [UGLIFY_CLI, ...t.files, ...t.args, '-o', tmp], { cwd: SITE_ROOT, stdio: 'pipe' });
  } catch (e) {
    err = `${t.out} —— uglify 重跑失败：${String(e.stderr || e).slice(0, 300)}`;
  }
  if (err) {
    problems.push(err);
  } else if (!fs.readFileSync(tmp).equals(fs.readFileSync(committed))) {
    problems.push(`${t.out} 与源码不同步 —— 改了 ${t.files.join(' ')} 没重新压缩；跑 npm run build:js 再提交`);
  }
  try { fs.rmSync(tmp, { force: true }); } catch { /* 删不掉就算了，在系统临时目录 */ }
}

if (problems.length) {
  for (const p of problems) console.log('  ✗ ' + p);
  process.exit(1);
}
console.log(`min-sync: ${TARGETS.length} 个压缩产物全部与源码一致 ✓`);
