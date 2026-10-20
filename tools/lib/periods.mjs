// 履历时期的唯一清单。
//
// 之前 render.mjs（PERIOD_ORDER）和 admin/config.yml（Decap 下拉的三个
// options 块）各写一份，结果 gap 期被移除时就出现过两边不同步。现在：
//   · tools —— 全部从这里 import（render.mjs 转行导出，兼容老引用）；
//   · admin/config.yml —— 下拉选项用 YAML 锚点 &period_options 定在同一
//     文件里复用，锚点就定义在第一处 options 上。
export const PERIOD_ORDER = ['phd', 'master', 'bachelor'];
