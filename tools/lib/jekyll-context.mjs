// 把仓库里的真实数据拼成 Jekyll/Liquid 的渲染上下文，
// 供「参考模板 vs 生成器」一致性测试使用。
// 这里是唯一一处模拟 Jekyll 的地方 —— 内容本身仍然只从 lib/content.mjs 读。
import { loadCollections, loadData } from './content.mjs';

const SITE_URL = 'https://newnju.github.io';

function asDocument(entry) {
  return { ...entry.data, url: entry.data.permalink, file: entry.file };
}

export function buildContext(locale = 'zh') {
  const data = loadData();
  const collections = loadCollections();
  return {
    site: {
      locale: 'zh-CN',
      url: SITE_URL,
      baseurl: '',
      data: {
        profile: data.profile,
        awards: data.awards,
        navigation: data.navigation,
        'ui-text': data.uiText,
      },
      publications: collections.publications.map(asDocument),
      portfolio: collections.portfolio.map(asDocument),
      talks: collections.talks.map(asDocument),
      teaching: collections.teaching.map(asDocument),
    },
    page: locale === 'en' ? { locale: 'en' } : {},
    // _pages/about.md 调 {% include han-recent-pubs.html %} 时没传 limit，Liquid 默认 3
    include: { limit: 3 },
  };
}

/** Jekyll 的 relative_url：baseurl 为空时原样返回。 */
export const liquidFilters = {
  relative_url: (value) => `${value ?? ''}`,
};
