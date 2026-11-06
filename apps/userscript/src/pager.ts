import type { EngineAdapter, Settings } from '@bettersearch/core';

export function pagerCss(paginationSelector: string): string {
  return `
html[${PAGER.active}] ${paginationSelector} { display: none !important; }
.${PAGER.footer} {
  min-height: 1px; padding: 8px 0 24px; text-align: center;
  font: 14px/1.5 system-ui, sans-serif; color: inherit; opacity: .8;
}
.${PAGER.footer} button {
  padding: 8px 20px; border: 1px solid currentColor; border-radius: 999px;
  background: none; color: inherit; font: inherit; cursor: pointer;
}
.${PAGER.footer} a { margin-left: 8px; color: #4c7cf0; }
.${PAGER.divider} {
  display: flex; align-items: center; gap: 12px; margin: 8px 0 20px;
  font: 13px/1.5 system-ui, sans-serif; opacity: .6;
}
.${PAGER.divider}::before, .${PAGER.divider}::after { content: ''; flex: 1; border-top: 1px solid currentColor; opacity: .4; }
`;
}

export const PAGER = {
  active: 'data-bs-autopage',
  divider: 'bs-page-divider',
  footer: 'bs-page-footer',
} as const;

/** Never request pages faster than this, to stay clear of rate limits. */
const MIN_INTERVAL_MS = 1000;
/** Start loading this far before the end of the results comes into view. */
const PRELOAD_MARGIN = '800px';

type State = 'idle' | 'loading' | 'waiting-for-click' | 'done' | 'stopped';

/**
 * Appends the next pages of results to the current one. Only organic results
 * are taken from later pages; the page's own processing (ads, blocking,
 * layout) picks them up through its mutation observer like any other result.
 */
export class Pager {
  private container: HTMLElement | null = null;
  private nextUrl: string | null = null;
  private loaded = 0;
  private limit = 5;
  private state: State = 'idle';
  private lastRequest = 0;
  private readonly seen = new Set<string>();
  private footer: HTMLElement | null = null;
  private observer: IntersectionObserver | null = null;

  constructor(private readonly adapter: EngineAdapter) {}

  /** Call on every page refresh; restarts when the engine swapped in a new search. */
  sync(settings: Settings): void {
    const container = this.adapter.resultsContainer(document);
    const enabled = settings.autoPage && !!container && this.adapter.matches(new URL(location.href));
    document.documentElement.toggleAttribute(PAGER.active, enabled);
    if (!enabled) {
      this.reset(null);
      return;
    }
    if (container !== this.container || !this.footer?.isConnected) this.reset(container);
    this.limit = settings.autoPageLimit;
  }

  private reset(container: HTMLElement | null): void {
    this.observer?.disconnect();
    this.footer?.remove();
    this.container = container;
    this.footer = null;
    this.loaded = 0;
    this.seen.clear();
    this.state = 'idle';
    if (!container) return;

    this.nextUrl = this.adapter.nextPageUrl(document, location.href);
    for (const key of this.resultKeys(document)) this.seen.add(key);
    this.footer = document.createElement('div');
    this.footer.className = PAGER.footer;
    container.append(this.footer);
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) void this.loadNext(false);
    }, { rootMargin: PRELOAD_MARGIN });
    this.observer.observe(this.footer);
    this.render();
  }

  private resultKeys(root: ParentNode): string[] {
    return this.adapter
      .collectBlocks(root)
      .map((b) => this.adapter.extractResult(b))
      .filter((r) => r !== null)
      .map((r) => r.url ?? `${r.host}|${r.title}`);
  }

  private async loadNext(byUser: boolean): Promise<void> {
    if (!this.container || !this.nextUrl || this.state === 'loading' || this.state === 'stopped') return;
    if (this.state === 'waiting-for-click' && !byUser) return;
    if (!byUser && this.loaded >= this.limit) {
      this.state = 'waiting-for-click';
      this.render();
      return;
    }
    const wait = this.lastRequest + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    const container = this.container;
    const url = this.nextUrl;
    this.state = 'loading';
    this.lastRequest = Date.now();
    this.render();
    try {
      const response = await fetch(url, { credentials: 'include' });
      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');
      if (container !== this.container) return; // a new search started meanwhile

      const results = this.adapter.collectBlocks(doc).filter((b) => b.type === 'organic');
      // A verification page, rate limit or redesign: stop rather than guess.
      if (!response.ok || !this.adapter.resultsContainer(doc) || !results.length) {
        this.state = 'stopped';
        this.render();
        return;
      }

      this.loaded += 1;
      const divider = document.createElement('div');
      divider.className = PAGER.divider;
      divider.textContent = `第 ${this.loaded + 1} 页`;
      const fresh: HTMLElement[] = [];
      for (const block of results) {
        const info = this.adapter.extractResult(block);
        const key = info ? (info.url ?? `${info.host}|${info.title}`) : null;
        if (key && this.seen.has(key)) continue;
        if (key) this.seen.add(key);
        fresh.push(document.adoptNode(block.el));
      }
      this.footer!.before(divider, ...fresh);
      this.nextUrl = this.adapter.nextPageUrl(doc, url);
      this.state = this.nextUrl ? 'idle' : 'done';
    } catch {
      this.state = 'stopped';
    }
    this.render();
    // After a short page the footer may still be in view, which would not
    // fire again on its own: observe it afresh to get a new initial entry.
    if (this.state === 'idle' && this.footer) {
      this.observer?.unobserve(this.footer);
      this.observer?.observe(this.footer);
    }
  }

  private render(): void {
    const footer = this.footer;
    if (!footer) return;
    footer.replaceChildren();
    const text = document.createElement('span');
    const button = (label: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', onClick);
      return b;
    };
    switch (this.state) {
      case 'loading':
        text.textContent = `正在加载第 ${this.loaded + 2} 页…`;
        footer.append(text);
        break;
      case 'waiting-for-click':
        footer.append(button('加载下一页', () => void this.loadNext(true)));
        break;
      case 'done':
        text.textContent = '没有更多结果了。';
        footer.append(text);
        break;
      case 'stopped': {
        text.textContent = '下一页没能自动加载，可能需要完成验证。';
        const link = document.createElement('a');
        link.href = this.nextUrl ?? location.href;
        link.textContent = '打开下一页';
        footer.append(text, link);
        break;
      }
      default:
      // Idle: an empty but visible footer, so the observer can see it coming.
    }
  }
}
