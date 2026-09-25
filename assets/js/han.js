/* ==========================================================================
   HAN THEME — 站点脚本
   --------------------------------------------------------------------------
   1. 论文 BibTeX 一键复制（按钮文案由 _includes/han-bibtex.html 传入）
   只做渐进增强：脚本不执行时，BibTeX 仍可通过 <details> 展开手动选中复制。
   ========================================================================== */

(function () {
  "use strict";

  /** 兜底复制：clipboard API 不可用时（http、file://、旧浏览器）走 execCommand */
  function legacyCopy(text, onDone) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    if (ok) onDone();
  }

  function bindCopyButtons() {
    var buttons = document.querySelectorAll("[data-bibtex-copy]");
    Array.prototype.forEach.call(buttons, function (btn) {
      btn.addEventListener("click", function (event) {
        // 按钮位于 <summary> 内，阻止冒泡以免顺带把 BibTeX 折叠起来
        event.preventDefault();
        event.stopPropagation();

        var scope = btn.closest("[data-bibtex]");
        var pre = scope && scope.querySelector(".han-bibtex__pre");
        if (!pre) return;

        var text = pre.textContent;
        var doneLabel = btn.getAttribute("data-label-done") || "已复制";
        if (!btn.hasAttribute("data-label-original")) {
          btn.setAttribute("data-label-original", btn.textContent);
        }
        var originalLabel = btn.getAttribute("data-label-original");
        var timer = null;

        function flash() {
          btn.textContent = doneLabel;
          btn.classList.add("is-done");
          window.clearTimeout(timer);
          timer = window.setTimeout(function () {
            btn.textContent = originalLabel;
            btn.classList.remove("is-done");
          }, 1800);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(flash, function () {
            legacyCopy(text, flash);
          });
        } else {
          legacyCopy(text, flash);
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindCopyButtons);
  } else {
    bindCopyButtons();
  }
})();

/* ==========================================================================
   2. 汉堡菜单（移动端折叠 + 点击展开）
   --------------------------------------------------------------------------
   仅做渐进增强：脚本不执行时，桌面端导航照常，移动端也至少仍显示汉堡按钮
   （由 _han.scss 的媒体查询控制显隐），不会比现在更糟。
   ========================================================================== */
(function () {
  "use strict";

  function initGreedyNav() {
    var nav = document.getElementById("site-nav");
    if (!nav || !nav.classList.contains("greedy-nav")) return;
    var btn = nav.querySelector("button");
    var visible = nav.querySelector(".visible-links");
    var hidden = nav.querySelector(".hidden-links");
    if (!btn || !visible || !hidden) return;

    // 始终留在导航条上的项（站点名 / 语言 / 主题 / 配色），不参与折叠
    var items = visible.querySelectorAll("li:not(.persist)");
    var anchor = visible.querySelector("li.persist:not(.masthead__menu-item--lg)");
    var ordered = [];
    for (var k = 0; k < items.length; k++) ordered.push(items[k]);

    function moveToHidden() {
      for (var i = 0; i < ordered.length; i++) hidden.appendChild(ordered[i]);
    }

    function moveToVisible() {
      for (var i = 0; i < ordered.length; i++) {
        if (anchor) visible.insertBefore(ordered[i], anchor);
        else visible.appendChild(ordered[i]);
      }
      hidden.classList.add("hidden");
      btn.classList.remove("open");
    }

    function apply(isMobile) {
      if (isMobile) moveToHidden();
      else moveToVisible();
    }

    var mq = window.matchMedia("(max-width: 768px)");
    apply(mq.matches);

    var wasMobile = mq.matches;
    window.addEventListener("resize", function () {
      var isMobile = mq.matches;
      if (isMobile !== wasMobile) {
        wasMobile = isMobile;
        apply(isMobile);
      }
    });

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      hidden.classList.toggle("hidden");
      btn.classList.toggle("open");
    });

    document.addEventListener("click", function (e) {
      if (!nav.contains(e.target)) {
        hidden.classList.add("hidden");
        btn.classList.remove("open");
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGreedyNav);
  } else {
    initGreedyNav();
  }
})();

/* ==========================================================================
   3. 配色主题（南大紫 / 青铜绿），从 localStorage 恢复
      历史上由调色按钮切换，按钮已移除，仅保留已保存偏好的应用
   ========================================================================== */
(function () {
  "use strict";
  var KEY = "color-theme";
  var THEMES = ["nju", "han"];
  var html = document.documentElement;

  function apply(theme) {
    if (THEMES.indexOf(theme) === -1) theme = "nju";
    html.setAttribute("data-color-theme", theme);
  }

  var saved = null;
  try { saved = localStorage.getItem(KEY); } catch (e) {}
  apply(saved || html.getAttribute("data-color-theme") || "nju");
})();

/* ==========================================================================
   4. 期刊论文标题：点击复制 GB/T 7714 引用
   --------------------------------------------------------------------------
   引用文本由 _includes/archive-single.html 写入 data-citation（即 front matter
   的 citation 字段，本身即 GB/T 7714 格式）。
   仅做渐进增强：脚本不执行时，标题仍是普通链接，可跳转知网或站内详情页。
   ========================================================================== */
(function () {
  "use strict";

  /** 兜底复制：clipboard API 不可用时（http、file://、旧浏览器）走 execCommand */
  function fallbackCopy(text, onDone) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    var ok = false;
    try {
      ok = document.execCommand("copy");
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    if (ok) onDone();
  }

  function bindCitationCopy() {
    var links = document.querySelectorAll(".js-copy-citation");
    Array.prototype.forEach.call(links, function (link) {
      link.addEventListener("click", function (event) {
        var text = link.getAttribute("data-citation");
        if (!text) return; // 没拿到引用文本，按普通链接跳转
        event.preventDefault();

        var doneLabel = link.getAttribute("data-label-done") || "已复制引用";
        // 首次点击时缓存标题原文，避免连点时把「已复制引用」当成原文
        if (!link.hasAttribute("data-label-original")) {
          link.setAttribute("data-label-original", link.textContent);
        }
        var original = link.getAttribute("data-label-original");
        var timer = null;

        function flash() {
          link.textContent = doneLabel;
          link.classList.add("is-copied");
          window.clearTimeout(timer);
          timer = window.setTimeout(function () {
            link.textContent = original;
            link.classList.remove("is-copied");
          }, 1800);
        }

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(flash, function () {
            fallbackCopy(text, flash);
          });
        } else {
          fallbackCopy(text, flash);
        }
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindCitationCopy);
  } else {
    bindCitationCopy();
  }
})();
