// 「分享到」按语言给不同目标的回归测试。
//
//   node --test tests/social-share.test.mjs
//
// 为什么值得测：这一块的行为**只存在于渲染结果里** —— 中文页多两个按钮、英文页
// 保持五个，而两边的按钮集合不同这件事，源码里看不出来（是 {% if %} 分支），
// 页面上也不显眼（按钮就那么几个）。改错了不会有任何构建报错，截图也未必发现：
// 少一个按钮在 390px 视口下只是图标少一枚。所以直接渲染 include 断言集合。
//
// 全程离线：用仓库自带的 liquidjs 现场渲染 _includes/social-share.html，
// 数据来自 tools/lib/jekyll-context.mjs（与其它测试同一套上下文）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Liquid } from 'liquidjs';
import { SITE_ROOT, loadData } from '../tools/lib/content.mjs';
import { buildContext, liquidFilters } from '../tools/lib/jekyll-context.mjs';

const SOURCE = fs.readFileSync(path.join(SITE_ROOT, '_includes', 'social-share.html'), 'utf8');
const PAGE_URL = '/publication/2025-four-gods-mirror';

function engine() {
  const e = new Liquid({
    jekyllInclude: true,
    relativeFilesystem: true,
    root: [path.join(SITE_ROOT, '_includes')],
    strictVariables: false,
  });
  for (const [k, fn] of Object.entries(liquidFilters)) e.registerFilter(k, fn);
  return e;
}

async function render(locale) {
  const ctx = buildContext(locale === 'en' ? 'en' : 'zh');
  ctx.page.url = PAGE_URL;
  ctx.page.title = '四神博局镜与汉代宇宙观';
  ctx.page.excerpt = '以中国国家博物馆藏新莽四神博局镜为例，讨论镜背纹饰的分区方式。';
  return engine().parseAndRender(SOURCE, ctx);
}

/** 从渲染结果里取出按钮：{ 变体名, 标签文本, 是不是 <button> } */
function buttons(html) {
  return [...html.matchAll(/<(a|button)\b[^>]*class="btn btn--([a-z-]+)"[^>]*>([\s\S]*?)<\/\1>/g)].map(
    (m) => ({
      tag: m[1],
      name: m[2],
      label: m[3].replace(/<[^>]+>/g, '').trim(),
      open: m[0],
    }),
  );
}

test('中文页：微信 · QQ · X，三个，按这个顺序', async () => {
  const bs = buttons(await render('zh'));
  assert.deepEqual(bs.map((b) => b.name), ['wechat', 'qq', 'x']);
  assert.deepEqual(bs.map((b) => b.label), ['微信', 'QQ', 'X (formerly Twitter)']);
});

test('中文页：英文那套（Bluesky / Facebook / LinkedIn / Mastodon）一个都不出现', async () => {
  const names = buttons(await render('zh')).map((b) => b.name);
  for (const gone of ['bluesky', 'facebook', 'linkedin', 'mastodon']) {
    assert.ok(!names.includes(gone), `${gone} 不该出现在中文页`);
  }
});

test('英文页：维持原来五个的原顺序，没有微信 / QQ', async () => {
  const bs = buttons(await render('en'));
  // 顺序也是「原样」的一部分：X 一直排在最后，别为了和中文对齐把它提到最前面
  assert.deepEqual(bs.map((b) => b.name), ['bluesky', 'facebook', 'linkedin', 'mastodon', 'x']);
  assert.ok(!bs.some((b) => b.name === 'wechat' || b.name === 'qq'));
});

test('分享出去的必须是绝对地址（base_path 给的是 site.url，不是空串）', async () => {
  for (const locale of ['zh', 'en']) {
    const html = await render(locale);
    const hrefs = [...html.matchAll(/href="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
    assert.ok(hrefs.length > 0, `${locale} 应该有分享链接`);
    for (const href of hrefs) {
      const shareTargets = ['x.com', 'bsky.app', 'facebook.com', 'linkedin.com', 'connect.qq.com', 'addtoany.com'];
      if (!shareTargets.some((h) => href.includes(h))) continue;
      // 被分享的页面地址必须完整出现在参数里，而不是 /publication/... 这种相对路径
      assert.ok(
        href.includes(encodeURIComponent('https://newnju.github.io')) ||
          href.includes('https%3A%2F%2Fnewnju.github.io') ||
          href.includes('https://newnju.github.io'),
        `${locale} 的分享链接里没有绝对地址：${href.slice(0, 120)}`,
      );
    }
  }
});

test('微信是 button 而不是链接：背后没有 URL，只能弹二维码', async () => {
  const bs = buttons(await render('zh'));
  const wechat = bs.find((b) => b.name === 'wechat');
  assert.equal(wechat.tag, 'button');
  assert.match(wechat.open, /type="button"/);
  assert.match(wechat.open, /aria-haspopup="dialog"/);
  assert.match(wechat.open, /hidden/, '脚本没跑时按钮必须保持隐藏（点了没反应比不显示更糟）');
  assert.match(wechat.open, /fa-weixin/, '要用品牌图标，别用文字方块');
});

test('QQ 走官方分享组件，新标签打开且带 noopener', async () => {
  const qq = buttons(await render('zh')).find((b) => b.name === 'qq');
  assert.equal(qq.tag, 'a');
  assert.match(qq.open, /connect\.qq\.com\/widget\/shareqq/);
  assert.match(qq.open, /target="_blank"/);
  assert.match(qq.open, /rel="noopener noreferrer"/);
  assert.match(qq.open, /fa-qq/);
});

test('弹层的文案从 _data/ui-text.yml 来（这些键只服务于中文页）', async () => {
  const ui = loadData().uiText;
  // 标题两种语言都要有
  for (const locale of ['zh-CN', 'en']) {
    assert.ok(ui[locale]?.share_on_label, `${locale} 缺 ui-text 键 share_on_label`);
  }
  // 微信弹层只在中文页出现，键只登记中文 —— 不给 en 塞一份永远用不到的文案
  for (const key of [
    'share_wechat',
    'share_qq',
    'share_dialog_label',
    'share_scan_hint',
    'share_copy_link',
    'share_copied_link',
    'share_close',
  ]) {
    assert.ok(ui['zh-CN']?.[key], `zh-CN 缺 ui-text 键 ${key}`);
  }
  assert.equal(ui['zh-CN'].share_scan_hint, '用微信扫一扫');
  assert.equal(ui['en'].share_wechat, undefined, 'en 不该有只给中文页用的键');
});

test('弹层的 data-label-* 与 ui-text 一致（脚本从根节点读文案）', async () => {
  const ui = loadData().uiText['zh-CN'];
  const html = await render('zh');
  // 键名 → 属性名不是机械去前缀（share_scan_hint → data-label-scan）
  const pairs = [
    ['share_scan_hint', 'data-label-scan'],
    ['share_dialog_label', 'data-label-dialog'],
    ['share_copy_link', 'data-label-copy'],
    ['share_copied_link', 'data-label-copied'],
    ['share_close', 'data-label-close'],
  ];
  for (const [key, attr] of pairs) {
    assert.ok(
      html.includes(`${attr}="${ui[key]}"`),
      `${attr} 应该是「${ui[key]}」，实际：${html.match(new RegExp(`${attr}="[^"]*"`))?.[0]}`,
    );
  }
});

test('标签本身是平衡的（div 挪来挪去最容易漏闭合）', async () => {
  const html = await render('zh');
  const open = (html.match(/<section\b/g) || []).length;
  const close = (html.match(/<\/section>/g) || []).length;
  assert.equal(open, close);
  assert.equal(open, 1);
});
