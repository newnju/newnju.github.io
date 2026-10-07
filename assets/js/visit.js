/* ==========================================================================
   第一方访客打点（assets/js/visit.js）
   --------------------------------------------------------------------------
   端点从自己的 script 标签上读：<script src=… async data-endpoint="…">
   由 _includes/scripts.html 输出，而那个 include 只在 _config.yml 的
   analytics.visit_endpoint 非空时才输出本文件 —— 端点留空 = 全站不打点。

   按顺序做两件事：
   1. **填公开计数。** 页脚「本站访问量」与文章页「本文阅读」的 markup 自带
      data-summary（= visit_endpoint 把 /api/visit 换成 /api/summary），取回后
      填进 [data-fill]、揭掉整块的 hidden。这一步只**读**计数、不写任何记录，
      所以放在 DNT 判断之前 —— DNT 拦的是上报，不是看数。取不回来就保持隐藏，
      绝不显示假 0；一次请求同时喂页脚与文章页（带 data-path 的容器会把
      ?path= 拼上，响应里多一个 page_pv）。
   2. **打点。** 尊重 Do Not Track / Global Privacy Control：命中就直接不上报，
      连请求都不发 —— 这既是礼貌也是《个人信息保护法》下最省事的做法。
      服务端另外认一道 DNT: 1 的 header，挡住手工绕过前端的调用。

   三条原则不变：坏了也不能影响访客（async + 全程 try/catch）、不写 cookie /
   localStorage、不引第三方脚本 —— 一次请求就是全部。
   --------------------------------------------------------------------------
   打点发出去的字段刻意很少：p 路径、r referrer、l 界面语言。IP、时间、国家、
   城市都是服务端从 Cloudflare 请求本身拿的，前端不传、也不该有。
   查询串会在服务端被丢掉（路径只留 pathname + hash）。
   ========================================================================== */
(function () {
  "use strict";
  try {
    var self = document.currentScript;
    var endpoint = self && self.getAttribute("data-endpoint");
    if (!endpoint) return;

    // 本地预览 / file:// 不打点，免得开发机的访问混进统计（计数也一并不取）
    var host = location.hostname;
    if (location.protocol === "file:" || host === "localhost" || host === "127.0.0.1" || !host) return;

    // ---- 公开计数（/api/summary，免鉴权、只回计数） ----
    var containers = document.querySelectorAll("[data-summary]");
    if (containers.length) {
      var withPath = document.querySelector("[data-summary][data-path]");
      var summaryUrl =
        containers[0].getAttribute("data-summary") +
        (withPath ? "?path=" + encodeURIComponent(withPath.getAttribute("data-path")) : "");
      fetch(summaryUrl, { mode: "cors", credentials: "omit" })
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (d) {
          if (!d || typeof d.pv !== "number") return;
          for (var i = 0; i < containers.length; i++) {
            var box = containers[i];
            var fields = box.querySelectorAll("[data-fill]");
            var all = fields.length > 0;
            for (var j = 0; j < fields.length; j++) {
              var v = d[fields[j].getAttribute("data-fill")];
              if (typeof v !== "number") {
                all = false;
                continue;
              }
              fields[j].textContent = v.toLocaleString();
            }
            if (all) box.hidden = false;
          }
        })
        .catch(function () {});
    }

    var nav = navigator;
    var dnt =
      nav.doNotTrack === "1" ||
      window.doNotTrack === "1" ||
      nav.globalPrivacyControl === true;
    if (dnt) return;

    var payload = JSON.stringify({
      p: location.pathname + location.hash,
      r: document.referrer || undefined,
      l: (nav.language || "").slice(0, 16),
    });

    // keepalive：页面可能马上被关掉，fetch 不带这个参数请求会被丢掉。
    // credentials: "omit" —— 不带 cookie；cache: "no-store" —— 别进缓存。
    fetch(endpoint, {
      method: "POST",
      body: payload,
      headers: { "content-type": "text/json" },
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      keepalive: true,
    }).catch(function () {});
  } catch (e) {
    /* 统计永远不该把页面弄坏 */
  }
})();
