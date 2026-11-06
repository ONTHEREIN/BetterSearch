import type { Block, BlockType, EngineAdapter } from '../types';
import { hostFromDisplayUrl } from '../url';

const HOST = /^(www|cn)\.bing\.com$/;

/** Answer modules (`li.b_ans`) are told apart by what they contain. */
const ANSWERS: [BlockType, string][] = [
  ['ai-answer', '.cht_ans_root'],
  ['news', '.ans_nws'],
  ['paa', '.b_paa_item, #df_listaa'],
  ['related', '#inline_rs, .b_rs, .rslist, .richrswrapper'],
  ['video', '#serpvidans, .b_vidAns'],
];

function classifyAnswer(el: HTMLElement): BlockType {
  if (el.matches('.b_vidAns')) return 'video';
  for (const [type, selector] of ANSWERS) {
    if (el.querySelector(selector)) return type;
  }
  return 'unknown';
}

function hasText(el: Element | null): el is HTMLElement {
  return !!el?.textContent?.trim();
}

function byDocumentOrder(a: Block, b: Block): number {
  return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

export const bingAdapter: EngineAdapter = {
  id: 'bing',
  adSelectors: ['#b_results > li.b_ad', '.b_adTop', '.b_adBottom', '#b_pole:has(.eu_promotedlabel)'],

  ownsHost(hostname) {
    return HOST.test(hostname);
  },

  searchBar(root) {
    return root.querySelector('#sb_form_q')?.closest('form') ?? null;
  },

  matches(url) {
    return HOST.test(url.hostname) && url.pathname === '/search';
  },

  collectBlocks(root) {
    const blocks: Block[] = [];

    // Wide areas above the results: a promotion, or a knowledge card.
    const pole = root.querySelector<HTMLElement>('#b_pole');
    if (hasText(pole)) blocks.push({ el: pole, type: pole.querySelector('.eu_promotedlabel') ? 'ad' : 'knowledge' });
    const top = root.querySelector<HTMLElement>('#b_topw');
    if (hasText(top)) blocks.push({ el: top, type: 'knowledge' });

    for (const el of root.querySelectorAll<HTMLElement>('#b_results > li')) {
      if (!hasText(el)) continue;
      if (el.matches('.b_ad, .b_adTop, .b_adBottom')) blocks.push({ el, type: 'ad' });
      else if (el.matches('.b_algo')) blocks.push({ el, type: 'organic' });
      else if (el.matches('.b_ans')) blocks.push({ el, type: classifyAnswer(el) });
      // .b_pag (pagination) and .b_msg are page furniture, not blocks.
    }

    for (const el of root.querySelectorAll<HTMLElement>('#b_context > *')) {
      if (hasText(el)) blocks.push({ el, type: el.matches('.b_ans') ? classifyAnswer(el) : 'unknown' });
    }

    return blocks.sort(byDocumentOrder);
  },

  extractResult(block) {
    if (block.type !== 'organic') return null;
    const link = block.el.querySelector('h2 a');
    if (!link) return null;
    const href = link.getAttribute('href') ?? '';
    let host = hostFromDisplayUrl(block.el.querySelector('cite')?.textContent);
    if (!host && /^https?:\/\//.test(href)) host = new URL(href).hostname;
    return { title: link.textContent?.trim() ?? '', href, host };
  },
};
