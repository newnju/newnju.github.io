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

/* ==========================================================================
   5. 页面缩略图导航（右侧 minimap）
   --------------------------------------------------------------------------
   做法：克隆整页 DOM，用 transform: scale() 缩到窄条里，再用一个半透明方块
   标出当前视口位置。滚动时只更新方块的 transform，不重排，开销很小。
   仅作渐进增强，窄屏不启用；脚本不执行时页面完全不受影响。
   ========================================================================== */
(function () {
  "use strict";

  var MIN_WIDTH = 1200; // 窄于此宽度不显示，避免遮挡正文
  var lastGeo = "";     // 上次建图时的「视口宽 x 页面高」，用来判断是否需要重建
  var syncScale = 0.1;  // JS 回退路径下当前用的缩放比，建图时更新
  var syncBound = false; // scroll 监听是否已挂（只挂一次，避免重建时叠加）

  function geometryKey() {
    return document.documentElement.clientWidth + "x" + document.documentElement.scrollHeight;
  }

  function buildMinimap() {
    if (window.innerWidth < MIN_WIDTH) return;
    if (document.querySelector(".han-minimap")) return;

    var shell = document.createElement("div");
    shell.className = "han-minimap";
    shell.innerHTML =
      '<div class="han-minimap__clip"><div class="han-minimap__inner"></div></div>' +
      '<div class="han-minimap__view"></div>';
    var inner = shell.querySelector(".han-minimap__inner");
    var view = shell.querySelector(".han-minimap__view");

    var clone = document.body.cloneNode(true);

    // 克隆体里的 fixed / sticky 元素会脱离缩略图容器，统一压回普通流。
    // 必须在删除节点之前做：两棵树的元素顺序此时才一一对应。
    var origAll = document.body.querySelectorAll("*");
    var cloneAll = clone.querySelectorAll("*");
    for (var i = 0; i < origAll.length && i < cloneAll.length; i++) {
      var pos = window.getComputedStyle(origAll[i]).position;
      if (pos === "fixed" || pos === "sticky") cloneAll[i].style.position = "static";
    }

    // 顶部导航是 fixed，缩略图里没有意义；脚本与样式表也一并去掉
    Array.prototype.forEach.call(
      clone.querySelectorAll(".masthead, .han-minimap, script, link, noscript"),
      function (n) { n.parentNode.removeChild(n); }
    );

    // 先入文档再量宽度：脱离文档的元素没有布局，shell.clientWidth 恒为 0，
    // 下面这行于是永远落到兜底值 0.1。窄条固定 100px，只有在 1000px 视口下
    // 才恰好等于 10vw —— 更宽时缩略图比窄条宽、右缘被裁，更窄时右侧留白。
    // 先 appendChild 拿到真实宽度，比例才与窄条严丝合缝（固定定位元素不参与排版，
    // 因此这一步不会改变下面量到的页面宽高）。
    document.body.appendChild(shell);

    var pageW = document.documentElement.clientWidth;
    var pageH = document.documentElement.scrollHeight;
    // 「按宽适配」：整页横向压进窄条；宽度异常为 0 时才退回 0.1
    var scale = shell.clientWidth / pageW || 0.1;

    clone.style.width = pageW + "px";
    clone.style.transform = "scale(" + scale + ")";
    clone.style.transformOrigin = "top left";
    inner.style.height = pageH * scale + "px";
    inner.appendChild(clone);

    // 缩略图是整页 DOM 的克隆，读屏软件再读一遍毫无意义，而它本身也不可键盘操作，
    // 因此整块对辅助技术隐藏
    shell.setAttribute("aria-hidden", "true");

    var vh = window.innerHeight;
    view.style.height = Math.max(14, vh * scale) + "px";

    // 视口方块的跟随方式分两种：
    //  · 支持 animation-timeline 的浏览器（Chrome 115+ 等）交给 CSS 滚动驱动动画，
    //    方块在合成线程上跟随滚动条，与拖动完全同步，也不必监听 scroll；
    //  · 其余浏览器回退到 JS，且**不做 rAF 节流** —— 节流会让方块比滚动条慢一帧，
    //    拖动滚动条时肉眼可见滞后。每次滚动只写一次 transform，开销可以接受。
    var cssDriven =
      window.CSS && CSS.supports && CSS.supports("animation-timeline", "scroll()");

    function syncView() {
      var el = document.querySelector(".han-minimap__view");
      if (el) el.style.transform = "translateY(" + window.scrollY * syncScale + "px)";
    }

    if (cssDriven) {
      // 方块从顶部走到「可滚动距离 × 缩放比」
      shell.style.setProperty("--han-minimap-travel", (pageH - vh) * scale + "px");
    } else {
      syncScale = scale;
      if (!syncBound) {
        syncBound = true;
        window.addEventListener("scroll", syncView, { passive: true });
      }
      syncView();
    }

    // 记下这次的量测结果：load / 字体就位后若尺寸没变，就省掉一次重建
    // （重建 = 再克隆一遍整页 DOM，不便宜）
    lastGeo = geometryKey();

    // 按下即定位、拖动即跟随。
    // 这里必须用「即时定位」，不能用 scrollTo({behavior:"smooth"})：
    // smooth 会把拖动途中的每个目标位置排进一段动画，指针已经移开、画面还在慢慢追，
    // 于是拖动缩略图明显滞后；原生滚动条之所以跟手，正是因为它没有动画队列。
    //
    // 另外主题在 html 上写了 scroll-behavior: smooth（见 _sass/layout/_base.scss），
    // 这条规则会让不带参数的 scrollTo(0, y) 也走动画，等于把滞后又请了回来。
    // 所以定位时临时把根元素的 scroll-behavior 压成 auto，滚完立刻还原，
    // 既不破坏页内锚点的平滑滚动，也保证这里的拖动逐帧跟手。
    var scrollRoot = document.documentElement;
    var maxScroll = Math.max(0, pageH - window.innerHeight);

    function scrollToPoint(clientY) {
      var rect = shell.getBoundingClientRect();
      var ratio = (clientY - rect.top) / rect.height;
      if (ratio < 0) ratio = 0;
      if (ratio > 1) ratio = 1;
      // 让指针落在视口方块的中心，而不是让方块顶边对齐指针
      var target = ratio * pageH - window.innerHeight / 2;
      if (target < 0) target = 0;
      if (target > maxScroll) target = maxScroll;

      var prev = scrollRoot.style.scrollBehavior;
      scrollRoot.style.scrollBehavior = "auto";
      window.scrollTo(0, target);
      scrollRoot.style.scrollBehavior = prev;
    }

    var dragPointer = null;

    shell.addEventListener("pointerdown", function (event) {
      if (event.button !== 0) return; // 只接主键，右键 / 中键不介入
      dragPointer = event.pointerId;
      shell.classList.add("is-dragging");
      // 捕获指针：拖出这条窄条后仍然收得到 pointermove，
      // 手指在触控板上移出窗口边缘、鼠标划出屏幕也不会「丢」掉这次拖动
      if (shell.setPointerCapture) {
        try {
          shell.setPointerCapture(dragPointer);
        } catch (e) {
          /* 指针已失效等情况忽略即可 */
        }
      }
      scrollToPoint(event.clientY);
      event.preventDefault(); // 拖动时不要顺手选中页面文字
    });

    shell.addEventListener("pointermove", function (event) {
      if (dragPointer === null || event.pointerId !== dragPointer) return;
      scrollToPoint(event.clientY);
    });

    function endDrag(event) {
      if (dragPointer === null || event.pointerId !== dragPointer) return;
      if (shell.releasePointerCapture) {
        try {
          shell.releasePointerCapture(dragPointer);
        } catch (e) {
          /* 指针已被系统回收时忽略 */
        }
      }
      dragPointer = null;
      shell.classList.remove("is-dragging");
    }

    shell.addEventListener("pointerup", endDrag);
    shell.addEventListener("pointercancel", endDrag);
  }

  function destroyMinimap() {
    var old = document.querySelector(".han-minimap");
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  /* 重建：窄屏/尺寸没变时不动，必要时拆掉旧的重建一次 */
  function rebuildMinimap(force) {
    if (window.innerWidth < MIN_WIDTH) {
      destroyMinimap();
      lastGeo = "";
      return;
    }
    if (!force && document.querySelector(".han-minimap") && geometryKey() === lastGeo) return;
    destroyMinimap();
    buildMinimap();
  }

  /* 「解析完成」的判定：readyState 由 loading 翻到 interactive 正在解析结束那一刻，
     早于任何 defer 脚本（实测 Chromium：解析完 4ms 置位，而 1.2s 才能到的 defer
     脚本到 1229ms 才执行），因此不受页脚里 defer 的 MathJax 拖累。DOMContentLoaded
     只作兜底。缩略图只依赖 DOM 结构，DOM 就绪即可建图。 */
  function whenParsed(fn) {
    if (document.readyState !== "loading") {
      fn();
      return;
    }
    var done = false;
    function go() {
      if (done) return;
      done = true;
      document.removeEventListener("readystatechange", onState);
      document.removeEventListener("DOMContentLoaded", go);
      fn();
    }
    function onState() {
      if (document.readyState !== "loading") go();
    }
    document.addEventListener("readystatechange", onState);
    document.addEventListener("DOMContentLoaded", go);
  }

  /* 「样式就位」的判定：样式表还没到就克隆，缩略图会是没上妆的素页、页面高度也偏小；
     而 load（本来能兜住这一切）可能被 MathJax 拖到十几秒后，等不得。
     只等**同源**样式表（本站是 head 里的 main.css 与 fontawesome.css，与页面同源、
     本地就有），不等跨域图标字体（custom.html 里 jsDelivr 的 academicons）——
     它只管图标字形，慢起来没边；克隆里缺的图标由 load 后的重建补齐。
     最多等 1.2s，超时就先建 —— 反正 load 之后还会再校正一次。 */
  function whenStyled(fn) {
    var pending = [];
    var links = document.querySelectorAll('link[rel~="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      if (link.sheet) continue; // 已就位
      var href = link.getAttribute("href") || "";
      var host = /^[a-z][a-z0-9+.-]*:\/\/([^/]+)/i.exec(href);
      if (host && host[1] !== location.host) continue; // 跨域，不等
      pending.push(link);
    }
    if (pending.length === 0) {
      fn();
      return;
    }
    var done = false;
    var left = pending.length;
    var timer = window.setTimeout(go, 1200);
    function go() {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      fn();
    }
    for (var k = 0; k < pending.length; k++) {
      pending[k].addEventListener("load", one);
      pending[k].addEventListener("error", one);
    }
    function one() {
      if (--left <= 0) go();
    }
  }

  /* 尽早出现，再在资源就位后校正一次比例：
       · 起点是「解析完成 + 样式就位」，见上面两个函数 —— 不等 load，避免被外链拖住；
         （han.js 在 scripts.html 里用 async 加载，也不排在慢脚本后面）
       · load 后再校正一次，此时图片都已就位、页面总高度才定型；
       · 再等 document.fonts.ready —— 字体换了会改变文字行高，页面高度随之变。 */
  function bootMinimap() {
    rebuildMinimap(true);
    window.addEventListener("load", function () {
      rebuildMinimap(false);
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(function () {
          rebuildMinimap(false);
        });
      }
    });
    // resize 只注册一次：以前写在构建函数里，每次重建都会再叠一个监听，
    // 而旧监听抓着已经移除的 shell，会反复重建、叠出好几条缩略图
    window.addEventListener("resize", function () {
      rebuildMinimap(true);
    });
  }

  /* 入口：解析完成 + 样式表就位即建图，不等窗口 load，也不等 DOMContentLoaded。
     另外 rebuildMinimap 会在 READY 前调 geometryKey()，那里量的是 documentElement.scrollHeight，
     interactive 阶段文档结构已完整，量得到（之前注释里断言「interactive 时量不到」是错的）。 */
  whenParsed(function () {
    whenStyled(bootMinimap);
  });
})();

/* ==========================================================================
   6. 滚动渐显（配合 head/custom.html 的 data-reveal 引导与 _han.scss §15）
   --------------------------------------------------------------------------
   han.js 是 async 加载的，可能在文档还没解析完就执行，所以挂 DOMContentLoaded
   再选元素。任何异常路径都以「撤销 data-reveal、正文立刻可见」为先：
   · 没有标记（reduced-motion 用户 / 引导没跑）→ 直接退出，什么都不做；
   · 没有 IntersectionObserver 或没选中元素 → 撤标记退出；
   · 就绪即设 __hanRevealReady，让 head 里 3 秒的兜底定时器放心。
   ========================================================================== */
(function () {
  var root = document.documentElement;
  if (!root.hasAttribute("data-reveal")) return;

  function revealNow() {
    root.removeAttribute("data-reveal");
  }

  function boot() {
    if (!("IntersectionObserver" in window)) {
      revealNow();
      return;
    }

    /* 目标：列表卡片、时间轴条目、荣誉条目、内容区小标题。
       只挑「成组出现、适合依次入场」的元素，正文段落不掺和。 */
    var selector = ".archive__item, .han-timeline__item, .han-awards li, .page__content h2";
    var nodes = document.querySelectorAll(selector);
    if (!nodes.length) {
      revealNow();
      return;
    }

    window.__hanRevealReady = true;

    var io = new IntersectionObserver(
      function (entries) {
        Array.prototype.forEach.call(entries, function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            /* 一次性：进了视口就取消观察，此后滚动、回滚都不再动它 */
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -6% 0px" }
    );

    Array.prototype.forEach.call(nodes, function (node) {
      node.classList.add("han-reveal");
      io.observe(node);
    });

    /* 兜底：3 秒后若视口内的元素还没被回调点亮（observer 异常等），手动点亮。
       视口外的不点 —— 它们本来就该等滚动到再出现。 */
    window.setTimeout(function () {
      Array.prototype.forEach.call(
        document.querySelectorAll(".han-reveal:not(.is-visible)"),
        function (node) {
          var rect = node.getBoundingClientRect();
          if (rect.top < window.innerHeight && rect.bottom > 0) {
            node.classList.add("is-visible");
          }
        }
      );
    }, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

/* ==========================================================================
   7. 光标光斑位置（_han.scss §14）
   --------------------------------------------------------------------------
   只在精细指针（鼠标/触控板）且用户没有 reduced-motion 偏好时生效；
   pointermove 每帧最多写一次坐标，用 requestAnimationFrame 节流。
   没有这段脚本时，.han-spotlight 的 radial-gradient 停在默认坐标，也无妨。
   ========================================================================== */
(function () {
  if (!window.matchMedia) return;
  if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  var x = "72%";
  var y = "22%";
  var queued = false;

  function paint() {
    queued = false;
    var style = document.documentElement.style;
    style.setProperty("--han-spot-x", x);
    style.setProperty("--han-spot-y", y);
  }

  window.addEventListener(
    "pointermove",
    function (event) {
      x = event.clientX + "px";
      y = event.clientY + "px";
      if (!queued) {
        queued = true;
        window.requestAnimationFrame(paint);
      }
    },
    { passive: true }
  );
})();

/* ==========================================================================
   8. 侧栏线稿自绘（vivus.js，_han.scss §20）
   --------------------------------------------------------------------------
   vivus.js 的加载与 #svgpx 的渲染都走 `page.author_profile or
   layout.author_profile` 这一个条件（scripts.html 与 sidebar.html 引入
   author-profile 的条件一致），即凡是页脚有电子邮件/GitHub 联系方式
   列表的页面都会自绘；真正没有侧栏的页面 window.Vivus 不存在、或
   #svgpx 不在 DOM 里，这里直接退出。
   reduced-motion 用户不创建 Vivus —— 关键在于：SVG 平时是完整线稿，
   只有 Vivus 被创建时才会先藏起来等动画，所以「不创建」= 静态全图，
   与全站「动效坏了也不藏内容」的原则一致。
   参数对齐南大官网（www.nju.edu.cn）写法：delayed 逐笔错峰、200 帧
   （约 3.3 秒）画完、inViewport 滚进视口才开画（0.4.6 默认即此）。
   ========================================================================== */
(function () {
  if (!window.Vivus) return;
  if (!document.getElementById("svgpx")) return;
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
    return;

  new window.Vivus("svgpx", {
    type: "delayed",
    duration: 200,
    start: "inViewport",
  });
})();

/* ==========================================================================
   9. 侧栏 fit 门控（_sidebar.scss 的 .is-fit）
   --------------------------------------------------------------------------
   宽屏侧栏不再无条件固定：默认文档流，只有内容装得下一屏才加
   .is-fit 恢复固定（fixed + 100vh + padding-top:70，top 来自
   .sticky 工具类的 2em）。装不下（英文版联系方式更长 + 线稿）或
   脚本没跑时保持流式 —— 左列不出现内层滚动条，底部线稿随页滚动
   进视口，vivus 的 inViewport 监听的是窗口滚动，固定侧栏永远
   触发不了它。
   预算：内容高 + masthead 让位 + 固定态 top + 余量 ≤ 一屏。
   resize / load / 字体就位后重新判定（rAF 节流；脱类-测量-回加
   在同一回调内完成，不会有中间绘制闪跳）。
   ========================================================================== */
(function () {
  var sidebar = document.querySelector(".sidebar.sticky");
  if (!sidebar) return;

  var mqPin = window.matchMedia("(min-width: 925px)"); // 与 _themes.scss 的 $large 对齐
  var CLEARANCE = 70; // 与 _sass 下的 $masthead-height 对齐
  var GUTTER = 8;
  var rafId = 0;

  function apply() {
    if (!mqPin.matches) {
      sidebar.classList.remove("is-fit");
      return;
    }
    // 先脱掉 .is-fit 量流式真实高度（固定态的 padding-top 会把量高撑大 70px）
    sidebar.classList.remove("is-fit");
    var pinTop = parseFloat(window.getComputedStyle(sidebar).top) || 0;
    if (
      sidebar.scrollHeight + CLEARANCE + pinTop + GUTTER <=
      window.innerHeight
    ) {
      sidebar.classList.add("is-fit");
    }
  }

  function schedule() {
    if (rafId) return;
    rafId = window.requestAnimationFrame(function () {
      rafId = 0;
      apply();
    });
  }

  function boot() {
    apply();
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("load", schedule);
    if (mqPin.addEventListener) {
      mqPin.addEventListener("change", schedule);
    } else if (mqPin.addListener) {
      mqPin.addListener(schedule);
    }
    if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
      document.fonts.ready.then(schedule);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();

/* ==========================================================================
   10. 点击涟漪（_han.scss §21）
   --------------------------------------------------------------------------
   在可点击元素（a / button / summary / role=button）上按下时，以指针坐标
   为圆心铺一圈涟漪，半径取指针到元素四角的最大距离，560ms 扩散淡出后
   自回收。节点 position: fixed 挂 body —— 不依赖祖先定位、不参与布局，
   pointer-events: none 不挡点击。
   reduced-motion 或没有 PointerEvent 时直接不监听，一个节点都不会生成；
   样式层（§17）另有 display:none 兜底。缩略图（.han-minimap）是拖拽
   导航不是普通点击，排除在外。
   ========================================================================== */
(function () {
  if (!window.matchMedia) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (!window.PointerEvent) return;

  var HIT =
    "a, button, summary, [role='button'], input[type='button'], input[type='submit']";

  document.addEventListener(
    "pointerdown",
    function (event) {
      if (event.button !== 0 || event.defaultPrevented) return;
      var target = event.target;
      if (!target || !target.closest) return;
      var hit = target.closest(HIT);
      if (!hit || hit.closest(".han-minimap")) return;

      var rect = hit.getBoundingClientRect();
      var dx = Math.max(event.clientX - rect.left, rect.right - event.clientX);
      var dy = Math.max(event.clientY - rect.top, rect.bottom - event.clientY);
      var radius = Math.max(Math.sqrt(dx * dx + dy * dy), 24);

      var dot = document.createElement("span");
      dot.className = "han-ripple";
      dot.style.width = radius * 2 + "px";
      dot.style.height = radius * 2 + "px";
      dot.style.left = event.clientX + "px";
      dot.style.top = event.clientY + "px";
      var kill = function () {
        if (dot.parentNode) dot.parentNode.removeChild(dot);
      };
      dot.addEventListener("animationend", kill);
      setTimeout(kill, 900); // 动画没跑起来（样式缺失等）也不残留节点
      document.body.appendChild(dot);
    },
    { passive: true }
  );
})();
