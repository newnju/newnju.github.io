// 六个内容片段的纯 JS 生成器。
//
// 输出必须与 tools/reference-liquid/ 里的原始 Liquid 模板**逐字节一致** ——
// 一致性由 tests/render.test.mjs 强制：每次都用 liquidjs 现场渲染原模板再逐字节比，
// 不依赖任何存下来的快照（快照一改内容就失效，那会让「后台改一个字」发不上去）。
// 之所以连空行都对齐：kramdown 靠空行区分列表的松紧，差一个换行就会让
// 列表项被 <p> 包起来，行距随之改变。见 han-recent-pubs.html 里的注释。
import { loadData, loadCollections } from './content.mjs';

/** Liquid 的 `x | default: y`：nil / false / 空串回落。 */
function or(value, fallback) {
  return value == null || value === '' || value === false ? fallback : value;
}

/** 英文页优先取 *_en，缺省回落中文。 */
function pick(value, valueEn, en) {
  return en ? or(valueEn, value) : value;
}

export const PERIOD_ORDER = ['phd', 'gap', 'master', 'bachelor'];

export function renderFragment(name, locale = 'zh', options = {}) {
  const en = locale === 'en';
  const data = loadData();
  switch (name) {
    case 'education':
      return renderEducation(data, en);
    case 'honours':
      return renderHonours(data, en);
    case 'awards':
      return renderAwards(data, en);
    case 'contact':
      return renderContact(data, en);
    case 'recent-pubs':
      return renderRecentPubs(loadCollections(), en, options.limit ?? 3);
    case 'cv-timeline':
      return renderTimeline(data, loadCollections(), en);
    case 'timeline':
      return renderTimelineAwards(data, en);
    default:
      throw new Error(`未知片段：${name}`);
  }
}

function renderEducation(data, en) {
  const colon = en ? ': ' : '：';
  let out = '';
  for (const e of data.profile.education) {
    const dr = pick(e.daterange, e.daterange_en, en);
    const text = pick(e.text, e.text_en, en);
    out += '\n* ';
    if (dr) out += `<span class="han-cv-date">${dr}</span>${colon}`;
    out += text;
    for (const n of pick(e.notes, e.notes_en, en) ?? []) out += `\n    * ${n}`;
  }
  return `${out}\n`;
}

function renderHonours(data, en) {
  const group = data.awards.groups.find((g) => g.key === 'honours');
  let out = '';
  if (group) {
    for (const item of group.items) out += `\n* ${pick(item.text, item.text_en, en)}`;
  }
  return `${out}\n`;
}

function renderContact(data, en) {
  const ui = data.uiText[en ? 'en' : 'zh-CN'] ?? data.uiText['zh-CN'];
  const emailLabel = or(ui?.email_label, 'Email');
  const locationLabel = or(ui?.location_label, en ? 'Location' : '所在地');
  const location = pick(data.profile.contact.location, data.profile.contact.location_en, en);
  const email = data.profile.contact.email;
  return (
    `* ${emailLabel}: [${email}](mailto:${email})\n` + `* ${locationLabel}: ${location}\n`
  );
}

function renderRecentPubs(collections, en, limit) {
  const pubs = [...collections.publications].sort((a, b) =>
    `${b.data.date}`.localeCompare(`${a.data.date}`)
  );
  let out = '';
  for (const p of pubs.slice(0, limit)) {
    out += `\n* ${pick(p.data.citation, p.data.citation_en, en)}`;
  }
  return out;
}

function renderAwards(data, en) {
  const sep = en ? or(data.uiText['en']?.sep_comma, ', ') : '；';
  let out = '<ul class="han-awards">';
  for (const group of data.awards.groups) {
    if (group.key === 'honours') continue;
    const year = pick(group.year, group.year_en, en);
    const items = group.items
      .map((item) => {
        let text = pick(item.text, item.text_en, en);
        const date = pick(item.date, item.date_en, en);
        if (date) {
          text += `<span class="han-awards__date">${en ? ` (${date})` : `（${date}）`}</span>`;
        }
        return text;
      })
      .join(sep);
    out += `\n  <li><span class="han-awards__year">${year}</span>${items}</li>`;
  }
  return `${out}\n</ul>\n`;
}

function timelineItem(dateRange, colon, text) {
  let line = '* ';
  if (dateRange) line += `<span class="han-cv-date">${dateRange}</span>${colon}`;
  return line + text;
}

function renderTimeline(data, collections, en) {
  const colon = en ? ': ' : '：';
  const comma = en ? ', ' : '，';
  const education = data.profile.education;
  const work = data.profile.work;
  // 英文页的项目链接指到 /en/… 的英文条目页 —— 与 reference-liquid/
  // han-cv-timeline.html L68 的 {% if _en %}{{ '/en' | relative_url }}{% endif %}
  // 必须逐字节一致（tests/render.test.mjs 拿两边输出互比）。
  const projects = collections.portfolio.map((p) => ({
    ...p.data,
    url: en ? `/en${p.data.permalink}` : p.data.permalink,
  }));

  // 模板头部注释与逐行 assign 各自带的换行（见 reference-liquid/han-cv-timeline.html）。
  let out = '\n'.repeat(9);

  for (const period of PERIOD_ORDER) {
    out += '\n'.repeat(6); // {% for _pid %} 与 5 行 assign

    const eds = education.filter((e) => e.period === period);
    if (eds.length > 0) {
      out += '\n'; // {% if _edn > 0 %}
      out += '\n'; // 第 42 行（text_en / daterange 赋值）
      out += '\n'; // 第 43 行
      const head = eds[0];
      const heading = pick(head.text, head.text_en, en).replaceAll('**', '');
      const range = pick(head.daterange, head.daterange_en, en);
      out += `<h2 class="han-cv-period__head">${heading}`;
      if (range) out += `${comma}<span class="han-cv-date">${range}</span>`;
      out += '</h2>\n\n';
      for (const n of pick(head.notes, head.notes_en, en) ?? []) out += `* ${n}\n`;
      out += '\n'; // {% endfor %}（学历说明）
      for (const e of eds.slice(1)) {
        out += timelineItem(pick(e.daterange, e.daterange_en, en), colon, pick(e.text, e.text_en, en));
        out += '\n';
        for (const n of pick(e.notes, e.notes_en, en) ?? []) out += `    * ${n}\n`;
      }
      out += '\n'; // {% endfor %}{% endfor %}
    }
    out += '\n'; // {% endif %}（学历块）
    out += '\n'; // {% assign _works %}
    out += '\n'; // {% assign _wn %}

    const works = work.filter((w) => w.period === period);
    if (works.length > 0) {
      out += '\n'; // {% if _wn > 0 %}
      for (const w of works) {
        out += '\n'; // {% for w %}
        out += timelineItem(pick(w.daterange, w.daterange_en, en), colon, pick(w.text, w.text_en, en));
        out += '\n';
        out += '\n'; // {% assign _wnotes %}
        out += '\n'; // {% if _en and w.notes_en %}
        for (const n of pick(w.notes, w.notes_en, en) ?? []) out += `\n    * ${n}\n`;
        out += '\n'; // {% endfor %}（任职说明）
      }
      out += '\n'; // {% endfor %}（任职）
    }
    out += '\n'; // {% endif %}（任职块）
    out += '\n'; // {% assign _projs %}
    out += '\n'; // {% assign _pn %}

    const periodProjects = projects
      .filter((p) => p.period === period)
      .sort((a, b) => `${b.date}`.localeCompare(`${a.date}`));
    if (periodProjects.length > 0) {
      out += '\n'; // {% if _pn > 0 %}
      for (const p of periodProjects) {
        out += '\n'; // {% for p %}
        const title = pick(p.title, p.title_en, en);
        out += `* [${title}](${p.url})${en ? ' (' : '（'}<span class="han-cv-date">${p.daterange}</span>${en ? ')' : '）'}\n`;
        out += '\n'; // {% assign _ex %}
        out += '\n'; // {% if _en and p.excerpt_en %}
        const excerpt = pick(p.excerpt, p.excerpt_en, en);
        if (excerpt) {
          out += `\n    * ${excerpt}\n`;
        }
        out += '\n'; // {% endif %}（摘要有无）
      }
      out += '\n'; // {% endfor %}（项目）
    }
    out += '\n'; // {% endif %}（项目块）

    // —— 获奖：先数条数，再渲染（模板里是两段独立循环）——
    out += '\n'; // {% assign _na = 0 %}
    for (const group of data.awards.groups) {
      out += '\n'; // {% for g %}
      if (group.key !== 'honours') {
        out += '\n'; // {% unless %}
        for (const _ of group.items) out += '\n\n'; // {% for a %} 与 {% if %}
        out += '\n'; // {% endfor %}（内层）
      }
      out += '\n'; // {% endunless %}
    }
    out += '\n'; // {% endfor %}（计数外层）

    let count = 0;
    for (const group of data.awards.groups) {
      if (group.key === 'honours') continue;
      count += group.items.filter((a) => a.period === period).length;
    }
    if (count > 0) {
      out += '\n'; // {% if _na > 0 %}
      for (const group of data.awards.groups) {
        out += '\n'; // {% for g %}
        if (group.key !== 'honours') {
          out += '\n'; // {% unless %}
          for (const item of group.items) {
            out += '\n'; // {% for a %}
            if (item.period === period) {
              out += '\n'; // {% if a.period == _pid %}
              out += `* <span class="han-cv-date">${group.year}</span>${colon}${pick(item.text, item.text_en, en)}\n`;
              out += '\n'; // {% assign _an %}
              out += '\n'; // {% if _en and a.note_en %}
              const note = pick(item.note, item.note_en, en);
              if (note) out += `\n    * ${note}\n`;
              out += '\n'; // {% endif %}（note）
            }
            out += '\n'; // {% endif %}（period）—— 无论命中与否都产出
          }
          out += '\n'; // {% endfor %}（内层）
        }
        out += '\n'; // {% endunless %}
      }
      out += '\n'; // {% endfor %}（渲染外层）
    }
    out += '\n'; // {% endif %}（_na）
  }
  return `${out}\n`;
}

/** /timeline/ 的获奖时间轴（等级标签取 ui-text 的 award_level_*）。 */
function renderTimelineAwards(data, en) {
  const ui = (en ? data.uiText['en'] : undefined) ?? data.uiText['zh-CN'];
  let out = '<div class="han-timeline">';
  for (const group of data.awards.groups) {
    out += `\n  <h3 class="han-timeline__year">${pick(group.year, group.year_en, en)}</h3>`;
    for (const item of group.items) {
      let line = `\n  <p class="han-timeline__item">${pick(item.text, item.text_en, en)}`;
      if (item.level) {
        const key = `award_level_${item.level}`;
        line += ` <span class="han-timeline__level han-timeline__level--${item.level}">${or(ui?.[key], item.level)}</span>`;
      }
      const note = pick(item.note, item.note_en, en);
      if (note) line += `<span class="han-timeline__note">${note}</span>`;
      out += `${line}</p>`;
    }
  }
  return `${out}\n</div>\n`;
}
