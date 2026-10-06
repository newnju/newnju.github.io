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
 * 用法：node tools/subset-fonts.js [--check] [--audit]
 *   --check 只打印将使用的码位与预计体积，不写文件（CI/自查用）
 *   --audit 只查「图标家族对不对得上」，纯文本分析、不要 Python，退出码非 0 即有问题
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const argv = process.argv.slice(2);
const CHECK_ONLY = argv.indexOf("--check") !== -1;
const AUDIT_ONLY = argv.indexOf("--audit") !== -1;

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

// 3. 家族审计：fab / fas 写错字形就只剩一个豆腐块，构建成功、截图也看不出来。
//    页脚那个「订阅」图标就踩过：Font Awesome 6 里 fa-rss-square 已经改名成
//    fa-square-rss 并搬进 solid 那套字体，模板却还按 FA5 的习惯写 fab，
//    brands 字体里没有这个字形 → 页脚上是一个空框。
//    这里不读字体文件，只比对「类名属于哪张图标表」：solid.scss 生成 $fa-icons
//    里的类名，brands.scss 生成 $fa-brand-icons 里的，两张表互不相干。
//    （字形是否真在字体里由 --check 之外的 pyftsubset 那一半负责。）
function auditFamilies(files) {
  const vars = fs.readFileSync(
    path.join(ROOT, "_sass/vendor/font-awesome/_variables.scss"),
    "utf8"
  );
  const slice = (from, to) => {
    const i = vars.indexOf(from);
    const j = to ? vars.indexOf(to, i) : vars.length;
    return new Set((vars.slice(i, j).match(/"([a-z0-9-]+)"\s*:/g) || []).map((s) => s.slice(1, -2)));
  };
  const SOLID = slice("$fa-icons:", "$fa-brand-icons:");
  const BRANDS = slice("$fa-brand-icons:");

  // 家族前缀 → 期望的图标表。裸 fa 是 FA4 写法，这里按 solid 算（FA6 的 .fa
  // 本来就回落到 Free 那套）；fal（duotone）本站没编译字体，不参与。
  const FAMILY = { fab: BRANDS, fas: SOLID, far: SOLID, fa: SOLID };
  const USAGE = /class="([^"]*\bfa-[^"]*)"/g;
  // 修饰类（fa-fw / fa-spin / fa-3x …）不带字形，别当图标查
  const MODIFIER = /^(solid|regular|brands|duotone|fw|li|ul|s|spin|spin-reverse|pulse|beat|fade|bounce|shake|border|fixed|layers|inverse|stack|normal|auto|left|right|up|down|horizontal|vertical|both|flip|rotate|rotate-180|rotate-by|flip-horizontal|flip-vertical|flip-both|pull-left|pull-right|[1-9]x|10x|xs|sm|lg|xl|2xl)$/;

  const problems = [];
  let seen = 0;
  let skipped = 0;
  files.forEach((file) => {
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    const text = fs.readFileSync(file, "utf8");
    let m;
    while ((m = USAGE.exec(text))) {
      const classes = m[1].split(/\s+/);
      // 先找具体家族（fab/fas/far），再退回裸 fa —— 一个元素上可能同时写了
      // `fa fab fa-github`，按出现顺序取会把裸 fa 抢在前面
      const family =
        ["fab", "fas", "far"].find((c) => classes.includes(c)) ||
        (classes.includes("fa") ? "fa" : null);
      if (!family) continue;
      const table = FAMILY[family];
      classes
        .filter((c) => c.startsWith("fa-") && !Object.prototype.hasOwnProperty.call(FAMILY, c))
        .forEach((icon) => {
          const name = icon.slice(3);
          if (MODIFIER.test(name)) {
            skipped++;
            return;
          }
          seen++;
          const line = text.slice(0, m.index).split("\n").length;
          if (!table.has(name)) {
            const other = table === BRANDS ? SOLID : BRANDS;
            const hint = other.has(name)
              ? `它是 ${table === BRANDS ? "solid" : "brands"} 图标，要写成 ${
                  table === BRANDS ? "fas" : "fab"
                } fa-${name}`
              : `两张图标表里都没有 fa-${name}`;
            problems.push(`${rel}:${line}  ${family} fa-${name}  —— ${hint}`);
          }
        });
    }
  });

  if (!seen) {
    console.log("audit: 没扫到任何带家族前缀的 fa-* 图标用法");
    return 0;
  }
  if (!problems.length) {
    console.log(
      `audit: ${seen} 处「家族 + 图标」用法都对得上（修饰类 ${skipped} 处已跳过）`
    );
    return 0;
  }
  console.error(`audit: ${problems.length} 处家族写错，页面上会是一个豆腐块：`);
  Array.from(new Set(problems)).forEach((p) => console.error("  x " + p));
  return 1;
}

if (AUDIT_ONLY) {
  process.exit(auditFamilies(files));
}

// 1. 收集用到的图标名（fa-github / fa-rss-square / fa-sun …）
const used = new Set();
files.forEach(function (file) {
  const text = fs.readFileSync(file, "utf8");
  const re = /\bfa-([a-z0-9-]+)\b/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    // $fa-icons / $fa-brand-icons 这类 Sass 变量名不是图标类名；其中的
    // icons 恰好还是真图标（\f86d），不拦会凭空多编一条规则、多打一个字形。
    if (m.index > 0 && text.charCodeAt(m.index - 1) === 36) continue;
    used.add(m[1]);
  }
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

// 2.5 站点图标名单（_sass/_icon-names.scss）：fontawesome.css 只编译用到的图标。
//     两本表在 _variables.scss 里各是一段 ("name": $fa-var-x, …)：取段内所有键
//     与 used 求交集。没进表的名字（fa-fw 这类修饰类、fa-brands-400.woff2 这类
//     文件名、_utilities.scss 里遗留的旧色名）本来就没有上游图标规则，丢掉即可。
//     这份名单与字体子集出自同一次扫描，漏一个名字会字体与 CSS 一起缺。
function mapKeys(from, to) {
  const i = vars.indexOf(from);
  const j = to ? vars.indexOf(to, i) : vars.length;
  return new Set((vars.slice(i, j).match(/"([a-z0-9-]+)"\s*:/g) || []).map((s) => s.slice(1, -2)));
}
const solidKeys = mapKeys("$fa-icons:", "$fa-brand-icons:");
const brandKeys = mapKeys("$fa-brand-icons:");
const siteSolid = Array.from(used).filter((n) => solidKeys.has(n)).sort();
const siteBrands = Array.from(used).filter((n) => brandKeys.has(n)).sort();

const iconNames = [
  "/*",
  " * 生成物：npm run fonts（tools/subset-fonts.js）产出，勿手改。",
  " * 全站用到的图标名单，与字体子集出自同一次扫描 —— 加图标只要写进模板，",
  " * 重跑 npm run fonts 即可；名单缺一个，字体与 fontawesome.css 一起缺它。",
  " * 编译与用法见 assets/css/fontawesome.scss。",
  " */",
  "$icon-names-solid: (",
  siteSolid.map((n) => '  "' + n + '",').join("\n"),
  ");",
  "",
  "$icon-names-brands: (",
  siteBrands.map((n) => '  "' + n + '",').join("\n"),
  ");",
  "",
].join("\n");
fs.writeFileSync(path.join(ROOT, "_sass/_icon-names.scss"), iconNames);
console.log(
  "icon-names：solid " + siteSolid.length + " 个、brands " + siteBrands.length +
    " 个（上游全表 " + solidKeys.size + "/" + brandKeys.size + " 个）→ _sass/_icon-names.scss"
);

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