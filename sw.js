---
layout: null
sitemap: false
---
/* service worker —— PWA 离线与缓存策略的完整裁决书。
 *
 * 本文件是 Jekyll 模板：每次构建都会以 site.time 重新注入 VERSION，
 * 内容一变浏览器就知道有新版本。策略总纲与红线：
 *
 * · 「Site last updated」这类动态字样（首页页脚）语义不能被旧缓存糊弄，
 *   所以 HTML 一律 network-first：在线时永远拿最新页面；
 * · 静态产物（css/js/字体/图标图片）按内容寻址天然稳定（构建统计都带
 *   校验，min 文件名固定但 build 有 min-sync 守门），stale-while-revalidate:
 *   命中即用、后台换新，离线找得到，在线也不比网络慢；
 * · 跨域一律不碰 —— 第三方资源与 analytics Worker 不进缓存；
 * · 离线兜底：导航请求网络超时/失败时回落到缓存的首页快照（比白屏强，
 *   比假在线诚实——顶部 banner 之外保持本页原样）。
 */
const VERSION = 'v{{ site.time | date: "%Y%m%d%H%M" }}';
const CACHE_NAME = 'nju-' + VERSION;
const OFFLINE_URLS = [
    '/',
    '/cv/',
    '/timeline/',
    '/en/',
    '/en/cv/',
    '/404.html',
    '/images/manifest.json',
    '/images/favicon-32x32.png',
    '/images/favicon-192x192.png',
    '/images/favicon-512x512.png',
    '/images/favicon.ico',
    '/images/apple-touch-icon-180x180.png',
    '/assets/css/main.css',
    '/assets/js/main.min.js',
    '/assets/js/han.min.js',
    '/assets/js/vivus.min.js',
    '/assets/js/n404.min.js',
    '/assets/webfonts/fa-solid-900.woff2',
    '/assets/webfonts/fa-brands-400.woff2',
];

/* install：核心资源一次性预缓存。任何一个 404 都等于缓存残废，直接让
   install 失败（自净：无残留半成品缓存），下一轮访问重试。 */
self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function (cache) { return cache.addAll(OFFLINE_URLS); })
            .then(function () { return self.skipWaiting(); })
    );
});

/* activate：清掉所有旧版本缓存（版本号一换就是新名），接管全部客户端。 */
self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys()
            .then(function (keys) {
                return Promise.all(keys.map(function (key) {
                    return key !== CACHE_NAME ? caches.delete(key) : null;
                }));
            })
            .then(function () { return self.clients.claim(); })
    );
});

/* 静态产物的判定：按扩展名一刀切，比逐条白名单好养。 */
function isAssetUrl(url) {
    return /\.(?:css|js|woff2?|ttf|png|webp|jpg|jpeg|svg|ico|json)$/.test(url.pathname);
}

self.addEventListener('fetch', function (event) {
    var request = event.request;

    /* 只管同源 GET —— analytics Worker 的 POST、外链 CDN、OAuth 回流全都不插手。 */
    if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) {
        return;
    }

    /* 导航（地址栏点击)：network-first。在线 3 秒内的 fetch 拿下就用真页面，
       超时或离线（fetch 会 reject —— race 里必须吞掉它，否则离线的
       navigation 直接 ERR_FAILED）→ 缓存里找这个 URL，找不到回落首页
       快照（还有 404.html 做最后保险）。这一层保证了页脚「last updated」
       永远是新鲜的。 */
    if (request.mode === 'navigate') {
        event.respondWith(
            Promise.race([
                /* 挂在 race 里的 fetch 永不许 reject：失败就当「网络不行」，
                   让超时兜底与缓存兜底接手 */
                fetch(request).then(undefined, function () { return null; }),
                new Promise(function (resolve) {
                    setTimeout(function () { resolve(null); }, 3300);
                }),
            ]).then(function (fresh) {
                if (fresh) {
                    /* 捎带着把该导航对应快照预存一份，下次离线找得到 */
                    var copy = fresh.clone();
                    caches.open(CACHE_NAME).then(function (cache) { cache.put(request, copy); });
                    return fresh;
                }
                return fromCacheOrHome(request);
            })
        );
        return;
    }

    /* 静态资产：stale-while-revalidate。 */
    if (isAssetUrl(new URL(request.url))) {
        event.respondWith(
            caches.open(CACHE_NAME).then(function (cache) {
                return cache.match(request).then(function (cached) {
                    var refresh = fetch(request).then(function (fresh) {
                        if (fresh && fresh.ok) cache.put(request, fresh.clone());
                        return fresh;
                    }).catch(function () { return null; });
                    return cached || refresh;
                });
            })
        );
        return;
    }

    /* 其余同源请求（s 条目、xml 等）：网络优先读，失败给缓存找找。 */
    event.respondWith(
        fetch(request).then(function (fresh) {
            return fresh;
        }).catch(function () {
            return caches.match(request).then(function (cached) {
                return cached || Response.error();
            });
        })
    );
});

function fromCacheOrHome(request) {
    return caches.match(request, { ignoreSearch: false }).then(function (cached) {
        if (cached) return cached;
        return caches.match('/').then(function (home) {
            return home || caches.match('/404.html').then(function (nf) { return nf || Response.error(); });
        });
    });
}
