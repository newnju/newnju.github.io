/*
 * 图标字体子集化：只保留站点真正用到的那些字形
 * ---------------------------------------------------------------------------
 * 完整的两套 Font Awesome Free（solid + brands）是 277 KB woff2，而全站只用到
 * 十几个图标 —— 光 woff2 就占首屏传输量的三分之二。子集化后每个文件只剩几 KB，
 * 形状完全一致（同一套轮廓数据，只是没有用到的码位）。
 *
 * 做法：扫源码里出现过的 fa-* 类名 → 到 vendor 的变量表查码位 → 交给 pyftsubset。
 * 所以**加图标只要写进模板就行**，不用回来改这里；重跑 npm run fonts 即可。
 * 若临时没装 fonttools（pyftsubset 不在 PATH），脚本只报出缺哪些码位、不动文件。
 *
 * 用法：node tools/subset-fonts.js [--check]
 *   --check 只打印将使用的码位与预计体积，不写文件（CI/自查用）
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CHECK_ONLY = process.argv.indexOf("--check") !== -1;

// 会渲染图标的源码位置：模板、页面、集合、样式与脚本
// assets/js 整目录都要扫：图标类名不只出现在模板里，_main.js 切换主题时才会
// 给 #theme-icon 换上 fa-moon（页面上只有 fa-sun），漏掉它子集字体就没有月亮的
// 码位 —— 深色主题下按钮只剩一个空位。
const SCAN_DIRS = [
  "_includes", "_layouts", "_pages", "_sass",
  "_portfolio", "_talks", "_teaching", "_publications",
  "assets/js", "assets/css",
];
const SCAN_FILES = [];

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return out;
  }
  entries.forEach(function (entry) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      // vendor 下是上游整包，图标类名成千上万，不能算进来
      if (entry.name === "vendor" || entry.name === "node_modules") return;
      walk(full, out);
    } else if (/\.(html|md|scss|js)$/i.test(entry.name)) {
      out.push(full);
    }
  });
  return out;
}

const files = SCAN_DIRS.reduce(function (acc, dir) {
  return walk(path.join(ROOT, dir), acc);
}, []).concat(
  SCAN_FILES.map(function (f) {
    return path.join(ROOT, f);
  })
);

// 1. 收集用到的图标名（fa-github / fa-rss-square / fa-sun …）
const used = new Set();
files.forEach(function (file) {
  const text = fs.readFileSync(file, "utf8");
  const matches = text.match(/\bfa-([a-z0-9-]+)\b/g) || [];
  matches.forEach(function (raw) {
    used.add(raw.slice(3));
  });
});

// 2. 查码位：vendor 变量表里是 $fa-var-github: \f09b; 这种形式
const vars = fs.readFileSync(
  path.join(ROOT, "_sass/vendor/font-awesome/_variables.scss"),
  "utf8"
);
const table = {};
vars.replace(/\$fa-var-([a-z0-9-]+)\s*:\s*\\([0-9a-f]{3,6})\s*;/gi, function (_, name, hex) {
  table[name] = parseInt(hex, 16);
  return _;
});

const missing = [];
const codes = [];
Array.from(used)
  .sort()
  .forEach(function (name) {
    // fa-solid / fa-fw / fa-link 这类：link 有码位，其余是修饰类
    if (Object.prototype.hasOwnProperty.call(table, name)) {
      codes.push(table[name]);
    } else if (!/^(solid|regular|brands|fw|s|spin|pulse|border|fixed|layers|inverse|li|beat|fade|spin-reverse|rotate-by|pull-left|pull-right|stack|1x|2x|3x|4x|5x|6x|7x|8x|9x|10x|xs|sm|lg|xl|2xl|xs|normal|left|right|up|down|auto|flip|both|horizontal|vertical|rotate-180|flip-horizontal|flip-vertical|flip-both|stack-1x|stack-2x|inverse|beat|fade|spin|bounce|shake|xs|sm|lg|xl|2xl|ul|li|border|fixed|layers)$/.test(name)) {
      missing.push(name);
    }
  });

const unicodes = codes
  .filter(function (c, i, arr) {
    return arr.indexOf(c) === i;
  })
  .sort(function (a, b) {
    return a - b;
  })
  .map(function (c) {
    return "U+" + c.toString(16).toUpperCase();
  })
  .join(",");

console.log("用到的图标：" + Array.from(used).sort().join(", "));
console.log("码位（" + unicodes.split(",").length + " 个）：" + unicodes);
if (missing.length) {
  console.log("变量表里查不到的（多为修饰类，忽略）：" + missing.join(", "));
}

// 每一套字体：full 是仓库里留的完整原字（子集化的唯一来源，勿删），
// 输出 woff2 + ttf 两份到 assets/webfonts/。
// 一定要从 full 生成，不要就地子集化输出文件：就地跑第二次只会拿已经缺了
// 码位的文件再切一次，之前丢掉的字形永远回不来（fa-moon 就是这么丢的）。
const FONTS = [
  { full: "assets/webfonts/full/fa-solid-900.ttf", outputs: ["assets/webfonts/fa-solid-900.woff2", "assets/webfonts/fa-solid-900.ttf"] },
  { full: "assets/webfonts/full/fa-brands-400.ttf", outputs: ["assets/webfonts/fa-brands-400.woff2", "assets/webfonts/fa-brands-400.ttf"] },
];

if (CHECK_ONLY) {
  FONTS.forEach(function (font) {
    font.outputs.forEach(function (rel) {
      const full = path.join(ROOT, rel);
      if (fs.existsSync(full)) {
        console.log(rel + "：当前 " + fs.statSync(full).size + " 字节");
      }
    });
    const src = path.join(ROOT, font.full);
    console.log(font.full + "：完整原字 " + (fs.existsSync(src) ? fs.statSync(src).size + " 字节" : "缺失（无法重新生成子集）"));
  });
  process.exit(0);
}

// pyftsubset 没有 --version（会返回 2），用 --help 探测
function findPyftsubset() {
  const candidates = ["pyftsubset", "pyftsubset.exe"];
  for (const name of candidates) {
    try {
      execFileSync(name, ["--help"], { stdio: "ignore" });
      return name;
    } catch (e) {
      /* 试下一个 */
    }
  }
  try {
    execFileSync("python", ["-m", "fontTools.subset", "--help"], { stdio: "ignore" });
    return "python -m fontTools.subset";
  } catch (e2) {
    return null;
  }
}

const pyftsubset = findPyftsubset();
if (!pyftsubset) {
  console.log("没找到 pyftsubset（pip install fonttools brotli），字体未改动。");
  process.exit(0);
}
const parts = pyftsubset.split(" ");

FONTS.forEach(function (font) {
  const src = path.join(ROOT, font.full);
  if (!fs.existsSync(src)) {
    console.log(font.full + "：完整原字缺失，跳过这一套（子集无法生成）。");
    return;
  }
  font.outputs.forEach(function (rel) {
    const dst = path.join(ROOT, rel);
    const before = fs.existsSync(dst) ? fs.statSync(dst).size : 0;
    const tmp = dst + ".tmp";
    const args = parts.slice(1).concat([
      src,
      "--unicodes=" + unicodes,
      "--output-file=" + tmp,
      "--layout-features=*",
      "--name-IDs=*",
      "--notdef-glyph",
      "--notdef-outline",
      "--recommended-glyphs"
    ]);
    // woff2 压缩要 brotli；ttf 直接输出 sfnt，不传 --flavor
    if (rel.endsWith(".woff2")) args.push("--flavor=woff2");
    execFileSync(parts[0], args);
    const after = fs.statSync(tmp).size;
    fs.renameSync(tmp, dst);
    const saved = before
      ? "（原 " + before + " 字节，" + (before > after ? "省 " + Math.round((1 - after / before) * 100) + "%" : "变大 " + Math.round((after / before - 1) * 100) + "%") + "）"
      : "";
    console.log(path.basename(rel) + "：" + after + " 字节" + saved);
  });
});