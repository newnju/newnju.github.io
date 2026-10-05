// L4 漂移测试：admin/config.yml 的字段必须和 schemas/*.schema.json 对得上。
//
// 两边只要有一边改了忘了另一边，后台就会写出校验不过的文件 —— 那时才发现在
// CI 里红，已经晚了。这里在保存之前就把差异顶出来。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { load as parseYaml } from 'js-yaml';
import { SITE_ROOT } from '../tools/lib/content.mjs';

const config = parseYaml(fs.readFileSync(path.join(SITE_ROOT, 'admin', 'config.yml'), 'utf8'));

const loadSchema = (name) =>
  JSON.parse(fs.readFileSync(path.join(SITE_ROOT, 'schemas', `${name}.schema.json`), 'utf8'));

const collection = (name) => {
  const found = config.collections?.find((c) => c.name === name);
  assert.ok(found, `config.yml 里没有 ${name} 集合`);
  return found;
};

const fieldNames = (fields) => fields.map((f) => f.name);
const declared = (fields) => fieldNames(fields).filter((n) => n !== 'body');
const fieldOf = (fields, name) => fields.find((f) => f.name === name);

function assertSameSet(actual, expected, where) {
  const missing = expected.filter((k) => !actual.includes(k));
  const extra = actual.filter((k) => !expected.includes(k));
  assert.deepEqual(
    { missing, extra },
    { missing: [], extra: [] },
    `${where}：CMS 漏了 ${missing.join(', ') || '-'}、多了 ${extra.join(', ') || '-'}`,
  );
}

function assertBodyIsRaw(fields, where) {
  const body = fieldOf(fields, 'body');
  if (!body) return;
  assert.equal(body.widget, 'richtext', `${where}: body 应该用 richtext`);
  assert.deepEqual(body.modes, ['raw'], `${where}: body 必须锁在 raw 模式，否则 Liquid 会被改写`);
}

// ------------------------------------------------------------------ 后台入口
test('backend 指向本仓库的 main 分支，并留了 OAuth 代理的位置', () => {
  assert.equal(config.backend.name, 'github');
  assert.equal(config.backend.repo, 'newnju/newnju.github.io');
  assert.equal(config.backend.branch, 'main');
  assert.ok(config.backend.base_url, 'backend.base_url 缺失，登录弹窗无处可去');
  assert.ok(config.backend.auth_endpoint, 'backend.auth_endpoint 缺失');
  assert.match(config.backend.base_url, /^https:\/\//, 'base_url 必须是 https');
});

test('站点地址与媒体目录齐全', () => {
  assert.equal(config.site_url, 'https://newnju.github.io');
  assert.ok(config.media_folder, 'media_folder 必填');
  assert.ok(config.public_folder?.startsWith('/'), 'public_folder 必须以 / 开头');
  assert.ok(fs.existsSync(path.join(SITE_ROOT, 'assets')), 'media_folder 的父目录 assets/ 不存在');
});

// ------------------------------------------------------------------ 四个内容集合
const FOLDER_COLLECTIONS = {
  publications: 'publication',
  portfolio: 'portfolio',
  talks: 'talk',
  teaching: 'teaching',
};

for (const [colName, schemaName] of Object.entries(FOLDER_COLLECTIONS)) {
  test(`${colName} 的字段与 ${schemaName}.schema.json 完全一致`, () => {
    const col = collection(colName);
    const props = loadSchema(schemaName).properties;

    assert.equal(col.folder, `_${colName}`);
    assert.equal(col.create, true, '要能新增条目');
    assert.equal(col.format, 'frontmatter');

    assertSameSet(declared(col.fields), Object.keys(props), `${colName} 字段`);
    assertBodyIsRaw(col.fields, colName);

    // collection 是 const 字段，必须用 hidden + default 钉死
    const hidden = fieldOf(col.fields, 'collection');
    assert.equal(hidden.widget, 'hidden', `${colName}: collection 必须是 hidden`);
    assert.equal(hidden.default, colName, `${colName}: collection 默认值写错了`);

    // 枚举字段要和 schema 的 enum 一致，否则后台能选出校验不认的值
    for (const [key, prop] of Object.entries(props)) {
      if (!prop.enum) continue;
      const f = fieldOf(col.fields, key);
      if (!f) continue;
      const options = (f.options ?? []).map((o) => (typeof o === 'string' ? o : o.value));
      assert.deepEqual([...options].sort(), [...prop.enum].sort(), `${colName}.${key} 选项与 schema 不一致`);
    }

    // 会重复出现在每条里的 pattern 必须和 schema 一致
    if (props.permalink?.pattern) {
      const f = fieldOf(col.fields, 'permalink');
      assert.equal(f.pattern[0], props.permalink.pattern, `${colName}.permalink 正则与 schema 不一致`);
    }
  });
}

// ------------------------------------------------------------------ 数据文件
test('profile 的字段与 profile.schema.json 一致', () => {
  const col = collection('profile');
  assert.equal(col.files[0].file, '_data/profile.yml');
  const schema = loadSchema('profile');
  const fields = col.files[0].fields;

  assertSameSet(declared(fields), Object.keys(schema.properties), 'profile 顶层');

  const contact = fieldOf(fields, 'contact');
  assertSameSet(fieldNames(contact.fields), Object.keys(schema.properties.contact.properties), 'profile.contact');

  const entryFields = schema.definitions.entry.properties;
  for (const name of ['education', 'work']) {
    const list = fieldOf(fields, name);
    assert.equal(list.widget, 'list');
    assertSameSet(fieldNames(list.fields), Object.keys(entryFields), `profile.${name}`);

    const period = fieldOf(list.fields, 'period');
    const options = period.options.map((o) => (typeof o === 'string' ? o : o.value));
    assert.deepEqual([...options].sort(), [...schema.definitions.period.enum].sort(), `profile.${name}.period`);
  }
});

test('awards 的字段与 awards.schema.json 一致', () => {
  const col = collection('awards');
  assert.equal(col.files[0].file, '_data/awards.yml');
  const schema = loadSchema('awards');
  const fields = col.files[0].fields;

  assertSameSet(declared(fields), Object.keys(schema.properties), 'awards 顶层');

  const groups = fieldOf(fields, 'groups');
  assertSameSet(fieldNames(groups.fields), Object.keys(schema.definitions.group.properties), 'awards.groups');

  const items = fieldOf(groups.fields, 'items');
  assertSameSet(fieldNames(items.fields), Object.keys(schema.definitions.item.properties), 'awards.groups[].items');

  for (const [key, def] of [
    ['level', schema.definitions.level],
    ['period', schema.definitions.period],
  ]) {
    const f = fieldOf(items.fields, key);
    const options = f.options.map((o) => (typeof o === 'string' ? o : o.value));
    assert.deepEqual([...options].sort(), [...def.enum].sort(), `awards.groups[].items.${key}`);
  }

  const keyField = fieldOf(groups.fields, 'key');
  const keyOptions = keyField.options.map((o) => (typeof o === 'string' ? o : o.value));
  assert.deepEqual([...keyOptions].sort(), [...schema.definitions.group.properties.key.enum].sort(), 'awards.groups[].key');
});

test('navigation 的字段与 navigation.schema.json 一致', () => {
  const col = collection('navigation');
  assert.equal(col.files[0].file, '_data/navigation.yml');
  const schema = loadSchema('navigation');
  const fields = col.files[0].fields;

  assertSameSet(declared(fields), Object.keys(schema.properties), 'navigation 顶层');

  const main = fieldOf(fields, 'main');
  const itemProps = schema.properties.main.items.properties;
  assertSameSet(fieldNames(main.fields), Object.keys(itemProps), 'navigation.main');

  const url = fieldOf(main.fields, 'url');
  assert.equal(url.pattern[0], schema.properties.main.items.properties.url.pattern, 'navigation url 正则不一致');
});

// ------------------------------------------------------------------ 页面集合
test('页面集合覆盖了 _pages 下所有 .md 用到的 front matter 键', () => {
  const schema = loadSchema('page');
  const allowed = Object.keys(schema.properties);

  const pageFiles = (dir) =>
    fs
      .readdirSync(path.join(SITE_ROOT, dir))
      .filter((f) => f.endsWith('.md'))
      .map((f) => path.posix.join(dir, f));

  for (const [colName, dir] of [
    ['pages_zh', '_pages'],
    ['pages_en', '_pages/en'],
  ]) {
    const col = collection(colName);
    const fields = col.files[0].fields;
    assertBodyIsRaw(fields, colName);

    // CMS 声明的键必须是 schema 认识的键
    assertSameSet(declared(fields), declared(fields).filter((k) => allowed.includes(k)), `${colName} 键合法性`);

    // 文件里真实用到的键，CMS 必须都声明了 —— 否则 Decap 保存时会把它删掉
    const used = new Set();
    for (const rel of pageFiles(dir)) {
      const raw = fs.readFileSync(path.join(SITE_ROOT, rel), 'utf8');
      const data = parseYaml(raw.split(/^---[ \t]*$/m)[1] ?? '') ?? {};
      for (const k of Object.keys(data)) used.add(k);
    }
    const missing = [...used].filter((k) => k !== 'body' && !declared(fields).includes(k));
    assert.deepEqual(missing, [], `${colName}: 这些键没声明，Decap 一保存就没了：${missing.join(', ')}`);

    // files 集合必须列出目录下每个 .md，漏了就等于那个页面在后台不可见且易被忽略
    const configured = new Set(col.files.map((f) => f.file));
    for (const rel of pageFiles(dir)) {
      assert.ok(configured.has(rel), `${colName}: ${rel} 没有配到后台里`);
    }
  }
});

test('每个字段都有 label 和 widget', () => {
  const walk = (fields, where) => {
    for (const f of fields) {
      assert.ok(f.label, `${where}.${f.name} 缺 label`);
      assert.ok(f.widget, `${where}.${f.name} 缺 widget`);
      if (f.widget === 'object') walk(f.fields, `${where}.${f.name}`);
      if (f.widget === 'list' && f.fields) walk(f.fields, `${where}.${f.name}`);
      if (f.widget === 'list' && f.field) walk([f.field], `${where}.${f.name}`);
    }
  };
  for (const col of config.collections) {
    if (col.folder) walk(col.fields, col.name);
    else for (const f of col.files) walk(f.fields, `${col.name}/${f.name}`);
  }
});

// ------------------------------------------------------------------ 入口页
test('admin/index.html 能被 Jekyll 原样拷过去', () => {
  const html = fs.readFileSync(path.join(SITE_ROOT, 'admin', 'index.html'), 'utf8');
  assert.ok(!html.startsWith('---'), '不能有 front matter，否则 Jekyll 会去处理它');
  assert.match(html, /decap-cms\.js/, '没有加载 decap-cms');
  assert.match(html, /<script src="https:\/\/unpkg\.com\//, '应该从 CDN 加载，别把 3MB 打进仓库');
});
