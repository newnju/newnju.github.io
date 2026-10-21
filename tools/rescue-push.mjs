#!/usr/bin/env node
// git push 的 API 替路 —— 网络救援工具。
//
// 为什么在仓库里备着：github.com:443 会间歇性整站不可达（TCP 失败），
// 而 api.github.com 与 Pages CDN 往往仍然通。SSH（ssh.github.com:443）
// 本机没有注册密钥，走不通。这条配方用凭据库里的 token（
// `git credential fill` 只取不回显）直接调 Git Data API，逐字节复刻
// 本地 HEAD，复刻出的 SHA 与本地完全一致才允许动 ref —— 任何不一致就
// 退出，绝不推一份分岔的历史上去。
//
//   node tools/rescue-push.mjs <file1> <file2> ... <fileN>
//   文件路径相对仓库根，必须是「本次提交的全部改动」——
//   tree 是以父提交为底、只叠这些文件复刻出来的。
//
// 前置条件：要推的改动必须先本地 git commit（复刻的是提交对象，不是
// 工作区）。仓库脏着跑会直接失败并提示。推完可以用 ci:poll 盯 CI。
//
// 成功后远端 main = 本地 HEAD，Jekyll 套路的常规 push 也要一次。
import { spawnSync, execFileSync } from 'node:child_process';

const REPO_DIR = 'E:/newnju.github.io';
const FILES = process.argv.slice(2);

const mask = (s) => String(s).replace(/[a-f0-9]{20,}/g, (m) => m.slice(0, 6) + '…');

if (!FILES.length) {
  console.error('用法：node tools/rescue-push.mjs <file1> <file2> ... （相对仓库根，本次提交的全部改动）');
  process.exit(2);
}

function gitCred() {
  const r = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    cwd: REPO_DIR,
    encoding: 'utf8',
  });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('password='));
  if (!line) { throw new Error('credential fill 没拿到 token'); }
  return line.slice('password='.length).trim();
}

// 动态拿 owner/repo，别把远端写死 —— 换名换组织也不用改这里。
const originUrl = execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: REPO_DIR, encoding: 'utf8' }).trim();
const REPO = originUrl.match(/[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1];
if (!REPO) { throw new Error('解析 origin 里的 owner/repo 失败: ' + originUrl); }

const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: REPO_DIR, encoding: 'utf8' });
if (dirty.trim()) {
  console.error('工作区有未提交改动 —— 复刻的是 HEAD 提交对象，先 git commit 再跑本工具。改动文件：\n' + dirty.trim());
  process.exit(2);
}
for (const f of FILES) {
  try { execFileSync('git', ['cat-file', '-e', `HEAD:${f}`]); }
  catch { throw new Error(`HEAD 里没有 ${f} —— 路径拼错，或这个文件不属于本次提交？`); }
}

const LOCAL = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_DIR, encoding: 'utf8' }).trim();

const H = (tok) => ({
  Authorization: `Bearer ${tok}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
});
const api = async (tok, p, method = 'GET', body = null) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 30000);
  try {
    const res = await fetch(`https://api.github.com${p}`, {
      method,
      headers: H(tok),
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, json };
  } finally {
    clearTimeout(t);
  }
};

// —— 本地提交对象：tree / parent / author / committer / message ——
const rawCommit = execFileSync('git', ['cat-file', 'commit', LOCAL], {
  cwd: REPO_DIR,
  encoding: 'buffer',
}).toString('utf8');
const m = rawCommit.match(/^tree ([0-9a-f]{40})\nparent ([0-9a-f]{40})\nauthor (.+)\ncommitter (.+)\n\n([\s\S]*)$/);
if (!m) { throw new Error('解析本地提交对象失败'); }
const [, localTree, parentSha, authorLine, committerLine, message] = m;

function parseWho(line) {
  const p = line.match(/^(.*) <(.*)> (\d+) ([+-]\d{4})$/);
  if (!p) { throw new Error('解析 author/committer 失败: ' + line); }
  const [, name, email, epoch, tz] = p;
  const d = new Date(Number(epoch) * 1000);
  const sign = tz[0];
  const offH = Number(tz.slice(1, 3));
  const offM = Number(tz.slice(3, 5));
  const shifted = new Date(d.getTime() + (offH * 60 + offM) * (sign === '+' ? 60000 : -60000));
  const pad = (n) => String(n).padStart(2, '0');
  const iso = `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}${sign}${pad(offH)}:${pad(offM)}`;
  return { name, email, date: iso };
}

console.log('本地提交:', LOCAL, '\ntree', localTree.slice(0, 10), 'parent', parentSha.slice(0, 10), '\n改动文件:', FILES.join(' '));

const tok = gitCred();
console.log('token 已取出（不回显）');

// —— 远端当前 main ——
const ref = await api(tok, `/repos/${REPO}/git/ref/heads/main`);
if (ref.status !== 200) { throw new Error('读 ref 失败: ' + ref.status + ' ' + JSON.stringify(ref.json).slice(0, 300)); }
const remoteHead = ref.json.object.object ? ref.json.object.object.sha : ref.json.object.sha;
console.log('远端 main 当前:', mask(remoteHead));

if (remoteHead === LOCAL) {
  console.log('远端已经在目标提交上，无需 API 推送');
  process.exit(0);
}
if (remoteHead !== parentSha) {
  throw new Error(`远端 ${mask(remoteHead)} 不是本地提交的父 ${mask(parentSha)}，不能安全复刻，退出`);
}

// —— 建全部 blob（字节来自本地仓库对象，保证 tree 一致）——
const treeItems = [];
for (const f of FILES) {
  const bytes = execFileSync('git', ['cat-file', 'blob', `${LOCAL}:${f}`], { cwd: REPO_DIR, encoding: 'buffer' });
  const b64 = bytes.toString('base64');
  const blob = await api(tok, `/repos/${REPO}/git/blobs`, 'POST', { content: b64, encoding: 'base64' });
  if (blob.status !== 201) { throw new Error('blob 创建失败 ' + f + ': ' + blob.status); }
  treeItems.push({ path: f, mode: '100644', type: 'blob', sha: blob.json.sha });
  console.log('blob 已传:', f, bytes.length, '字节 →', blob.json.sha.slice(0, 10));
}

// —— 建树：base = 父提交的 tree，只叠本次改动的文件 ——
const parentCommit = await api(tok, `/repos/${REPO}/git/commits/${parentSha}`);
if (parentCommit.status !== 200) { throw new Error('读父提交失败: ' + parentCommit.status); }
const tree = await api(tok, `/repos/${REPO}/git/trees`, 'POST', {
  base_tree: parentCommit.json.tree.sha,
  tree: treeItems,
});
if (tree.status !== 201) { throw new Error('tree 创建失败: ' + tree.status + ' ' + JSON.stringify(tree.json).slice(0, 300)); }
console.log('tree 复刻:', tree.json.sha.slice(0, 10), '目标', localTree.slice(0, 10));
if (tree.json.sha !== localTree) { throw new Error('tree SHA 与本地不一致，中止（FILES 集合与本次提交的改动对不上）'); }

// —— 建提交（author/committer/message 逐字对齐本地对象；GitHub 不往这些
//   字节里塞额外东西，对象 SHA 只由 tree/parent/author/committer/message 决定）——
const commit = await api(tok, `/repos/${REPO}/git/commits`, 'POST', {
  message,
  tree: localTree,
  parents: [parentSha],
  author: parseWho(authorLine),
  committer: parseWho(committerLine),
});
if (commit.status !== 201) { throw new Error('commit 创建失败: ' + commit.status + ' ' + JSON.stringify(commit.json).slice(0, 300)); }
console.log('commit 复刻:', commit.json.sha.slice(0, 10), '目标', LOCAL.slice(0, 10));
if (commit.json.sha !== LOCAL) { throw new Error('提交 SHA 与本地不一致，中止（不推 ref）'); }

// —— 快进 main ——
const upd = await api(tok, `/repos/${REPO}/git/refs/heads/main`, 'PATCH', { sha: LOCAL, force: false });
if (upd.status === 200) {
  console.log('✓ main 已快进到', mask(LOCAL), '（走 api.github.com，没碰 github.com:443）');
} else if (upd.status === 422) {
  console.log('ref 已是目标值，视为成功');
} else {
  throw new Error('ref 更新失败: ' + upd.status + ' ' + JSON.stringify(upd.json).slice(0, 300));
}
