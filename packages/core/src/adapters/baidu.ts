import type { Block, BlockType, EngineAdapter, ResultInfo } from '../types';
import { hostFromDisplayUrl } from '../url';

/** www for desktops, m for phones; the two pages differ throughout. */
const HOST = /^(www|m)\.baidu\.com$/;

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
  'news-normal': 'organic',
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
  // Mobile.
  sp_purc_atom: 'ad',
  guanfanghao_san: 'unknown',
};

const AD_LINK = 'a[href*="baidu.php?"]';
/** Ads on the mobile page: the brand zone, and templates named ads_*. */
const MOBILE_AD = '.ec_wise_ad';
/** The brand zone at the top of the news tab. */
const BRAND_AD = '.ecom_pingzhuan';
/**
 * Baidu removes tn=news from the address once the news tab has loaded; its
 * page links and stories still show it.
 */
const NEWS_PAGE = '#page a[href*="tn=news&"], #content_left > [tpl="news-normal"]';

function classify(el: HTMLElement): BlockType {
  const tpl = el.getAttribute('tpl');
  if (!tpl) {
    if (el.matches(BRAND_AD) || el.querySelector(`${AD_LINK}, ${MOBILE_AD}`)) return 'ad';
    // Older-style stories on the news tab (Baike, Baijiahao) carry no template.
    return el.matches('.result') && el.querySelector('h3 a') ? 'organic' : 'unknown';
  }
  if (tpl.startsWith('ads_')) return 'ad';
  return TEMPLATES[tpl] ?? 'unknown';
}

/** The `mu` the mobile page keeps in its click log. */
function loggedMu(el: HTMLElement): string | null {
  try {
    const mu = (JSON.parse(el.dataset.log ?? '') as { mu?: unknown }).mu;
    return typeof mu === 'string' ? mu : null;
  } catch {
    return null;
  }
}

/** The real target URL Baidu stores on the container, if it is one. */
function realUrl(el: HTMLElement): URL | null {
  const mu = el.getAttribute('mu') ?? loggedMu(el);
  if (!mu || !/^https?:\/\//.test(mu)) return null;
  try {
    const url = new URL(mu);
    // Placeholder used by Baidu's own modules.
    return url.hostname === 'nourl.ubs.baidu.com' ? null : url;
  } catch {
    return null;
  }
}

/** `href` when it goes straight to the site rather than through Baidu's redirect. */
function directUrl(href: string | null): URL | null {
  if (!href || !/^https?:\/\//.test(href)) return null;
  try {
    const url = new URL(href);
    return HOST.test(url.hostname) ? null : url;
  } catch {
    return null;
  }
}

/** Baidu badges sites it verified as official with a bare "官方" label. */
function badgedOfficial(el: HTMLElement): boolean {
  return [...el.querySelectorAll('span, a, div')].some((e) => e.children.length === 0 && e.textContent?.trim() === '官方');
}

/**
 * A mobile result: the card is the link, through a script rather than an
 * <a>, and its title holds tags such as "官方".
 */
function mobileResult(el: HTMLElement): ResultInfo | null {
  const card = el.querySelector<HTMLElement>('[rl-link-href]');
  const heading = el.querySelector('h3');
  if (!card || !heading) return null;
  const title = heading.cloneNode(true) as HTMLElement;
  for (const tag of title.querySelectorAll('.cos-tag')) tag.remove();
  const url = realUrl(el);
  return {
    title: title.textContent?.trim() ?? '',
    href: card.getAttribute('rl-link-href') ?? '',
    url: url?.href ?? null,
    host: url?.hostname ?? null,
    prominent: badgedOfficial(el),
  };
}

export const baiduAdapter: EngineAdapter = {
  id: 'baidu',
  // #top-ad is the full-width brand banner above the results.
  adSelectors: [
    '#top-ad',
    `#content_left > ${BRAND_AD}`,
    `#content_left > div:not([tpl]):has(${AD_LINK})`,
    `#results > div:not([tpl]):has(${MOBILE_AD})`,
    '#results > [tpl^="ads_"]',
    '#results > [tpl="sp_purc_atom"]',
  ],

  ownsHost(hostname) {
    return HOST.test(hostname);
  },

  resultsContainer(root) {
    return root.querySelector<HTMLElement>('#content_left, #results');
  },

  sideColumn(root) {
    return root.querySelector<HTMLElement>('#content_right');
  },

  leftColumn(root) {
    return null;
  },

  injectedModules: '',
  // On the mobile page #page is the whole page, not the page links.
  paginationSelector: '#page:not(.search-page), #page-controller',

  nextPageUrl(root, base) {
    // Mobile: "next" alone on the first page, beside "previous" after it.
    const href = (
      [...root.querySelectorAll<HTMLAnchorElement>('#page a.n')].at(-1) ?? root.querySelector('#page-controller a[class*="nextpage"]')
    )?.getAttribute('href');
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

  tab(url, root) {
    // pd selects other verticals such as notes. The mobile page searches from
    // paths like /ssid=0/from=0/s.
    if (!HOST.test(url.hostname) || !/(^|\/)s$/.test(url.pathname) || url.searchParams.has('pd')) return null;
    return url.searchParams.get('tn') === 'news' || root.querySelector(NEWS_PAGE) ? 'news' : 'web';
  },

  collectBlocks(root) {
    const blocks: Block[] = [];
    const brand = root.querySelector<HTMLElement>('#top-ad');
    if (brand?.textContent?.trim()) blocks.push({ el: brand, type: 'ad' });
    for (const el of root.querySelectorAll<HTMLElement>('#content_left > *, #content_right [tpl], #results > *')) {
      if (el.textContent?.trim()) blocks.push({ el, type: classify(el) });
    }
    return blocks;
  },

  extractResult(block) {
    if (block.type !== 'organic') return null;
    const link = block.el.querySelector('h3 a');
    if (!link) return mobileResult(block.el);
    const url = realUrl(block.el) ?? directUrl(link.getAttribute('href'));
    const host = url?.hostname ?? hostFromDisplayUrl(block.el.querySelector('[class*="showurl"]')?.textContent);
    const prominent = badgedOfficial(block.el);
    return {
      title: link.textContent?.trim() ?? '',
      href: link.getAttribute('href') ?? '',
      url: url?.href ?? null,
      host,
      prominent,
    };
  },
};
