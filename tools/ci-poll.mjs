#!/usr/bin/env node
// CI 轮询 —— 推送之后盯着 Pages 工作流各 run 的状态，全站出结果就报结论。
//
// 用法：node tools/ci-poll.mjs [SHA]          SHA 缺省用本地 HEAD
//
// github.com:443 抽风但 api.github.com 可达时它照常工作（它只连 API）。
// 配套 tools/rescue-push.mjs：推送完跑这个盯到全绿，别干等。
import { spawnSync } from 'node:child_process';

const REPO_DIR = 'E:/newnju.github.io';
const argSha = process.argv[2];
const SHA = argSha
  ? argSha
  : spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_DIR, encoding: 'utf8' }).stdout.trim();
const REPO = (() => {
  const url = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: REPO_DIR, encoding: 'utf8' }).stdout.trim();
  return url.match(/[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?$/)?.[1] || '';
})();
if (!REPO) { throw new Error('解析 origin 里的 owner/repo 失败'); }

const tok = (() => {
  const r = spawnSync('git', ['credential', 'fill'], {
    input: 'protocol=https\nhost=github.com\n\n',
    cwd: REPO_DIR,
    encoding: 'utf8',
  });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('password='));
  return line ? line.slice('password='.length).trim() : null;
})();

const get = async (p) => {
  const res = await fetch(`https://api.github.com${p}`, {
    headers: tok
      ? { Authorization: `Bearer ${tok}`, Accept: 'application/vnd.github+json' }
      : { Accept: 'application/vnd.github+json' },
  });
  return res.json();
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('轮询', REPO, '@', SHA.slice(0, 10));
for (let i = 0; i < 60; i++) {
  const data = await get(`/repos/${REPO}/actions/runs?head_sha=${SHA}&per_page=20`);
  const runs = data.workflow_runs || [];
  if (!runs.length) {
    console.log(`[${new Date().toLocaleTimeString()}] 还没有 run，25 秒后再看`);
    await sleep(25000);
    continue;
  }
  const done = runs.every((r) => r.status === 'completed');
  const line = runs.map((r) => `${r.name}:${r.status}${r.conclusion ? '/' + r.conclusion : ''}`).join('  ');
  console.log(`[${new Date().toLocaleTimeString()}] ${line}`);
  if (done) {
    console.log('\n—— 各 run 的 job 明细 ——');
    let allOk = true;
    for (const r of runs) {
      const jd = await get(r.jobs_url.replace('https://api.github.com', ''));
      for (const j of jd.jobs || []) {
        if (j.conclusion !== 'success') { allOk = false; }
        console.log(`${r.name} / ${j.name}: ${j.conclusion}`);
      }
    }
    console.log(allOk ? '\nCI-ALL-SUCCESS' : '\nCI-HAS-FAILURE');
    process.exit(allOk ? 0 : 1);
  }
  await sleep(25000);
}
console.log('轮询超时，仍有未完成的 run');
process.exit(1);
