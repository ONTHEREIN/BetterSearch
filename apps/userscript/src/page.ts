import { compileRules, siteOf, type EngineAdapter, type RuleSet, type Settings } from '@bettersearch/core';
import { CLASSES } from './style';

const BLOCK_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M5.6 5.6l12.8 12.8"></path></svg>';

export interface PageHooks {
  onBlockSite(host: string): void;
}

/**
 * Applies settings to the results on the page. `apply` is idempotent so it can
 * run on every DOM mutation, including the ones it causes itself.
 */
export class Page {
  private settings!: Settings;
  private rules!: RuleSet;
  private readonly notices = new WeakMap<HTMLElement, HTMLElement>();
  /** Blocked results the user chose to show anyway. */
  private readonly revealed = new WeakSet<HTMLElement>();

  constructor(
    private readonly adapter: EngineAdapter,
    private readonly hooks: PageHooks,
  ) {}

  update(settings: Settings): void {
    this.settings = settings;
    this.rules = compileRules(settings.rules);
    this.apply();
  }

  apply(): void {
    // The script also runs on the engine's other pages (home, other tabs),
    // which can turn into a results page without a reload.
    if (!this.adapter.matches(new URL(location.href))) return;
    for (const block of this.adapter.collectBlocks(document)) {
      if (block.type === 'ad') {
        block.el.classList.add(CLASSES.ad);
        continue;
      }
      const info = this.adapter.extractResult(block);
      if (!info) continue;
      block.el.classList.add(CLASSES.result);
      if (!info.host) continue;
      this.ensureBlockButton(block.el, info.host);

      const blocked = this.rules.blocks(`https://${info.host}/`) && !this.revealed.has(block.el);
      block.el.classList.toggle(CLASSES.blocked, blocked);
      const showNotice = blocked && this.settings.blockAction === 'collapse';
      if (showNotice) this.ensureNotice(block.el, info.host).hidden = false;
      else {
        const notice = this.notices.get(block.el);
        if (notice) notice.hidden = true;
      }
    }
  }

  private ensureBlockButton(result: HTMLElement, host: string): void {
    if (result.querySelector(`:scope > .${CLASSES.blockButton}`)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = CLASSES.blockButton;
    button.title = `屏蔽 ${siteOf(host)}`;
    button.setAttribute('aria-label', `屏蔽 ${siteOf(host)}`);
    button.innerHTML = BLOCK_ICON;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.revealed.delete(result);
      this.hooks.onBlockSite(host);
    });
    result.prepend(button);
  }

  private ensureNotice(result: HTMLElement, host: string): HTMLElement {
    let notice = this.notices.get(result);
    if (!notice?.isConnected) {
      notice = document.createElement('div');
      notice.className = CLASSES.notice;
      const text = document.createElement('span');
      text.textContent = `隐藏了 1 条来自 ${host} 的结果，这是你屏蔽的网站。`;
      const show = document.createElement('button');
      show.type = 'button';
      show.textContent = '显示';
      show.addEventListener('click', () => {
        this.revealed.add(result);
        this.apply();
      });
      notice.append(text, show);
      result.before(notice);
      this.notices.set(result, notice);
    }
    return notice;
  }
}
