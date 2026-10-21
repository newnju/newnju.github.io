// ESLint 扁平配置 —— 本站 JS 的静态分析守门。
//
// 分域 lint：node 侧（tools/ + tests/）与浏览器侧（assets/js 源码）两套全局，
// Cloudflare Workers（analytics / oauth-proxy）用 serviceworker 全局近似的
// 运行时（fetch/Response/caches 等 ES 内建 + addEventListener；D1/KV 绑定是
// env 参数不是全局，无感）。vendor 的东西（.jquery 系列、qrcode.min、
// 各种 .min.js、上游参考模板）一律不进分析 —— 它们的质量归上游。
//
// 规则基调：@eslint/js 的 recommended 起步，只加与「运行才炸」相关的硬规则，
// 不做风格战争（var/注释/引号是本站有意的风格，管人不如管事）。no-unused-vars
// 放 args（回调参数常常按签名冗余），下划线开头可豁免。
import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      '_site/**',
      'site/**',
      // 产物与 vendor：本来就不是人写的
      'assets/js/*.min.js',
      'assets/js/qrcode.min.js',
      'assets/js/plugins/**',
      'assets/js/vivus.js', // 上游 vendored（UMD 守卫那套本来就是它的接口）
      // 迁移参考物料（Liquid 原模板）与生成文档快照
      'tools/reference-liquid/**',
      // 根级 sw.js 带 Jekyll front matter，文件本体不是合法 JS（Jekyll 剥完才
      // 是）；它的语法在 check-pwa 里由真浏览器注册行为背书
      'sw.js',
      // 前端构建器不可 lint 的数据/资源
      'images/**',
      'schemas/**',
      'docs/**',
      // 字体子集脚本的产物目录
      'assets/webfonts/**',
    ],
  },

  // Node 侧：工具与其测试（.mjs 一律 ESM）。
  // tools/ 里大量 page.evaluate() 内嵌浏览器代码 —— 这是 Playwright 工具的
  // 正常形态，全局里带上 browser 集，no-undef 才不误伤；tests/ 是纯 node，
  // 保持窄全局，拼错 window/document 这种反而能被抓住。
  {
    files: ['tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
      'prefer-const': 'error',
    },
  },
  {
    files: ['tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      'no-async-promise-executor': 'warn',
    },
  },

  // 浏览器侧：站点源码脚本（.min.js 与 vendor 已在上面 ignore）
  {
    files: ['assets/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // 空 catch 是站点脚本里成片的「可选功能探测」形态，留白是本意
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // theme.js 是 ESM 源（plotly 布局导出），按 module 源码查
  {
    files: ['assets/js/theme.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // _main.js 与 theme.js 同进 main.min.js 一个 module 作用域（uglify 拼接），
  // Plotly 是 talk 页外链脚本的全局对象 —— lint 视角当作邻接全局声明
  {
    files: ['assets/js/_main.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
        Plotly: 'readonly',
        plotlyDarkLayout: 'readonly',
        plotlyLightLayout: 'readonly',
      },
    },
  },

  // Cloudflare Workers（module 形态）：fetch/scheduled 都走 export
  {
    files: ['analytics/worker.js', 'oauth-proxy/worker.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.serviceworker, ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
    },
  },

  // 根级 sw.js：Jekyll 模板产物，classic script，跑在浏览器 SW 运行时里
  {
    files: ['sw.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: { ...globals.serviceworker, ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { args: 'none', varsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];
