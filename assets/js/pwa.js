/* pwa.js —— service worker 注册（唯一的 PWA 客户端入口）。
 *
 * 尺度刻意收得非常小：
 * · 仅 https 或本机（localhost / 127.0.0.1）注册 —— service worker 只在安全
 *   上下文可用，http 的失败要静默吞掉，不能打断正常访问；
 * · 只注册、不弹任何 UI。更新走「下次访问自然换版」的路数：新 SW 在安装
 *   完成前不动现役页面，用户感知零噪声（策略细节见根 sw.js 头注释）；
 * · window 的 load 事件再注册 —— 首屏关键路径（样式、字体、Canvas 图）一寸
 *   都不让给后台设施。
 */
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    window.addEventListener("load", function () {
        navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" })
            .catch(function () { /* 环境不支持就代表本站退化成普通静态站，可接受 */ });
    });
}
