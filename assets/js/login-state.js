/* ==========================================================================
   顶栏登录按钮的两态切换（_includes/masthead.html 的 #login-link）
   --------------------------------------------------------------------------
   登录态用的是 **Decap 自己的那份 localStorage**（键 `decap-cms-user`，
   decap-cms 3.x 的 authStore：登录成功后写入 JSON，退出登录 removeItem
   同一个键 —— 我们只是读它、退出时清它，不另起炉灶存第二份）。

   · 未登录（默认渲染，JS 不跑也是这个态）：人像图标（fa-circle-user，
     中性「账号」语义，不再拿 GitHub 品牌当登录入口的门面），点击跳 /admin/；
   · 已登录：换回登录图标（fa-right-to-bracket），aria/title 换成「退出登录」，
     点击弹一次确认，确认后清键、当场切回未登录态（不整页刷新）；
   · 另开标签页登录/退出（storage 事件）也同步过来。

   三条原则与 visit.js 一致：坏了不能影响访客（全程 try/catch、缺元素就
   静默退出）、不写自己的存储、不发任何网络请求。
   ========================================================================== */
(function () {
  "use strict";

  var STORAGE_KEY = "decap-cms-user"; // Decap authStore.storageKey
  var ICON_OUT = "fa-solid fa-circle-user"; // 未登录：人像图标
  var ICON_IN = "fa-solid fa-right-to-bracket"; // 已登录：登录图标（即上线前的原样）

  function readStoredUser() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var user = JSON.parse(raw);
      return user && typeof user === "object" ? user : null;
    } catch (err) {
      return null; // 脏数据当未登录，不抛
    }
  }

  function clearStoredUser() {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      /* 隐私模式之类：清不掉就保持原状，不报错 */
    }
  }

  function findControls() {
    var li = document.getElementById("login-link");
    if (!li) return null;
    var a = li.querySelector("a");
    var icon = a && a.querySelector("i");
    return a && icon ? { a: a, icon: icon } : null;
  }

  function applyState(ctl) {
    var loggedIn = readStoredUser() !== null;
    var label = loggedIn ? ctl.a.getAttribute("data-logout-label") : ctl.a.getAttribute("data-login-label");
    ctl.icon.className = loggedIn ? ICON_IN : ICON_OUT;
    ctl.a.setAttribute("data-state", loggedIn ? "in" : "out");
    if (label) {
      ctl.a.setAttribute("aria-label", label);
      ctl.a.setAttribute("title", label);
    }
    return loggedIn;
  }

  function boot() {
    var ctl = findControls();
    if (!ctl) return;

    applyState(ctl);

    ctl.a.addEventListener("click", function (event) {
      // 未登录 → 不拦，正常跳 /admin/；已登录 → 拦下跳转，改为退出
      if (!readStoredUser()) return;
      event.preventDefault();
      var confirmText = ctl.a.getAttribute("data-logout-confirm") || "退出登录？";
      if (!window.confirm(confirmText)) return;
      clearStoredUser();
      applyState(ctl);
    });

    // 另一个标签页里 Decap 登录/退出时，这边的按钮跟着变
    window.addEventListener("storage", function (event) {
      if (!event || event.key === STORAGE_KEY || event.key === null) applyState(ctl);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
