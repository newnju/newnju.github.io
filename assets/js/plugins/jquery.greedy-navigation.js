/*
* Greedy Navigation
*
* 原版是 jQuery 实现（http://codepen.io/lukejacksonn/pen/PwmwWV）。
* 本站已把 jQuery 整体去掉，这个文件改写成原生 DOM，行为逐条对齐：
*   .width()        → 盒宽要减掉 padding/border（jQuery 的 .width() 永远给内容宽）
*   .children(sel)  → 过滤子元素
*   .prependTo/.appendTo/.insertBefore → prepend/append/before
*   .hasClass/.addClass/.removeClass   → classList
* .outerHeight() 用 getBoundingClientRect（要小数，jQuery 同理），
* 因为 --han-masthead-h 与 body 的 padding-top 都靠它，侧栏 is-fit 让位要用。
*/

// 只取直接子级的那个汉堡按钮：用 '#site-nav button' 会把主题切换按钮一起选中，
// 而下面加 hidden 类是无差别地加给这批按钮的 —— 主题按钮会被一起藏掉。
var nav = document.getElementById('site-nav');
var btn = document.querySelector('#site-nav > button');
var vlinks = document.querySelector('#site-nav .visible-links');
var hlinks = document.querySelector('#site-nav .hidden-links');

// jQuery 的 .width() 返回的是内容宽（永远不含 padding 与 border），
// 直接用 getBoundingClientRect 会在有内边距的顶栏上算宽几 px，折叠点就偏了。
function contentWidth(el) {
  if (!el) return 0;
  var cs = window.getComputedStyle(el);
  var rect = el.getBoundingClientRect().width;
  var extra =
    (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) +
    (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0);
  return rect - extra;
}

function kids(el) { return el ? Array.prototype.slice.call(el.children) : []; }
function foldableKids() { return kids(vlinks).filter(function (n) { return !n.classList.contains('persist'); }); }
function persistTail() { return kids(vlinks).filter(function (n) { return n.classList.contains('persist') && n.classList.contains('tail'); }); }

var breaks = [];

function updateNav() {
  if (!nav || !btn || !vlinks || !hlinks) return;

  var btnHidden = btn.classList.contains('hidden');
  var availableSpace = btnHidden ? contentWidth(nav) : contentWidth(nav) - contentWidth(btn) - 30;

  // 可见列表把顶栏撑破了
  if (contentWidth(vlinks) > availableSpace) {
    while (contentWidth(vlinks) > availableSpace && foldableKids().length > 0) {
      // 记下当前宽度，用来判断拉宽之后能不能把条目放回来
      breaks.push(contentWidth(vlinks));

      // 把最后一个可折的条目挪进隐藏列表
      var movable = foldableKids();
      hlinks.prepend(movable[movable.length - 1]);

      btnHidden = btn.classList.contains('hidden');
      availableSpace = btnHidden ? contentWidth(nav) : contentWidth(nav) - contentWidth(btn) - 30;

      // 把下拉按钮露出来
      btn.classList.remove('hidden');
    }
  } else {
    // 还有空间，往回放
    while (breaks.length > 0 && availableSpace > breaks[breaks.length - 1]) {
      var tail = persistTail();
      var back = hlinks.firstElementChild;
      if (back) {
        if (tail.length > 0) tail[0].before(back);
        else vlinks.appendChild(back);
      }
      breaks.pop();
      btnHidden = btn.classList.contains('hidden');
      availableSpace = btnHidden ? contentWidth(nav) : contentWidth(nav) - contentWidth(btn) - 30;
    }

    // 隐藏列表空了就把下拉按钮收起来
    if (breaks.length < 1) {
      btn.classList.add('hidden');
      btn.classList.remove('close');
      hlinks.classList.add('hidden');
    }
  }

  btn.setAttribute('count', breaks.length);

  // 量一次顶栏真实高度：顶栏是 fit-content，高度随根字号与字体回退而变
  // （18px 根字号下约 58.5px，scss 里的 $masthead-height 只是近似兜底）。
  // body 的上内边距照旧内联覆盖，另外把实测值写成 --han-masthead-h
  // 供 CSS 取用（.sidebar.is-fit 的 padding-top 就是靠它让开顶栏）。
  // 侧栏自身不再内联 padding —— 原主题里 .sidebar 恒为 fixed 才需要，
  // 本站改成 fit 门控（流式 / 固定两态，见 _sidebar.scss 与 han.js 第 9 节），
  // 无条件加这段内边距会在流式态凭空多出 55px 空白、把头像压到很低。
  var masthead = document.querySelector('.masthead');
  var mastheadHeight = masthead ? masthead.getBoundingClientRect().height : 0;
  if (mastheadHeight > 0) {
    document.body.style.paddingTop = mastheadHeight + 'px';
    document.documentElement.style.setProperty('--han-masthead-h', mastheadHeight + 'px');
  }
}

// 视口变化时重算
window.addEventListener('resize', function () {
  updateNav();
});
// screen.orientation 在 Safari / iOS 16.4 以下（2023 年 3 月才支持）不存在，
// 直接 addEventListener 会抛错。main.min.js 是整包 type="module"，模块顶层一
// 旦抛错，后面的代码（setTheme、主题按钮、联系方式按钮）全都不执行 —— 表现就
// 是「换到这台设备上主题永远是亮的、按钮点不动」，所以先判存在。
if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) {
  window.screen.orientation.addEventListener('change', function () {
    updateNav();
  });
}

// 展开 / 收起交给 han.js 第 2 节：那里按窄屏整体收拢、并统一管 .hidden 与
// .open。这里再绑一次 click 会把同一个类切换两遍 —— 互相抵消，菜单点了没反应。
// 本文件只保留「量宽度决定往哪折」与「量顶栏高度」两件事。

updateNav();