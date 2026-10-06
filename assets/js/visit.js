/* ==========================================================================
   第一方访客打点（assets/js/visit.js）
   --------------------------------------------------------------------------
   端点从自己的 script 标签上读：<script src=… async data-endpoint="…">
   由 _includes/scripts.html 输出，而那个 include 只在 _config.yml 的
   analytics.visit_endpoint 非空时才输出本文件 —— 端点留空 = 全站不打点。

   三条原则：
   1. **坏了也不能影响访客。** 独立文件、async、全部包在 try/catch 里，
      端点 404、被拦网、返回 500，页面都当没这回事（async 脚本失败本来也
      不阻塞渲染）。
   2. **不写 cookie、不用 localStorage、不引第三方脚本。** 一次请求就是全部。
   3. **尊重 Do Not Track / Global Privacy Control。** 命中就直接不上报，
      连请求都不发 —— 这既是礼貌也是《个人信息保护法》下最省事的做法。
      服务端另外认一道 DNT: 1 的 header，挡住手工绕过前端的调用。
   --------------------------------------------------------------------------
   发出去的字段刻意很少：p 路径、r referrer、l 界面语言。IP、时间、国家、
   城市都是服务端从 Cloudflare 请求本身拿的，前端不传、也不该有。
   查询串会在服务端被丢掉（路径只留 pathname + hash）。
   ========================================================================== */
(function () {
  "use strict";
  try {
    var self = document.currentScript;
    var endpoint = self && self.getAttribute("data-endpoint");
    if (!endpoint) return;

    // 本地预览 / file:// 不打点，免得开发机的访问混进统计
    var host = location.hostname;
    if (location.protocol === "file:" || host === "localhost" || host === "127.0.0.1" || !host) return;

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
