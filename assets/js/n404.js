/* ---------------------------------------------------------------------
   n404.js —— 404 页专属脚本（_pages/404.md 引用，仅 404 加载）
   三段各自独立、失败互不牵连：语言换装 / 自助导航引擎 / 太空侵略者。
   为什么在这：站点的 compress_html 布局会把内联 <script> 压成一行，
   // 注释会吞掉后面整段 —— 外链文件不吃压缩，代码原样活着。
   --------------------------------------------------------------------- */


  (function () {
    if (!/^\/en(\/|$)/.test(window.location.pathname)) { return; }
    var data;
    try {
      data = JSON.parse(document.getElementById("n404-en-data").textContent);
    } catch (e) { return; }

    // 按字符串整体替换（split/join），避免正则转义问题
    function swap(root, pairs) {
      if (!root) { return; }
      pairs.forEach(function (pair) {
        if (!pair.from) { return; }
        root.innerHTML = root.innerHTML.split(pair.from).join(pair.to);
      });
    }

    document.addEventListener("DOMContentLoaded", function () {
      // 正文：中文块换成英文块
      Array.prototype.forEach.call(document.querySelectorAll("[data-n404]"), function (el) {
        if (el.getAttribute("data-n404") === "en") { el.removeAttribute("hidden"); }
        else { el.setAttribute("hidden", "hidden"); }
      });

      document.documentElement.setAttribute("lang", "en");
      document.title = data.title + " - " + data.siteTitle;

      // 正文大标题（page__title）与结构化数据里的 headline
      var h1 = document.querySelector(".page__title");
      if (h1) { h1.textContent = data.title; }
      var headline = document.querySelector('meta[itemprop="headline"]');
      if (headline) { headline.setAttribute("content", data.title); }

      // 顶部导航：按原 href 的 pathname 对上号，换文案并补 /en 前缀。
      // masthead 渲染出来的是绝对地址（base_path = site.url），所以先归一成路径再比。
      Array.prototype.forEach.call(document.querySelectorAll("#site-nav .visible-links > li > a"), function (a) {
        var href = a.getAttribute("href");
        var path = href;
        try { path = new URL(href, window.location.origin).pathname; } catch (e) {}
        data.nav.forEach(function (item) {
          if (item.from !== path) { return; }
          a.setAttribute("href", item.to);
          if (a.querySelector("i")) {
            // 语言切换项前面有个图标，只换文本节点，别把图标一起抹掉
            Array.prototype.forEach.call(a.childNodes, function (n) {
              if (n.nodeType === 3) { n.nodeValue = item.text; }
            });
          } else {
            a.textContent = item.text;
          }
        });
      });

      swap(document.querySelector(".sidebar"), data.pairs);
      swap(document.querySelector(".page__footer"), data.pairs);

      var sitemap = document.querySelector('.page__footer a[href="/sitemap/"]');
      if (sitemap) { sitemap.setAttribute("href", data.sitemap); }
    });
  })();


  /* ---------------------------------------------------------------------
     404 自助引擎：语言提示 + 坏地址修正 + 模糊建议
     只做展示层的事，不改 URL 历史（自动跳转用 location.replace，不留垃圾
     历史）；一个元素找不到就整段静默退出，绝不抛错打断页面别的脚本。
     --------------------------------------------------------------------- */
  (function () {
    "use strict";

    var path = window.location.pathname;
    var isEnPath = /^\/en(\/|$)/.test(path);
    var navLangs = (navigator.languages && navigator.languages.length)
      ? navigator.languages : [navigator.language || ""];
    var browserEn = /^en\b/i.test(navLangs[0] || "");

    function show(id, on) {
      var el = document.getElementById(id);
      if (el) { el[on ? "removeAttribute" : "setAttribute"]("hidden", "hidden"); }
      return el;
    }
    function setURL(id, href) {
      var a = document.getElementById(id);
      if (a) { a.setAttribute("href", href); a.textContent = href; }
    }

    // 归一化：解码 → 去查询串与锚点 → 小写 → 去结尾斜杠 → 去 /index.html
    // → 去文件后缀。全站地址表也按同一套规则归一后比对。
    function normalize(raw) {
      var p = raw;
      try { p = decodeURIComponent(p); } catch (e) { /* 保留原样 */ }
      p = String(p).split("?")[0].split("#")[0].toLowerCase();
      p = p.replace(/\/+$/, "");
      p = p.replace(/\/index\.html?$/, "");
      p = p.replace(/\.(html?|php|aspx|jsp)$/, "");
      return p;
    }

    // 编辑距离（O(ab)，地址都很短，不值得上复杂算法）
    function lev(a, b) {
      if (a === b) { return 0; }
      if (!a.length) { return b.length; }
      if (!b.length) { return a.length; }
      var prev = [], cur, i, j;
      for (i = 0; i <= b.length; i++) { prev[i] = i; }
      for (i = 1; i <= a.length; i++) {
        cur = [i];
        for (j = 1; j <= b.length; j++) {
          cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1,
            prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
      }
      return prev[b.length];
    }

    document.addEventListener("DOMContentLoaded", function () {
      var lang = isEnPath ? "en" : "zh";

      // —— 1. 语言提示：跟 URL 语言对着浏览器主语言补一句 ——
      if (!isEnPath && browserEn) { show("n404-nudge-zh", true); }
      if (isEnPath && !browserEn) { show("n404-nudge-en", true); }

      // —— 2/3. 地址表比对 ——
      var table;
      try {
        table = JSON.parse(document.getElementById("n404-pages").textContent)[lang] || [];
      } catch (e) { table = []; }
      if (!table.length) { return; }

      var hit = normalize(path);
      // /en 还要去掉前缀再比：/en/CV/ 的坏处不在 /en 而在 CV
      var hitBare = isEnPath ? hit.replace(/^\/en/, "") : hit;

      var fix = null;
      for (var i = 0; i < table.length; i++) {
        var base = normalize(table[i].href);
        if (hit === base || hitBare === base.replace(/^\/en/, "")) { fix = table[i]; break; }
      }

      if (!fix) {
        // 模糊：编辑距离 + 长度比例惩罚，取前三且距离可接受的
        var cands = [];
        for (var j = 0; j < table.length; j++) {
          var nb = normalize(table[j].href);
          var d = lev(hitBare, nb.replace(/^\/en/, ""));
          cands.push({ item: table[j], d: d });
        }
        cands.sort(function (a, b) { return a.d - b.d; });
        var best = cands.filter(function (c) {
          var nb = normalize(c.item.href).replace(/^\/en/, "");
          return c.d <= Math.max(2, Math.floor(nb.length * 0.34));
        }).slice(0, 3);
        if (best.length) {
          show("n404-sugg-" + lang, true);
          var ul = document.getElementById("n404-sugg-list-" + lang);
          if (ul) {
            best.forEach(function (c) {
              var li = document.createElement("li");
              var a = document.createElement("a");
              a.setAttribute("href", c.item.href);
              a.textContent = c.item.href;
              var span = document.createElement("span");
              span.className = "n404-sugg-title";
              span.textContent = c.item.text;
              li.appendChild(a);
              li.appendChild(span);
              ul.appendChild(li);
            });
          }
        }
        return;
      }

      // —— 命中归一化：给出正确地址并倒计时 ——
      var prefix = isEnPath && fix.href.indexOf("/en") !== 0 ? "/en" : "";
      var dest = prefix + fix.href;
      var fixBox = show("n404-fix-" + lang, true);
      setURL("n404-fix-url-" + lang, dest);

      if (!fixBox) { return; }
      var clockEl = document.getElementById("n404-clock-" + lang);
      var stopEl = document.getElementById("n404-stop-" + lang);
      var left = 5;
      var timer = window.setInterval(function () {
        left -= 1;
        if (clockEl) { clockEl.textContent = String(left); }
        if (left <= 0) {
          window.clearInterval(timer);
          window.location.replace(dest);
        }
      }, 1000);
      if (stopEl) {
        stopEl.addEventListener("click", function (e) {
          e.preventDefault();
          window.clearInterval(timer);
          if (fixBox) { fixBox.setAttribute("hidden", "hidden"); }
        });
      }
    });
  })();


  /* ---------------------------------------------------------------------
     太空侵略者 · 404 门面小游戏
     纯 Canvas 自绘：像素 sprite 用字符串阵列定义，开局前烘焙进离屏画布，
     零外部素材、零依赖。屏幕内部是固定的街机柜配色（暖白 / 薄荷 / 鎏金），
     不随站点明暗主题翻转；页框、HUD 与按钮走主题变量（§31），点缀色取
     --han-patina。状态机：ready（开始遮罩）→ playing → dying（命中硬直，
     全场冻结）→ playing / over，清版经 wave 横幅过场进下一波。所有动效
     都从用户点「开始」之后才开始 —— no-JS、reduced-motion 与打印下整个
     区块保持 hidden，只剩静态文字与自助导航。声音是 WebAudio 方波合成，
     默认开、可一键关，选择落在 n404-inv-mute；音频任何失败都静默吞掉，
     绝不打断页面。
     --------------------------------------------------------------------- */
  (function () {
    "use strict";

    var gameEl = document.getElementById("n404-inv");
    var canvas = document.getElementById("n404-inv-canvas");
    if (!gameEl || !canvas || !canvas.getContext) { return; }

    var isEnPath = /^\/en(\/|$)/.test(window.location.pathname);
    var T = null;
    try {
      var rawI18n = JSON.parse(document.getElementById("n404-inv-i18n").textContent);
      T = rawI18n[isEnPath ? "en" : "zh"] || rawI18n.zh;
    } catch (e) { T = null; }
    if (!T) { return; }

    function byId(id) { return document.getElementById(id); }

    // —— 文案与链接（游戏区是中英共用的一份 DOM，在这里按语言填）——
    byId("n404-inv-l-score").textContent = T.hud.score;
    byId("n404-inv-l-hi").textContent = T.hud.hi;
    byId("n404-inv-l-wave").textContent = T.hud.wave;
    canvas.setAttribute("aria-label", T.aria);
    byId("n404-inv-start-t").textContent = T.start.title;
    byId("n404-inv-start-s").textContent = T.start.sub;
    byId("n404-inv-start").textContent = T.start.btn;
    byId("n404-inv-start-h").textContent = T.start.hint;
    byId("n404-inv-over-t").textContent = T.over.title;
    byId("n404-inv-again").textContent = T.over.again;
    byId("n404-inv-or").textContent = T.over.or;
    var homeLink = byId("n404-inv-home");
    homeLink.textContent = T.over.home;
    homeLink.setAttribute("href", isEnPath ? "/en/" : "/");

    // —— 音效（方波合成，音量很低；可关）——
    var AC = window.AudioContext || window.webkitAudioContext;
    var actx = null, master = null;
    var muted = false;
    try { muted = window.localStorage.getItem("n404-inv-mute") === "1"; } catch (e) {}
    var elMute = byId("n404-inv-mute");
    function muteLabel() { elMute.textContent = muted ? T.snd.off : T.snd.on; }
    muteLabel();
    elMute.addEventListener("click", function (e) {
      muted = !muted;
      try { window.localStorage.setItem("n404-inv-mute", muted ? "1" : "0"); } catch (er) {}
      if (master) { try { master.gain.value = muted ? 0 : 0.05; } catch (er) {} }
      muteLabel();
      if (e.detail) { elMute.blur(); } // 鼠标点完就放手，别把空格键占成静音键
    });

    function audio() {
      if (!AC) { return null; }
      if (!actx) {
        try {
          actx = new AC();
          master = actx.createGain();
          master.gain.value = muted ? 0 : 0.05;
          master.connect(actx.destination);
        } catch (e) { actx = null; }
      }
      if (actx && actx.state === "suspended") {
        try { actx.resume(); } catch (e) {}
      }
      return actx;
    }

    function tone(f1, f2, dur, type, vol, delay) {
      if (muted) { return; }
      var a = audio();
      if (!a) { return; }
      try {
        var t = a.currentTime + (delay || 0);
        var o = a.createOscillator();
        var g = a.createGain();
        o.type = type || "square";
        o.frequency.setValueAtTime(f1, t);
        if (f2) { o.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur); }
        g.gain.setValueAtTime(vol || 0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(g);
        g.connect(master);
        o.start(t);
        o.stop(t + dur + 0.03);
      } catch (e) {}
    }

    // —— 像素 sprite（X = 一个像素；每个敌人两帧，经典的挥动触手动作）——
    var SQ = [
      ["...XX...",
       "..XXXX..",
       ".XXXXXX.",
       "XX.XX.XX",
       "XXXXXXXX",
       "..X..X..",
       ".X.XX.X.",
       "X.X..X.X"],
      ["...XX...",
       "..XXXX..",
       ".XXXXXX.",
       "XX.XX.XX",
       "XXXXXXXX",
       ".X.XX.X.",
       "X......X",
       ".X....X."]
    ];
    var CR = [
      ["..X.....X..",
       "...X...X...",
       "..XXXXXXX..",
       ".XX.XXX.XX.",
       "XXXXXXXXXXX",
       "X.XXXXXXX.X",
       "X.X.....X.X",
       "...XX.XX..."],
      ["..X.....X..",
       "X..X...X..X",
       "X.XXXXXXX.X",
       "XXX.XXX.XXX",
       "XXXXXXXXXXX",
       ".XXXXXXXXX.",
       "..X.....X..",
       ".X.......X."]
    ];
    var OC = [
      ["....XXXX....",
       ".XXXXXXXXXX.",
       "XXXXXXXXXXXX",
       "XXX..XX..XXX",
       "XXXXXXXXXXXX",
       "..XXX..XXX..",
       ".XX..XX..XX.",
       "..XX....XX.."],
      ["....XXXX....",
       ".XXXXXXXXXX.",
       "XXXXXXXXXXXX",
       "XXX..XX..XXX",
       "XXXXXXXXXXXX",
       "..XXX..XXX..",
       ".XX......XX.",
       "..X......X.."]
    ];
    var SHIP = [
      ["......X......",
       ".....XXX.....",
       ".....XXX.....",
       ".XXXXXXXXXXX.",
       "XXXXXXXXXXXXX",
       "XXXXXXXXXXXXX",
       "XXXXXXXXXXXXX"]
    ];
    var UFO = [
      [".....XXXXXX.....",
       "...XXXXXXXXXX...",
       "..XXXXXXXXXXXX..",
       ".XX.XX.XX.XX.XX.",
       "XXXXXXXXXXXXXXXX",
       "..XXX..XX..XXX..",
       "...X......X....."]
    ];

    var PX = 4;
    var PAL = { enemy: "#d9d4c5", mint: "#9fe3c0", gold: "#e8c476", coral: "#ff8f6b", space: "#0a0d12" };
    var patina = "#8fd2ae";
    try {
      var pv = window.getComputedStyle(document.documentElement).getPropertyValue("--han-patina").trim();
      if (/^#[0-9a-fA-F]{3,8}$/.test(pv)) { patina = pv; }
    } catch (e) {}

    function sprite(rows, color) {
      var h = rows.length, w = rows[0].length;
      var c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      var g = c.getContext("2d");
      if (g) {
        g.fillStyle = color;
        for (var y = 0; y < h; y++) {
          for (var x = 0; x < w; x++) {
            if (rows[y].charAt(x) === "X") { g.fillRect(x, y, 1, 1); }
          }
        }
      }
      return c;
    }

    var TYPE_SPR = [SQ, CR, OC];
    var TYPE_PTS = [30, 20, 10];   // 顶排 30 / 中排 20 / 底排 10，经典分值
    var TYPE_W = [8, 11, 12];
    var ROW_TYPE = [0, 0, 1, 1, 2];

    var enSpr = [];
    for (var ti = 0; ti < 3; ti++) {
      enSpr.push([sprite(TYPE_SPR[ti][0], PAL.enemy), sprite(TYPE_SPR[ti][1], PAL.enemy)]);
    }
    var shipSpr = sprite(SHIP[0], PAL.mint);
    var ufoSpr = sprite(UFO[0], PAL.gold);

    // —— 场地与状态 ——
    var W = 480, H = 640;
    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    var COLS = 8, ROWS = 5, CELL_W = 52, CELL_H = 42, STEP_X = 12, DROP_Y = 14;
    var total = ROWS * COLS;

    var state = "ready"; // ready | playing | dying | wave | over
    var score = 0, hi = 0, wave = 1, lives = 3;
    try { hi = parseInt(window.localStorage.getItem("n404-inv-hi"), 10) || 0; } catch (e) {}

    var grid = [], alive = 0;
    var fx = 32, fy = 78, dir = 1, stepT = 0.72, baseGap = 0.68, frameIdx = 0, marchIdx = 0;
    var player = { x: (W - 52) / 2, y: 588, w: 52, h: 28 };
    var pB = null, eB = [];
    var keys = { l: false, r: false, f: false };
    var ptr = { on: false, x: 0 };
    var ufo = null, ufoT = 10, ufoNote = 0, ufoDir = 1;
    var fireT = 1.4;
    var dyingT = 0, waveT = 0;
    var parts = [];
    var eggsFired = {};
    var EGGS_TH = [500, 1000, 2000];

    var stars = [];
    for (var si = 0; si < 72; si++) {
      stars.push({
        x: Math.random() * W, y: Math.random() * H,
        v: 6 + Math.random() * 34,
        s: Math.random() < 0.22 ? 2 : 1,
        a: 0.2 + Math.random() * 0.5
      });
    }

    function buildFormation() {
      grid = [];
      for (var r = 0; r < ROWS; r++) {
        for (var c = 0; c < COLS; c++) {
          grid.push({ t: ROW_TYPE[r], r: r, c: c, alive: true });
        }
      }
      alive = total;
      fx = 32;
      fy = 78 + Math.min(40, (wave - 1) * 10);
      dir = 1;
      frameIdx = 0;
      marchIdx = 0;
      baseGap = Math.max(0.06, 0.68 - (wave - 1) * 0.07);
      stepT = baseGap + 0.04;
    }

    function bounds() {
      var minC = COLS, maxC = -1, maxR = -1;
      for (var i = 0; i < grid.length; i++) {
        var g = grid[i];
        if (!g.alive) { continue; }
        if (g.c < minC) { minC = g.c; }
        if (g.c > maxC) { maxC = g.c; }
        if (g.r > maxR) { maxR = g.r; }
      }
      if (maxC < 0) { return null; }
      return {
        x0: fx + minC * CELL_W + 2,
        x1: fx + maxC * CELL_W + CELL_W - 2,
        bottom: fy + maxR * CELL_H + 32
      };
    }

    function cellRect(g) {
      var w = TYPE_W[g.t] * PX;
      return { x: fx + g.c * CELL_W + (CELL_W - w) / 2, y: fy + g.r * CELL_H, w: w, h: 32 };
    }

    function hit(ax, ay, aw, ah, bx, by, bw, bh) {
      return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
    }

    function burst(x, y, color, n) {
      for (var i = 0; i < (n || 10); i++) {
        var ang = Math.random() * Math.PI * 2;
        var sp = 40 + Math.random() * 150;
        var life = 0.3 + Math.random() * 0.35;
        parts.push({
          x: x, y: y,
          vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          life: life, t: life,
          c: i % 3 === 0 ? patina : (i % 3 === 1 ? color : "#f5efe0")
        });
      }
    }

    // —— HUD / 横幅 / 彩蛋 ——
    var elScore = byId("n404-inv-score"), elHi = byId("n404-inv-hi"), elWave = byId("n404-inv-wave");
    var elBanner = byId("n404-inv-banner"), elEgg = byId("n404-inv-egg");
    var eggTimer = null;

    function hudSync() {
      elScore.textContent = String(score);
      elHi.textContent = String(hi);
      elWave.textContent = String(wave);
    }

    function bannerShow(text) {
      elBanner.textContent = text;
      elBanner.removeAttribute("hidden");
      elBanner.classList.add("is-on");
    }
    function bannerHide() {
      elBanner.classList.remove("is-on");
      elBanner.setAttribute("hidden", "hidden");
    }
    function eggShow(text) {
      window.clearTimeout(eggTimer);
      elEgg.textContent = text;
      elEgg.removeAttribute("hidden");
      elEgg.classList.add("is-on");
      eggTimer = window.setTimeout(function () {
        elEgg.classList.remove("is-on");
        eggTimer = window.setTimeout(function () {
          elEgg.setAttribute("hidden", "hidden");
        }, 480);
      }, 3800);
    }
    function eggHide() {
      window.clearTimeout(eggTimer);
      elEgg.classList.remove("is-on");
      elEgg.setAttribute("hidden", "hidden");
    }

    function addScore(n) {
      score += n;
      if (score > hi) {
        hi = score;
        try { window.localStorage.setItem("n404-inv-hi", String(hi)); } catch (e) {}
      }
      hudSync();
      for (var i = 0; i < EGGS_TH.length; i++) {
        var th = EGGS_TH[i];
        if (score >= th && !eggsFired[th]) {
          eggsFired[th] = true;
          eggShow(T.eggs[th]);
        }
      }
    }

    // —— 世界规则 ——
    function step() {
      var b = bounds();
      if (!b) { return; }
      var x0 = b.x0 + dir * STEP_X, x1 = b.x1 + dir * STEP_X;
      if (x0 < 8 || x1 > W - 8) { dir = -dir; fy += DROP_Y; }
      else { fx += dir * STEP_X; }
      frameIdx = frameIdx ? 0 : 1;
      tone([112, 106, 100, 94][marchIdx++ % 4], 0, 0.09, "square", 0.7);
      var b2 = bounds();
      if (b2 && b2.bottom >= 572) { gameOver(); } // 攻破防线
    }

    function enemyFire() {
      if (eB.length >= Math.min(3 + wave, 7)) { return; }
      var low = [];
      for (var i = 0; i < grid.length; i++) {
        var g = grid[i];
        if (!g.alive) { continue; }
        if (!low[g.c] || g.r > low[g.c].r) { low[g.c] = g; }
      }
      var shooters = [];
      for (var j = 0; j < low.length; j++) { if (low[j]) { shooters.push(low[j]); } }
      if (!shooters.length) { return; }
      var s = cellRect(shooters[Math.floor(Math.random() * shooters.length)]);
      eB.push({
        x: s.x + s.w / 2 - 1.5,
        y: s.y + s.h,
        v: Math.min(260, 150 + (wave - 1) * 15)
      });
      fireT = (0.55 + Math.random() * 0.9) * Math.max(0.5, 1 - (wave - 1) * 0.07);
    }

    function playerHit() {
      if (state !== "playing") { return; }
      lives--;
      burst(player.x + player.w / 2, player.y + 14, PAL.mint, 16);
      tone(180, 40, 0.4, "sawtooth", 0.8);
      state = "dying";
      dyingT = 1.0;
    }

    function waveClear() {
      state = "wave";
      waveT = 1.2;
      pB = null;
      eB.length = 0;
      ufo = null;
      ufoT = 9 + Math.random() * 8;
      bannerShow(T.wave.replace("{n}", String(wave + 1)));
      tone(523, 0, 0.1, "square", 0.55);
      tone(784, 0, 0.14, "square", 0.55, 0.12);
    }

    function gameOver() {
      state = "over";
      if (score > hi) {
        hi = score;
        try { window.localStorage.setItem("n404-inv-hi", String(hi)); } catch (e) {}
      }
      hudSync();
      byId("n404-inv-over-s").textContent =
        T.over.sub.replace("{score}", String(score)).replace("{hi}", String(hi));
      byId("n404-inv-scr-over").removeAttribute("hidden");
      burst(player.x + player.w / 2, player.y + 14, PAL.mint, 20);
      tone(196, 40, 0.55, "sawtooth", 0.8);
      try { byId("n404-inv-again").focus(); } catch (e) {}
    }

    function startGame() {
      score = 0;
      lives = 3;
      wave = 1;
      eggsFired = {};
      buildFormation();
      player.x = (W - player.w) / 2;
      pB = null;
      eB.length = 0;
      parts.length = 0;
      ufo = null;
      ufoT = 8 + Math.random() * 8;
      fireT = 1.4;
      byId("n404-inv-scr-start").setAttribute("hidden", "hidden");
      byId("n404-inv-scr-over").setAttribute("hidden", "hidden");
      bannerHide();
      eggHide();
      hudSync();
      state = "playing";
      audio(); // 在用户手势里解锁 WebAudio
      if (!rafOn) { rafOn = true; last = 0; window.requestAnimationFrame(loop); }
    }

    function movePlayer(dt) {
      var sp = 260 * dt;
      var dx = 0;
      if (keys.l) { dx -= sp; }
      if (keys.r) { dx += sp; }
      if (ptr.on) {
        var want = ptr.x - (player.x + player.w / 2);
        dx = want > sp ? sp : (want < -sp ? -sp : want);
      }
      player.x += dx;
      if (player.x < 4) { player.x = 4; }
      if (player.x > W - player.w - 4) { player.x = W - player.w - 4; }
    }

    function update(dt) {
      var i, g;
      for (i = 0; i < stars.length; i++) {
        var s = stars[i];
        s.y += s.v * dt;
        if (s.y > H) { s.y -= H + 2; s.x = Math.random() * W; }
      }
      for (i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) { parts.splice(i, 1); }
      }

      if (state === "playing") {
        movePlayer(dt);
        if ((keys.f || ptr.on) && !pB) {
          pB = { x: player.x + player.w / 2 - 1.5, y: player.y - 12 };
          tone(900, 240, 0.09, "square", 0.4);
        }
        if (pB) {
          pB.y -= 520 * dt;
          if (pB.y < -14) { pB = null; }
          else {
            for (i = 0; i < grid.length && pB; i++) {
              g = grid[i];
              if (!g.alive) { continue; }
              var cr = cellRect(g);
              if (hit(pB.x, pB.y, 3, 12, cr.x, cr.y, cr.w, cr.h)) {
                g.alive = false;
                alive--;
                addScore(TYPE_PTS[g.t]);
                burst(cr.x + cr.w / 2, cr.y + 16, PAL.enemy);
                tone(330, 140, 0.08, "square", 0.6);
                pB = null;
                if (alive === 0) { waveClear(); }
              }
            }
            if (pB && ufo && hit(pB.x, pB.y, 3, 12, ufo.x, ufo.y, 64, 28)) {
              addScore(ufo.pts);
              burst(ufo.x + 32, ufo.y + 14, PAL.gold, 14);
              tone(660, 1320, 0.2, "square", 0.6);
              ufo = null;
              ufoT = 11 + Math.random() * 10;
              pB = null;
            }
          }
        }
        if (state !== "playing") { return; } // 清版已在上面切状态
        stepT -= dt;
        if (stepT <= 0) {
          step();
          if (state !== "playing") { return; } // 攻破防线
          stepT = Math.max(0.05, baseGap * (alive / total) + 0.04);
        }
        fireT -= dt;
        if (fireT <= 0) { enemyFire(); }
        for (i = eB.length - 1; i >= 0; i--) {
          var eb = eB[i];
          eb.y += eb.v * dt;
          if (eb.y > H) { eB.splice(i, 1); continue; }
          if (state === "playing" &&
              hit(eb.x, eb.y, 3, 10, player.x + 6, player.y + 2, player.w - 12, player.h)) {
            eB.splice(i, 1);
            playerHit();
          }
        }
        if (state !== "playing") { return; }
        ufoT -= dt;
        if (!ufo && ufoT <= 0) {
          ufoDir = -ufoDir;
          ufo = {
            x: ufoDir > 0 ? -64 : W + 2,
            y: 40,
            v: ufoDir * 88,
            pts: [50, 100, 150][Math.floor(Math.random() * 3)]
          };
        }
        if (ufo) {
          ufo.x += ufo.v * dt;
          ufoNote -= dt;
          if (ufoNote <= 0) {
            tone(ufoDir > 0 ? 740 : 560, 0, 0.08, "square", 0.5);
            ufoNote = 0.16;
          }
          if (ufo.x < -70 || ufo.x > W + 10) { ufo = null; ufoT = 11 + Math.random() * 10; }
        }
      } else if (state === "dying") {
        dyingT -= dt;
        if (dyingT <= 0) {
          if (lives > 0) {
            player.x = (W - player.w) / 2;
            eB.length = 0; // 复位清场，别刚落地就挨第二枪
            state = "playing";
          } else {
            gameOver();
          }
        }
      } else if (state === "wave") {
        waveT -= dt;
        if (waveT <= 0) {
          wave++;
          buildFormation();
          bannerHide();
          hudSync();
          state = "playing";
        }
      }
    }

    function draw() {
      var i, g;
      ctx.fillStyle = PAL.space;
      ctx.fillRect(0, 0, W, H);
      for (i = 0; i < stars.length; i++) {
        var s = stars[i];
        ctx.globalAlpha = s.a;
        ctx.fillStyle = "#cfd8dd";
        ctx.fillRect(Math.round(s.x), Math.round(s.y), s.s, s.s);
      }
      ctx.globalAlpha = 1;
      // 防线
      ctx.fillStyle = "rgba(255, 143, 107, 0.3)";
      ctx.fillRect(0, 620, W, 2);
      // 编队
      for (i = 0; i < grid.length; i++) {
        g = grid[i];
        if (!g.alive) { continue; }
        var cr = cellRect(g);
        ctx.drawImage(enSpr[g.t][frameIdx], Math.round(cr.x), Math.round(cr.y), cr.w, cr.h);
      }
      if (ufo) {
        ctx.drawImage(ufoSpr, Math.round(ufo.x), Math.round(ufo.y), 64, 28);
      }
      var showPlayer = state !== "over" &&
        !(state === "dying" && Math.floor(dyingT * 12) % 2 === 0);
      if (showPlayer) {
        ctx.drawImage(shipSpr, Math.round(player.x), Math.round(player.y), player.w, player.h);
      }
      if (pB) {
        ctx.fillStyle = PAL.mint;
        ctx.fillRect(Math.round(pB.x), Math.round(pB.y), 3, 12);
      }
      ctx.fillStyle = PAL.coral;
      for (i = 0; i < eB.length; i++) {
        ctx.fillRect(Math.round(eB[i].x), Math.round(eB[i].y), 3, 10);
      }
      if (state !== "over") {
        for (i = 0; i < lives; i++) {
          ctx.drawImage(shipSpr, 6 + i * 32, 624, 26, 14); // 半尺寸的小机队
        }
      }
      for (i = 0; i < parts.length; i++) {
        var p2 = parts[i];
        ctx.globalAlpha = Math.max(0, p2.life / p2.t);
        ctx.fillStyle = p2.c;
        ctx.fillRect(Math.round(p2.x), Math.round(p2.y), 3, 3);
      }
      ctx.globalAlpha = 1;
    }

    var last = 0, rafOn = false;
    function loop(ts) {
      var dt = last ? Math.min(0.05, Math.max(0.001, (ts - last) / 1000)) : 0.016;
      last = ts;
      update(dt);
      draw();
      window.requestAnimationFrame(loop);
    }

    // —— 输入 ——
    function onScreen() {
      var r = gameEl.getBoundingClientRect();
      return r.bottom > 0 && r.top < (window.innerHeight || 800);
    }

    window.addEventListener("keydown", function (e) {
      var t = e.target;
      if (t && t.closest && t.closest("a,button,input,textarea,select")) { return; }
      var k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") { keys.l = true; }
      else if (k === "ArrowRight" || k === "d" || k === "D") { keys.r = true; }
      else if (k === " " || k === "Spacebar" || k === "ArrowUp" || k === "j" || k === "J") { keys.f = true; }

      if (state === "playing" || state === "dying" || state === "wave") {
        if (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" ||
            k === " " || k === "Spacebar") { e.preventDefault(); }
      } else if ((k === " " || k === "Enter") && onScreen()) {
        e.preventDefault(); // 开始 / 再来一局
        startGame();
      }
    });
    window.addEventListener("keyup", function (e) {
      var k = e.key;
      if (k === "ArrowLeft" || k === "a" || k === "A") { keys.l = false; }
      else if (k === "ArrowRight" || k === "d" || k === "D") { keys.r = false; }
      else if (k === " " || k === "Spacebar" || k === "ArrowUp" || k === "j" || k === "J") { keys.f = false; }
    });
    window.addEventListener("blur", function () {
      keys.l = false;
      keys.r = false;
      keys.f = false;
      ptr.on = false;
    });

    function ptrTo(e) {
      var r = canvas.getBoundingClientRect();
      ptr.x = (e.clientX - r.left) / (r.width || 1) * W;
    }
    canvas.addEventListener("pointerdown", function (e) {
      if (state !== "playing" || (e.button !== undefined && e.button !== 0)) { return; }
      if (canvas.setPointerCapture) {
        try { canvas.setPointerCapture(e.pointerId); } catch (er) {}
      }
      ptr.on = true;
      ptrTo(e);
      e.preventDefault();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!ptr.on) { return; }
      ptrTo(e);
      e.preventDefault();
    });
    window.addEventListener("pointerup", function () { ptr.on = false; });
    window.addEventListener("pointercancel", function () { ptr.on = false; });
    canvas.addEventListener("contextmenu", function (e) {
      if (state === "playing") { e.preventDefault(); }
    });

    byId("n404-inv-start").addEventListener("click", startGame);
    byId("n404-inv-again").addEventListener("click", startGame);

    // —— 开张：烘焙、落位、静帧亮相（RAF 等第一次点「开始」才转）——
    buildFormation();
    hudSync();
    gameEl.removeAttribute("hidden");
    draw();
  })();
