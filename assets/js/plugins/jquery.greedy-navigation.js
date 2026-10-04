/*
* Greedy Navigation
*
* http://codepen.io/lukejacksonn/pen/PwmwWV
*
*/

var $nav = $('#site-nav');
// 只取直接子级的那个汉堡按钮：用 '#site-nav button' 会把主题切换按钮一起选中，
// 而下面 addClass('hidden') 是无差别地加给这批按钮的 —— 主题按钮会被一起藏掉。
var $btn = $('#site-nav > button');
var $vlinks = $('#site-nav .visible-links');
var $vlinks_persist_tail = $vlinks.children("*.persist.tail");
var $hlinks = $('#site-nav .hidden-links');

var breaks = [];

function updateNav() {

  var availableSpace = $btn.hasClass('hidden') ? $nav.width() : $nav.width() - $btn.width() - 30;

  // The visible list is overflowing the nav
  if ($vlinks.width() > availableSpace) {

    while ($vlinks.width() > availableSpace && $vlinks.children("*:not(.persist)").length > 0) {
      // Record the width of the list
      breaks.push($vlinks.width());

      // Move item to the hidden list
      $vlinks.children("*:not(.persist)").last().prependTo($hlinks);

      availableSpace = $btn.hasClass("hidden") ? $nav.width() : $nav.width() - $btn.width() - 30;

      // Show the dropdown btn
      $btn.removeClass("hidden");
    }

    // The visible list is not overflowing
  } else {

    // There is space for another item in the nav
    while (breaks.length > 0 && availableSpace > breaks[breaks.length - 1]) {
      // Move the item to the visible list
      if ($vlinks_persist_tail.children().length > 0) {
        $hlinks.children().first().insertBefore($vlinks_persist_tail);
      } else {
        $hlinks.children().first().appendTo($vlinks);
      }
      breaks.pop();
    }

    // Hide the dropdown btn if hidden list is empty
    if (breaks.length < 1) {
      $btn.addClass('hidden');
      $btn.removeClass('close');
      $hlinks.addClass('hidden');
    }
  }

  // Keep counter updated
  $btn.attr("count", breaks.length);

  // Update masthead height and the body/sidebar top padding
  // 顶栏是 fit-content，真实高度随根字号与字体回退而变（18px 根字号下
  // 约 55.6px，scss 里的 $masthead-height 只是近似兜底），所以每轮都量
  // 一次：body 的上内边距照旧内联覆盖，另外把实测值写成 --han-masthead-h
  // 供 CSS 取用（.sidebar.is-fit 的 padding-top 就是靠它让开顶栏）。
  // 侧栏自身不再内联 padding —— 原主题里 .sidebar 恒为 fixed 才需要，
  // 本站改成 fit 门控（流式 / 固定两态，见 _sidebar.scss 与 han.js 第 9 节），
  // 无条件加这段内边距会在流式态凭空多出 55px 空白、把头像压到很低。
  var mastheadHeight = $('.masthead').outerHeight() || 0;
  if (mastheadHeight > 0) {
    $('body').css('padding-top', mastheadHeight + 'px');
    document.documentElement.style.setProperty('--han-masthead-h', mastheadHeight + 'px');
  }

}

// Window listeners

$(window).on('resize', function () {
  updateNav();
});
// screen.orientation 在 Safari / iOS 16.4 以下（2023 年 3 月才支持）不存在，
// 直接 addEventListener 会抛错。main.min.js 是整包 type="module"，模块顶层一
// 旦抛错，后面的代码（setTheme、主题按钮、联系方式按钮）全都不执行 —— 表现就
// 是「换到这台设备上主题永远是亮的、按钮点不动」，所以先判存在。
if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) {
  window.screen.orientation.addEventListener("change", function () {
    updateNav();
  });
}

$btn.on('click', function () {
  $hlinks.toggleClass('hidden');
  $(this).toggleClass('close');
});

updateNav();