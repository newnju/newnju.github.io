// 内容加载器：validate / render / test 三方共用的唯一读取入口。
// 所有 front matter 与 _data/*.yml 都从这里进程序，读法不一致就等于有两套真值。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { load as parseYaml } from 'js-yaml';

export const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const COLLECTION_DIRS = {
  publications: '_publications',
  portfolio: '_portfolio',
  talks: '_talks',
  teaching: '_teaching',
};

export const PERIODS = ['phd', 'gap', 'master', 'bachelor'];

/** YAML 把不加引号的 2026-09-30 解析成 Date；统一拍回字符串，免得 schema 分叉。 */
function normalise(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map(normalise);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, normalise(v)]));
  }
  return value;
}

/**
 * 解析 YAML 的 `<<: *anchor` 合并键。
 * Ruby 的 Psych 会自动展开，js-yaml 4+ 不会 —— 不自己展开的话，
 * ui-text.yml 里 zh-CN / zh-HK 这类「只写差异项」的语言会整个读成空，
 * 生成出来的文案就和线上不一致了。合并方向遵循 YAML 语义：
 * 被合并进来的键只补缺，不覆盖本键已有的值。
 */
function applyMergeKeys(value) {
  if (Array.isArray(value)) return value.map(applyMergeKeys);
  if (!value || typeof value !== 'object') return value;

  const source = Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => k !== '<<')
      .map(([k, v]) => [k, applyMergeKeys(v)])
  );
  const merge = value['<<'];
  const incoming = merge == null ? [] : Array.isArray(merge) ? merge : [merge];
  for (const extra of incoming) {
    if (!extra || typeof extra !== 'object') continue;
    for (const [k, v] of Object.entries(applyMergeKeys(extra))) {
      if (!(k in source)) source[k] = v;
    }
  }
  return source;
}

export function readText(relativePath) {
  return fs.readFileSync(path.join(SITE_ROOT, relativePath), 'utf8');
}

export function loadYaml(relativePath) {
  return applyMergeKeys(normalise(parseYaml(readText(relativePath))));
}

/** 返回 { data, body, file }；解析失败直接抛，由调用方转成校验错误。 */
export function loadFrontMatter(relativePath) {
  const parsed = matter(readText(relativePath));
  return { file: relativePath, data: applyMergeKeys(normalise(parsed.data)), body: parsed.content };
}

function listFiles(relativeDir, filter = () => true) {
  const absolute = path.join(SITE_ROOT, relativeDir);
  if (!fs.existsSync(absolute)) return [];
  return fs
    .readdirSync(absolute)
    .filter(filter)
    .sort()
    .map((name) => path.posix.join(relativeDir, name));
}

/** 递归列出目录下所有命中 filter 的文件（相对路径，posix 分隔）。 */
function listFilesDeep(relativeDir, filter = () => true) {
  const absolute = path.join(SITE_ROOT, relativeDir);
  if (!fs.existsSync(absolute)) return [];
  const out = [];
  const walk = (rel) => {
    for (const name of fs.readdirSync(path.join(SITE_ROOT, rel)).sort()) {
      const child = path.posix.join(rel, name);
      if (fs.statSync(path.join(SITE_ROOT, child)).isDirectory()) walk(child);
      else if (filter(name)) out.push(child);
    }
  };
  walk(relativeDir);
  return out;
}

const isMarkdown = (name) => /\.(md|html)$/.test(name);

export function loadCollections() {
  return Object.fromEntries(
    Object.entries(COLLECTION_DIRS).map(([name, dir]) => [
      name,
      listFiles(dir, isMarkdown).map(loadFrontMatter),
    ])
  );
}

export function loadPages() {
  return {
    zh: listFiles('_pages', isMarkdown).map(loadFrontMatter),
    en: listFiles('_pages/en', isMarkdown).map(loadFrontMatter),
    // _pages/en/<集合>/<slug>.md：tools/render-en.mjs 生成的英文条目页。
    // 手写的页面都在 _pages/en 顶层（深度 3），所以「深度 > 3」就是生成页 ——
    // validate 对它们做 schema / permalink / layout 校验，但**不做**「中英同名
    // 页面配对」（它们是条目的镜像，不是 _pages 手写页的译本）。
    entries: listFilesDeep('_pages/en', isMarkdown)
      .filter((rel) => rel.split('/').length > 3)
      .map(loadFrontMatter),
  };
}

export function loadData() {
  return {
    profile: loadYaml('_data/profile.yml'),
    awards: loadYaml('_data/awards.yml'),
    navigation: loadYaml('_data/navigation.yml'),
    uiText: loadYaml('_data/ui-text.yml'),
  };
}

/** 「这条缺英文」是告警不是错误：页面会回落中文，不会构建失败。 */
export function missingEnglish(data, pairs) {
  return pairs.filter(([zhKey, enKey]) => data[zhKey] && !data[enKey]).map(([, enKey]) => enKey);
}
