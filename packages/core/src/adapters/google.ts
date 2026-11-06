import type { Block, EngineAdapter } from '../types';

const HOST = /(^|\.)google\.(com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/;

// The result wrapper has no stable name, so try known markers from most to least
// specific. `#rso` is sometimes flat and sometimes wrapped in an extra div, so
// results are located by structure (a link holding an h3) rather than by depth.
const CONTAINERS = ['[data-rpos]', '.MjjYud', '[data-hveid]'];

function containerOf(title: Element, scope: Element): HTMLElement | null {
  for (const selector of CONTAINERS) {
    const el = title.closest<HTMLElement>(selector);
    if (el && el !== scope && scope.contains(el)) return el;
  }
  return null;
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
    const scope = root.querySelector('#rso') ?? root.querySelector('#search');
    if (!scope) return [];

    const seen = new Set<HTMLElement>();
    const blocks: Block[] = [];
    for (const title of scope.querySelectorAll('a h3')) {
      const el = containerOf(title, scope);
      if (!el || seen.has(el)) continue;
      seen.add(el);
      blocks.push({ el, type: 'organic' });
    }
    return blocks;
  },
};
