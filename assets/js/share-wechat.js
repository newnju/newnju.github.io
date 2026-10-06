/* ==========================================================================
   中文页「分享到 · 微信」的二维码弹层（assets/js/share-wechat.js）
   --------------------------------------------------------------------------
   为什么是弹层而不是链接：微信没有网页端分享 URL（JS-SDK 要公众号 AppID 加
   服务端签名，静态站做不到）。所以微信按钮点了弹出**本页地址**的二维码，手机
   上用微信「扫一扫」打开、或点「复制链接」自己发出去 —— 两条路都通，且到此
   为止不引任何第三方脚本。

   三条原则（和 assets/js/visit.js 一致）：
   1. **坏了也不能影响访客**：整个文件包在 try/catch 里。任何一步出错，页面都
      当没这回事 —— 微信按钮保持 hidden，点了没反应总比报错刷屏强。
   2. **二维码库点开才下载**：assets/js/qrcode.min.js 有 20KB，而绝大多数访客
      根本不会点微信 —— 首屏不该为它买单。这里只负责在第一次点击时插 <script>，
      地址从当前脚本自己的 src 推出来，所以带 baseurl 也对。
   3. **二维码本机算**：不联网、不打点、不写 cookie。链接也是在本机复制的。
   --------------------------------------------------------------------------
   文案全部来自模板打在 .page__share 上的 data-label-*（_data/ui-text.yml），
   这个文件里一个中文字符串都不写 —— 换语言只动 YAML。
   ========================================================================== */
(function () {
  "use strict";
  try {
    var btn = document.querySelector("[data-share-wechat]");
    if (!btn) return;

    var root = btn.parentNode;
    if (btn.closest) root = btn.closest(".page__share") || root;
    var self = document.currentScript;
    var pageUrl = root.getAttribute("data-url") || location.href;

    var label = function (name) {
      return root.getAttribute("data-label-" + name) || "";
    };

    // 二维码库和自己同目录 —— 这样 _config.yml 改 baseurl 也不用跟着改路径
    var qrSrc =
      self && self.src
        ? self.src.replace(/[^/]+$/, "qrcode.min.js")
        : "/assets/js/qrcode.min.js";

    var panel = null;
    var loadingQr = null;

    /* ---------------------------------------------------------- 二维码库 */
    function loadQrLibrary() {
      if (window.qrcode) return Promise.resolve(window.qrcode);
      if (loadingQr) return loadingQr;
      loadingQr = new Promise(function (resolve, reject) {
        var s = document.createElement("script");
        s.src = qrSrc;
        s.async = true;
        s.onload = function () {
          window.qrcode ? resolve(window.qrcode) : reject(new Error("qrcode missing"));
        };
        s.onerror = function () {
          reject(new Error("qrcode failed to load"));
        };
        (document.head || document.getElementsByTagName("head")[0]).appendChild(s);
      });
      return loadingQr;
    }

    /* ------------------------------------------------------------ 画二维码 */
    function draw(qrLib, host) {
      var qr = qrLib(0, "M"); // 0 = 版本号交给库自己算
      qr.addData(pageUrl);
      qr.make();

      var n = qr.getModuleCount();
      var quiet = 4; // 扫码需要静默区，少于 4 格手机容易扫不出来
      var box = n + quiet * 2;
      var d = "";
      for (var r = 0; r < n; r++) {
        for (var c = 0; c < n; c++) {
          if (qr.isDark(r, c)) d += "M" + (c + quiet) + " " + (r + quiet) + "h1v1h-1z";
        }
      }

      // 白底黑码写死：暗色主题下也必须如此，扫码靠的是对比度不是配色
      host.innerHTML = "";
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 " + box + " " + box);
      svg.setAttribute("width", "168");
      svg.setAttribute("height", "168");
      svg.setAttribute("shape-rendering", "crispEdges");
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", label("scan") || "QR code");

      var bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      bg.setAttribute("width", String(box));
      bg.setAttribute("height", String(box));
      bg.setAttribute("fill", "#fff");
      svg.appendChild(bg);

      var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "#000");
      svg.appendChild(path);

      host.appendChild(svg);
    }

    /* ------------------------------------------------------------ 复制链接 */
    function selectUrlText() {
      // 复制失败时退而求其次：把地址整段选中，访客自己 Ctrl+C
      var node = panel.querySelector(".han-sharecard__url");
      if (!node || !window.getSelection) return;
      var range = document.createRange();
      range.selectNodeContents(node);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }

    function wireCopy(copyBtn) {
      var resetTimer = 0;
      copyBtn.addEventListener("click", function () {
        var flip = function () {
          copyBtn.textContent = label("copied");
          clearTimeout(resetTimer);
          resetTimer = setTimeout(function () {
            copyBtn.textContent = label("copy");
          }, 1600);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(pageUrl).then(flip, function () {
            legacyCopy();
            selectUrlText();
          });
        } else {
          legacyCopy();
          selectUrlText();
        }
      });
    }

    // 老浏览器 / 非安全上下文（http 预览）没有 clipboard API
    function legacyCopy() {
      var ta = document.createElement("textarea");
      ta.value = pageUrl;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch (e) {
        /* 复制不了就只能靠上面的选中兜底 */
      }
      document.body.removeChild(ta);
    }

    /* ------------------------------------------------------------ 弹层本体 */
    function buildPanel() {
      var box = document.createElement("div");
      box.className = "han-sharecard";
      box.setAttribute("role", "dialog");
      // 弹层的名字用「微信分享」，里面那句可见的提示才说怎么扫 —— 名称和说明
      // 各司其职，读屏不会把「用微信扫一扫」念成这个窗口的标题
      box.setAttribute("aria-label", label("dialog") || label("scan") || "QR code");
      box.hidden = true;

      var hint = document.createElement("p");
      hint.className = "han-sharecard__hint";
      hint.textContent = label("scan");
      box.appendChild(hint);

      var qr = document.createElement("div");
      qr.className = "han-sharecard__qr";
      qr.setAttribute("aria-hidden", "true"); // 真正可访问的信息在下面那行地址里
      box.appendChild(qr);

      var url = document.createElement("p");
      url.className = "han-sharecard__url";
      url.textContent = pageUrl; // 可全选：扫不了码的时候还能手动复制
      box.appendChild(url);

      var acts = document.createElement("div");
      acts.className = "han-sharecard__acts";

      var copy = document.createElement("button");
      copy.type = "button";
      copy.className = "han-sharecard__copy";
      copy.textContent = label("copy");

      var close = document.createElement("button");
      close.type = "button";
      close.className = "han-sharecard__close";
      close.textContent = "\u00d7"; // ×
      close.setAttribute("aria-label", label("close"));
      close.title = label("close");

      acts.appendChild(copy);
      acts.appendChild(close);
      box.appendChild(acts);

      wireCopy(copy, { id: 0 });
      close.addEventListener("click", function () {
        closePanel();
      });

      root.appendChild(box);
      return box;
    }

    /* ------------------------------------------------------------- 开 / 关 */
    function openPanel() {
      if (!panel) panel = buildPanel();
      panel.hidden = false;
      btn.setAttribute("aria-expanded", "true");

      // 二维码只算一次；库没来就在弹层里等着（hint 已经在了）
      loadQrLibrary().then(
        function (q) {
          if (!panel.hidden) draw(q, panel.querySelector(".han-sharecard__qr"));
        },
        function () {
          /* 库下不来：地址还在，访客仍可以复制 —— 不报错打断 */
        }
      );

      var first = panel.querySelector("button");
      if (first && first.focus) first.focus();
    }

    function closePanel() {
      if (panel) panel.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      if (btn.focus) btn.focus();
    }

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      if (panel && !panel.hidden) closePanel();
      else openPanel();
    });

    // 点弹层外面关掉。用 mousedown 挂在 document 上：按钮自己在 root 里，
    // 所以不会被这条误关（否则点一下就开了又关）。
    document.addEventListener("mousedown", function (e) {
      if (!panel || panel.hidden) return;
      if (root.contains(e.target)) return;
      closePanel();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" && e.keyCode !== 27) return;
      if (!panel || panel.hidden) return;
      closePanel();
    });

    // 走到这里才露出按钮：HTML 里它带 hidden，没 JS 就一直藏着
    btn.hidden = false;
  } catch (e) {
    /* 分享坏了不该连累整页 */
  }
})();
