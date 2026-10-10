/* ==========================================================================
   Various functions that we want to use within the template

   本站已去掉 jQuery，本文件改写成原生 DOM。行为与原 jQuery 版逐条对齐，
   由 tools/check-dom-behavior.mjs 断言（主题切换、图标类、localStorage、
   联系方式折叠、窗口变宽复原）。
   ========================================================================== */

/*jslint es6 */
'use strict';

// Constants for CDNs
const PLOTLY_URL = "https://cdn.jsdelivr.net/npm/plotly.js@3.6.0/dist/plotly.min.js";
const MERMAID_URL = "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";

// Detect OS/browser preference
const browserPref = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

// localStorage 在少数环境会直接抛（老 Safari 隐私模式、禁站内数据的浏览器、
// 被 sandbox 的 iframe）—— 不包一层的话 determineComputedTheme / setTheme /
// toggleTheme 任何一处抛掉，主题切换整组按钮就死了。读失败当「没存过」，
// 写失败静默忽略：配色退回跟随系统，比整个脚本崩掉强。
function themeStorageGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function themeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* 存不下就下次再问 */ }
}

// Determine the computed theme, which can be "dark" or "light".
function determineComputedTheme() {
  // Determine the expected state of the theme toggle, which can be "dark", "light", or default "system"
  let themeSetting = themeStorageGet("theme");
  themeSetting = (themeSetting != "dark" && themeSetting != "light" && themeSetting != "system") ? "system" : themeSetting;

  // Return the setting if set, or use the browser preference
  if (themeSetting != "system") {
    return themeSetting;
  }
  return browserPref ? "dark" : "light";
}

// 同步 <meta name="theme-color">（浏览器地址栏配色）。
// 这个 meta 不认 CSS 变量，写死 var(--global-bg-color) 无效，因此改成每次
// 切主题时取 body 的实际背景色回填，暗色下自动跟着变成深色。
//
// 注意：本站的背景画在更内层的元素上，body 算出来是 transparent，所以下面
// 这个判断会让它直接返回 —— 也就是说地址栏配色实际由 head/custom.html 里
// 那两条 media=prefers-color-scheme 决定，手动切主题时不跟着变。这是既有
// 行为，不是回归；真要跟上得改 CSS 让 body 自己有背景色。
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  const bg = window.getComputedStyle(document.body).backgroundColor;
  if (bg && bg !== "transparent") {
    meta.setAttribute("content", bg);
  }
}

// 主题图标是两个 Font Awesome 类在换：亮色 fa-sun（点一下变暗），暗色 fa-moon。
function swapThemeIcon(isDark) {
  const icon = document.querySelector('#theme-icon');
  if (!icon) return;
  icon.classList.toggle('fa-moon', isDark);
  icon.classList.toggle('fa-sun', !isDark);
}

// Set the theme on page load or when explicitly called
function setTheme(theme) {
  const use_theme = theme ||
    themeStorageGet("theme") ||
    document.documentElement.getAttribute("data-theme") ||
    browserPref;

  const isDark = use_theme === "dark";
  if (use_theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else if (use_theme === "light") {
    document.documentElement.removeAttribute("data-theme");
  }
  swapThemeIcon(isDark);
  syncThemeColor();
}

// Toggle the theme manually
function toggleTheme() {
  const current_theme = document.documentElement.getAttribute("data-theme");
  const new_theme = current_theme === "dark" ? "light" : "dark";
  themeStorageSet("theme", new_theme);
  setTheme(new_theme);
  redrawPlotly();
}

// Defer the loading of Mermaid to only if there is a field on the page to be rendered
let mermaidElements = document.querySelectorAll("pre>code.language-mermaid");
if (mermaidElements.length > 0) {
  whenComplete(function () {
    // Append the Mermaid module to the DOM
    const moduleScript = document.createElement('script');
    moduleScript.type = 'module';
    moduleScript.textContent = `
      import mermaid from '${MERMAID_URL}';
      mermaid.initialize({startOnLoad:true, theme:'default'});
      await mermaid.run({querySelector:'code.language-mermaid'});
    `;
    document.body.appendChild(moduleScript);
  });
}

// 原来两个加载器只挂 readystatechange 监听：模块脚本通常在 readyState
// "interactive" 时执行，下一次事件就是 "complete"，所以平时没事 —— 但脚本
// 若因任何原因在 "complete" 之后才跑（注入、恢复式加载），那个事件已经
// 过去了，监听器永远不会触发，图就永远不渲染。这里补一条「已经 complete
// 就立刻跑」的通路，两种时序都成立。
function whenComplete(fn) {
  if (document.readyState === "complete") {
    fn();
    return;
  }
  document.addEventListener("readystatechange", function on() {
    if (document.readyState !== "complete") return;
    document.removeEventListener("readystatechange", on);
    fn();
  });
}

/* ==========================================================================
   Plotly integration script so that Markdown codeblocks will be rendered
   ========================================================================== */

// Read the Plotly data from the code block, hide it, and render the chart as new node. This allows for the
// JSON data to be retrieve when the theme is switched. The listener should only be added if the data is
// actually present on the page.
//
// NOTE that plotlyDarkLayout and plotlyLightLayout will be exposed in the minimized file
let plotlyElements = document.querySelectorAll("pre>code.language-plotly");
if (plotlyElements.length > 0) {
  whenComplete(function () {
    // Prepare to load Plotly from the CDN
    const script = document.createElement('script');
    script.src = PLOTLY_URL;
    script.async = true;

    // Once loaded, update the page elements to work with it
    script.onload = function() {
      plotlyElements.forEach(function(elem) {
        // Parse the Plotly JSON data and hide it
        let jsonData = JSON.parse(elem.textContent);
        elem.parentElement.classList.add("hidden");

        // Add the Plotly node
        let chartElement = document.createElement("div");
        elem.parentElement.after(chartElement);

        // Set the theme for the plot and render it
        const theme = (determineComputedTheme() === "dark") ? plotlyDarkLayout : plotlyLightLayout;
        if (jsonData.layout) {
          jsonData.layout.template = (jsonData.layout.template) ? { ...theme, ...jsonData.layout.template } : theme;
        } else {
          jsonData.layout = { template: theme };
        }
        Plotly.react(chartElement, jsonData.data, jsonData.layout);
      });
    }

    // Add the script to the document
    document.head.appendChild(script);
  });
}

function redrawPlotly() {
  // 库还在下载 / CDN 挂了时主题按钮不该报错：没就绪就等下一次切换再画
  if (typeof Plotly === "undefined") return;
  plotlyElements.forEach(function(elem) {
    // Parse the Plotly JSON data
    let jsonData = JSON.parse(elem.textContent);

    // Get the Plotly node（原 $(elem).parent().next().get(0)）
    let chartElement = elem.parentElement ? elem.parentElement.nextElementSibling : null;
    if (!chartElement) return;

    // Set the theme for the plot and render it
    const theme = (determineComputedTheme() === "dark") ? plotlyDarkLayout : plotlyLightLayout;
    if (jsonData.layout) {
      jsonData.layout.template = (jsonData.layout.template) ? { ...theme, ...jsonData.layout.template } : theme;
    } else {
      jsonData.layout = { template: theme };
    }
    Plotly.react(chartElement, jsonData.data, jsonData.layout);
  });
}

/* ==========================================================================
   Actions that should occur when the page has been fully loaded
   ========================================================================== */

// 原 $(document).ready(...)：DOM 已经解析完就直接跑，否则等 DOMContentLoaded。
// main.min.js 是 type="module"，本身就是 defer 语义，这里仍留判断兜底。
function whenReady(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

whenReady(function () {
  // SCSS SETTINGS - These should be the same as the settings in the relevant files
  const scssLarge = 925;          // pixels, from /_sass/_themes.scss

  // If the user hasn't chosen a theme, follow the OS preference
  setTheme();
  // Safari 13 及更早的 MediaQueryList 还不是 EventTarget，只有 addListener；
  // 不做这个兼容分支的话，下面这行会直接抛错，把紧随其后的主题按钮绑定
  // 一起带崩（切换按钮就成了死的）。
  const scheme = window.matchMedia('(prefers-color-scheme: dark)');
  const onScheme = (e) => {
    if (!themeStorageGet("theme")) {
      setTheme(e.matches ? "dark" : "light");
    }
  };
  if (scheme.addEventListener) {
    scheme.addEventListener("change", onScheme);
  } else if (scheme.addListener) {
    scheme.addListener(onScheme);
  }

  // Enable the theme toggle（点按钮本体，事件冒泡到 li 也一样，绑 li 更稳）
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) themeToggle.addEventListener('click', toggleTheme);

  // 页脚已回归文档流（见 _sass/layout/_footer.scss）：
  // 这里原有一段 bumpIt()，在每次加载与窗口变化时给 body 内联
  // padding-bottom: 0 / margin-bottom: 页脚高度，为「钉在视口底部的固定页脚」预留空间。
  // 那个布局已不存在，这段逻辑随之删除。

  // Follow menu drop down
  // 原先是 .fadeToggle("fast") 的淡入淡出 + 切 open 类。这里改成直接切
  // inline display：动画没了，但判定基准保持一致（按当前是否可见翻），
  // 与 CSS 无关地可断言；open 类也跟着结果走，不会出现类与显示各说各话。
  const followButtons = document.querySelectorAll('.author__urls-wrapper button');
  followButtons.forEach(function (b) {
    b.addEventListener('click', function () {
      const list = document.querySelector('.author__urls');
      if (!list) return;
      const visible = window.getComputedStyle(list).display !== 'none';
      list.style.display = visible ? 'none' : 'block';
      b.classList.toggle('open', !visible);
    });
  });

  // Restore the follow menu if toggled on a window resize
  window.addEventListener('resize', function () {
    const list = document.querySelector('.author__urls.social-icons');
    if (!list) return;
    // 原 $(window).width() 取的是 document.documentElement.clientWidth（不含滚动条），
    // 所以这里也用它，别换成 window.innerWidth，否则带滚动条时会差十几 px。
    const w = document.documentElement.clientWidth;
    if (window.getComputedStyle(list).display === 'none' && w >= scssLarge) {
      list.style.display = 'block';
    }
  });
});