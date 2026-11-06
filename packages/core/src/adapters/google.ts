import type { Block, BlockType, EngineAdapter } from '../types';
import { hostFromDisplayUrl } from '../url';

const HOST = /(^|\.)google\.(com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/;

// Google's class names are obfuscated, so everything here is best-effort and
// ordered from most to least specific. Headings are localised by IP and must
// never be used to classify blocks.

/** Top-level wrappers of a block inside `#rso`; they can nest. */
const UNIT = '.ULSxyf, .MjjYud';
/** Wrappers of a single organic result, tried in order. */
const RESULT = ['[data-rpos]', '.MjjYud', '[data-hveid]'];
const AI_ANSWER = '#m-x-content, [data-subtree="aimc"]';
const MODULES: [BlockType, string][] = [
  ['ad', '#tads, #tadsb, #bottomads, #tvcap, [data-text-ad]'],
  ['ai-answer', AI_ANSWER],
  ['paa', '.related-question-pair, [data-initq]'],
  ['knowledge', '[data-attrid^="kc:"]'],
  ['widget', '[data-attrid="Converter"], #wob_wc'],
];
/** A unit with at least this many videos is a video carousel. */
const VIDEO_CAROUSEL_MIN = 2;

function outermostUnit(el: Element, scope: Element): HTMLElement | null {
  let unit: HTMLElement | null = null;
  for (let e = el.parentElement; e && e !== scope; e = e.parentElement) {
    if (e.matches(UNIT)) unit = e;
  }
  return el.matches(UNIT) && !unit ? (el as HTMLElement) : unit;
}

function resultContainer(title: Element, scope: Element): HTMLElement | null {
  for (const selector of RESULT) {
    const el = title.closest<HTMLElement>(selector);
    if (el && el !== scope && scope.contains(el)) return el;
  }
  return null;
}

function collectMain(scope: Element): Block[] {
  const modules = new Map<HTMLElement, BlockType>();
  for (const [type, selector] of MODULES) {
    for (const marker of scope.querySelectorAll(selector)) {
      // Ad slots are often present but empty.
      if (!marker.textContent?.trim()) continue;
      const unit = outermostUnit(marker, scope) ?? (marker as HTMLElement);
      if (!modules.has(unit)) modules.set(unit, type);
    }
  }
  const videoCounts = new Map<HTMLElement, number>();
  for (const marker of scope.querySelectorAll('[data-vid]')) {
    const unit = outermostUnit(marker, scope);
    if (unit && !modules.has(unit)) videoCounts.set(unit, (videoCounts.get(unit) ?? 0) + 1);
  }
  for (const [unit, count] of videoCounts) {
    if (count >= VIDEO_CAROUSEL_MIN) modules.set(unit, 'video');
  }

  const inModule = (el: Element) => [...modules.keys()].some((m) => m.contains(el));
  const blocks: Block[] = [...modules].map(([el, type]) => ({ el, type }));

  const organic = new Set<HTMLElement>();
  for (const title of scope.querySelectorAll('a h3')) {
    if (inModule(title)) continue;
    const el = resultContainer(title, scope);
    if (el && !organic.has(el)) {
      organic.add(el);
      blocks.push({ el, type: 'organic' });
    }
  }

  for (const unit of scope.querySelectorAll<HTMLElement>(UNIT)) {
    if (outermostUnit(unit, scope) !== unit || modules.has(unit)) continue;
    if (!unit.textContent?.trim()) continue;
    if ([...organic].some((o) => unit.contains(o) || o.contains(unit))) continue;
    blocks.push({ el: unit, type: 'unknown' });
  }
  return blocks;
}

function byDocumentOrder(a: Block, b: Block): number {
  return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

export const googleAdapter: EngineAdapter = {
  id: 'google',

  matches(url) {
    if (!HOST.test(url.hostname) || url.pathname !== '/search') return false;
    if (url.searchParams.has('tbm')) return false;
    const udm = url.searchParams.get('udm');
    // No udm is the "all" tab; udm=14 is the "web" tab.
    return udm === null || udm === '14';
  },

  collectBlocks(root) {
    const blocks: Block[] = [];

    // The AI overview is either a unit inside #rso or this box above it.
    const top = root.querySelector<HTMLElement>('#Odp5De');
    if (top?.querySelector(AI_ANSWER)) blocks.push({ el: top, type: 'ai-answer' });

    const scope = root.querySelector('#rso');
    if (scope) blocks.push(...collectMain(scope));

    const side = root.querySelector<HTMLElement>('#rhs');
    if (side?.textContent?.trim()) blocks.push({ el: side, type: 'knowledge' });

    const related = root.querySelector<HTMLElement>('#bres');
    if (related?.textContent?.trim()) blocks.push({ el: related, type: 'related' });

    return blocks.sort(byDocumentOrder);
  },

  extractResult(block) {
    if (block.type !== 'organic') return null;
    const title = block.el.querySelector('a h3');
    const link = title?.closest('a');
    if (!title || !link) return null;
    return {
      title: title.textContent?.trim() ?? '',
      href: link.getAttribute('href') ?? '',
      host: hostFromDisplayUrl(block.el.querySelector('cite')?.textContent),
    };
  },
};
