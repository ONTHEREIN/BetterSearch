import type { Block, BlockType, EngineAdapter } from '../types';
import { hostFromDisplayUrl } from '../url';

const HOST = /^www\.baidu\.com$/;

// Every result container carries a `tpl` naming its template; ads do not, and
// their class names are random. Unlisted templates fall back to 'unknown'.
const TEMPLATES: Record<string, BlockType> = {
  www_index: 'organic',
  www_struct: 'organic',
  wenda_generate: 'ai-answer',
  ai_agent_distribute: 'ai-answer',
  new_baikan_index: 'ai-answer',
  recommend_list: 'related',
  recommend_list_san: 'related',
  rel_base_realtime: 'news',
  sg_kg_entity_san: 'knowledge',
  bk_polysemy: 'knowledge',
  short_video: 'video',
  yl_vd_main_san: 'video',
  yl_vd_series_san: 'video',
  yl_vd_plot_intro_san: 'video',
  weather_forecast_new_san: 'widget',
  jr_exrate_san: 'widget',
  jr_quote: 'widget',
  jr_stock_comment_san: 'widget',
  sp_purc_pc: 'widget',
  'pc-soft-accurate': 'widget',
  image_grid_san: 'widget',
};

const AD_LINK = 'a[href*="baidu.php?"]';

function classify(el: HTMLElement): BlockType {
  const tpl = el.getAttribute('tpl');
  if (!tpl) return el.querySelector(AD_LINK) ? 'ad' : 'unknown';
  return TEMPLATES[tpl] ?? 'unknown';
}

/** The real target URL Baidu stores on the container, if it is one. */
function realUrl(el: HTMLElement): URL | null {
  const mu = el.getAttribute('mu');
  if (!mu || !/^https?:\/\//.test(mu)) return null;
  try {
    const url = new URL(mu);
    // Placeholder used by Baidu's own modules.
    return url.hostname === 'nourl.ubs.baidu.com' ? null : url;
  } catch {
    return null;
  }
}

export const baiduAdapter: EngineAdapter = {
  id: 'baidu',
  // #top-ad is the full-width brand banner above the results.
  adSelectors: ['#top-ad', `#content_left > div:not([tpl]):has(${AD_LINK})`],

  ownsHost(hostname) {
    return HOST.test(hostname);
  },

  resultsContainer(root) {
    return root.querySelector<HTMLElement>('#content_left');
  },

  sideColumn(root) {
    return root.querySelector<HTMLElement>('#content_right');
  },

  leftColumn(root) {
    return null;
  },

  injectedModules: '',
  paginationSelector: '#page',

  nextPageUrl(root, base) {
    const href = ([...root.querySelectorAll<HTMLAnchorElement>('#page a.n')].at(-1) ?? null)?.getAttribute('href');
    return href ? new URL(href, base).href : null;
  },

  searchBar(root) {
    // The current page searches from a textarea outside any form and keeps the
    // classic form hidden; fall back to the form on older layouts.
    return (
      root.querySelector<HTMLElement>('.chat-input-wrapper') ??
      root.querySelector('#kw')?.closest('form') ??
      null
    );
  },

  query(url) {
    return url.searchParams.get('wd') ?? url.searchParams.get('word') ?? '';
  },

  tab(url) {
    if (!HOST.test(url.hostname) || url.pathname !== '/s') return null;
    // tn=news is the news tab; pd selects other verticals such as notes.
    return url.searchParams.get('tn') !== 'news' && !url.searchParams.has('pd') ? 'web' : null;
  },

  collectBlocks(root) {
    const blocks: Block[] = [];
    const brand = root.querySelector<HTMLElement>('#top-ad');
    if (brand?.textContent?.trim()) blocks.push({ el: brand, type: 'ad' });
    for (const el of root.querySelectorAll<HTMLElement>('#content_left > *, #content_right [tpl]')) {
      if (el.textContent?.trim()) blocks.push({ el, type: classify(el) });
    }
    return blocks;
  },

  extractResult(block) {
    if (block.type !== 'organic') return null;
    const link = block.el.querySelector('h3 a');
    if (!link) return null;
    const url = realUrl(block.el);
    const host = url?.hostname ?? hostFromDisplayUrl(block.el.querySelector('[class*="showurl"]')?.textContent);
    // Baidu badges sites it verified as official with a bare "官方" label.
    const prominent = [...block.el.querySelectorAll('span, a, div')].some(
      (el) => el.children.length === 0 && el.textContent?.trim() === '官方',
    );
    return {
      title: link.textContent?.trim() ?? '',
      href: link.getAttribute('href') ?? '',
      url: url?.href ?? null,
      host,
      prominent,
    };
  },
};
