import {
  checkLookalike,
  officialFor,
  reportUrl,
  compileRules,
  planGrid,
  siteOf,
  stripTracking,
  t,
  type EngineAdapter,
  type ResultInfo,
  type RuleSet,
  type Settings,
  type SiteDirectory,
  type Source,
  type Tab,
} from '@bettersearch/core';
import type { Assistant } from './assistant';
import { Grid } from './layout';
import { PAGER } from './pager';
import { CLASSES } from './style';

/** The `target` a link had before we changed it, so `engine` can restore it. */
const ORIGINAL_TARGET = 'data-bs-target';

const REPORT_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 21V4"></path><path d="M5 4h11l-2 4 2 4H5"></path></svg>';

const SUMMARY_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z"></path><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"></path></svg>';

const BLOCK_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M5.6 5.6l12.8 12.8"></path></svg>';

export interface PageHooks {
  onBlockSite(host: string): void;
  /** The known-sites list, while the official-site check is on. */
  sites(): SiteDirectory | null;
  assistant: Assistant;
}

/** Results given to the AI for a summary. */
const MAX_SOURCES = 10;

interface Result {
  el: HTMLElement;
  info: ResultInfo;
}

/** Set text only when it differs: every write is a mutation the page observer sees. */
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/**
 * Applies settings to the results on the page. `apply` is idempotent so it can
 * run on every DOM mutation, including the ones it causes itself.
 */
export class Page {
  private settings!: Settings;
  private rules!: RuleSet;
  /** One notice per run of adjacent blocked results, keyed by the run's first result. */
  private readonly notices = new WeakMap<HTMLElement, HTMLElement>();
  private readonly warnings = new WeakMap<HTMLElement, HTMLElement>();
  private readonly badges = new WeakMap<HTMLElement, HTMLElement>();
  /** Results not blocked, in page order, as of the last pass. */
  private visible: Result[] = [];
  /** Blocked results the user chose to show anyway. */
  private readonly revealed = new WeakSet<HTMLElement>();
  private readonly aiBars = new WeakMap<HTMLElement, HTMLElement>();
  /** Engine AI answers the user expanded. */
  private readonly aiExpanded = new WeakSet<HTMLElement>();
  readonly grid = new Grid();
  /** The element hidden, collapsed or laid out for a block: its grid cell when the layout is on. */
  private cellOf: (el: HTMLElement) => HTMLElement = (el) => el;

  constructor(
    private readonly adapter: EngineAdapter,
    private readonly hooks: PageHooks,
  ) {}

  /** `rules` is the user's own rules plus enabled subscriptions. */
  update(settings: Settings, rules: string): void {
    this.settings = settings;
    this.rules = compileRules(rules);
    this.apply();
  }

  apply(): void {
    // The script also runs on the engine's other pages (home, other tabs),
    // which can turn into a results page without a reload.
    const url = new URL(location.href);
    const tab = this.adapter.tab(url, document);
    if (!tab) {
      this.hooks.assistant.sync(null, '');
      return;
    }
    const query = this.adapter.query(url);

    if (this.settings.layout && this.adapter.injectedModules) {
      // Out of the result and into a row of its own, so one card does not grow
      // to hold a whole module.
      // The engine re-injects the module when it no longer finds it in the
      // result, so keep only the newest copy we moved out.
      for (const el of document.querySelectorAll<HTMLElement>(this.adapter.injectedModules)) {
        for (const old of document.querySelectorAll(`.${CLASSES.moved}`)) old.remove();
        el.classList.add(CLASSES.moved);
        el.parentElement?.after(el);
      }
    }
    const blocks = this.adapter.collectBlocks(document);
    const results = new Map<HTMLElement, Result>();
    for (const block of blocks) {
      if (block.type === 'ad') block.el.classList.add(CLASSES.ad);
      const info = this.adapter.extractResult(block);
      if (info) results.set(block.el, { el: block.el, info });
    }
    const page = [...results.values()].map((r) => r.info);

    const container = this.adapter.resultsContainer(document);
    const plan = this.settings.layout && container ? planGrid(container, blocks) : null;
    this.cellOf = (el) => plan?.cells.get(el) ?? el;
    const columns = { side: this.adapter.sideColumn(document), left: this.adapter.leftColumn(document) };
    this.grid.apply(container, columns, plan, new Set(results.keys()), this.settings);
    this.collapseAiAnswers(blocks.filter((b) => b.type === 'ai-answer').map((b) => b.el));
    this.hooks.assistant.sync(container, query);

    // Runs of blocked results with nothing visible between them share a notice.
    // Ads do not break a run: they are hidden too.
    const runs: Result[][] = [];
    let run: Result[] | null = null;
    for (const block of blocks) {
      const result = results.get(block.el);
      if (result) this.decorate(result, query, page, tab);
      if (result && this.isBlocked(result)) {
        if (!run) runs.push((run = []));
        run.push(result);
      } else if (block.type !== 'ad') {
        run = null;
      }
    }

    const blocked = new Set(runs.flat().map((r) => r.el));
    this.visible = [...results.values()].filter((r) => !blocked.has(r.el));
    for (const el of results.keys()) this.cellOf(el).classList.toggle(CLASSES.blocked, blocked.has(el));
    const active = new Set<HTMLElement>();
    if (this.settings.blockAction === 'collapse') {
      for (const blockedRun of runs) active.add(this.showNotice(blockedRun));
    }
    for (const notice of document.querySelectorAll<HTMLElement>(`.${CLASSES.notice}:not(.${CLASSES.aiBar})`)) {
      if (!active.has(notice)) notice.hidden = true;
    }
  }

  private isBlocked({ el, info }: Result): boolean {
    if (!info.host || this.revealed.has(el)) return false;
    return this.rules.blocks(info.url ?? `https://${info.host}/`);
  }

  /**
   * What every result gets, blocked or not. A news story is not a site's own
   * page, so the official-site and lookalike checks are for the web tab only.
   */
  private decorate({ el, info }: Result, query: string, page: ResultInfo[], tab: Tab): void {
    el.classList.add(CLASSES.result);
    if (this.settings.cleanLinks) this.cleanLinks(el, info);
    this.setLinkTargets(el);
    this.showSummaryButton(el, info);
    const sites = tab === 'web' ? this.hooks.sites() : null;
    // undefined while the domain's shard downloads; the directory re-applies when it arrives.
    const site = info.host && sites ? sites.peek(info.host) : null;
    const official = site ? officialFor(site, query) : null;
    this.showOfficial(el, official);
    // Within the first page: a later page's official result jumping above page 1 would be lost.
    const divider = document.querySelector(`.${PAGER.divider}`);
    const firstPage = !divider || !!(el.compareDocumentPosition(divider) & Node.DOCUMENT_POSITION_FOLLOWING);
    this.cellOf(el).classList.toggle(CLASSES.pinned, !!official && this.settings.pinOfficial && firstPage);
    if (!info.host) return;
    this.ensureBlockButton(el, info.host);
    if (tab !== 'web') return;
    const report = () => window.open(reportUrl(info.host!, query, this.adapter.id), '_blank', 'noopener');
    this.ensureReportButton(el, info.host, report);
    const warning = checkLookalike(info, query, page, { known: sites ? (site === undefined ? undefined : !!site) : null });
    el.classList.toggle(CLASSES.suspicious, !!warning);
    if (warning) {
      const box = this.ensureWarning(el, report);
      setText(box.querySelector('span')!, warning.message);
      box.hidden = false;
    } else {
      const box = this.warnings.get(el);
      if (box) box.hidden = true;
    }
  }

  /** A line under the result saying it is the official site, and whose. */
  private showOfficial(result: HTMLElement, name: string | null): void {
    let badge = this.badges.get(result);
    if (!name) {
      if (badge) badge.hidden = true;
      return;
    }
    if (!badge?.isConnected) {
      badge = document.createElement('div');
      badge.className = CLASSES.official;
      badge.setAttribute('role', 'note');
      badge.append(document.createElement('strong'), document.createElement('span'));
      result.append(badge);
      this.badges.set(result, badge);
    }
    setText(badge.querySelector('strong')!, t('official.badge'));
    setText(badge.querySelector('span')!, t('official.source', { brand: name }));
    badge.hidden = false;
  }

  /** Point the result's links at the real destination and stop click pings. */
  private cleanLinks(result: HTMLElement, info: ResultInfo): void {
    const target = info.url ? stripTracking(info.url) : null;
    for (const link of result.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      link.removeAttribute('ping');
      if (target && link.getAttribute('href') === info.href) link.setAttribute('href', target);
    }
  }

  private setLinkTargets(result: HTMLElement): void {
    const mode = this.settings.openLinks;
    for (const link of result.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      if (mode === 'engine' && !link.hasAttribute(ORIGINAL_TARGET)) continue;
      if (/^(#|javascript:)/i.test(link.getAttribute('href')!)) continue;
      if (!link.hasAttribute(ORIGINAL_TARGET)) link.setAttribute(ORIGINAL_TARGET, link.getAttribute('target') ?? '');
      const original = link.getAttribute(ORIGINAL_TARGET)!;
      const target = mode === 'new' ? '_blank' : mode === 'same' ? '' : original;
      if ((link.getAttribute('target') ?? '') === target) continue;
      if (target) link.setAttribute('target', target);
      else link.removeAttribute('target');
      if (target === '_blank' && !link.relList.contains('noopener')) link.relList.add('noopener');
    }
  }

  /** What the AI gets for a summary of the results on the page. */
  sources(): Source[] {
    return this.visible.slice(0, MAX_SOURCES).map((r) => this.sourceOf(r));
  }

  private sourceOf({ el, info }: Result): Source {
    const copy = el.cloneNode(true) as HTMLElement;
    // Our additions, the engine's inline styles and scripts, and the URL line: the URL is sent anyway.
    const skip = `.${CLASSES.blockButton}, .${CLASSES.official}, .${CLASSES.warning}, script, style, noscript, cite`;
    for (const el of copy.querySelectorAll(skip)) el.remove();
    let snippet = (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (snippet.startsWith(info.title)) snippet = snippet.slice(info.title.length).trim();
    return { title: info.title, url: info.url ?? new URL(info.href, location.href).href, snippet };
  }

  /** Only where the page reveals the real address: an engine redirect is not the page. */
  private showSummaryButton(el: HTMLElement, info: ResultInfo): void {
    let button = el.querySelector<HTMLButtonElement>(`:scope > .${CLASSES.summaryButton}`);
    const show = !!info.url && this.hooks.assistant.ready();
    if (!show) {
      if (button) button.hidden = true;
      return;
    }
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = `${CLASSES.blockButton} ${CLASSES.summaryButton}`;
      button.title = t('assistant.summaryButton');
      button.setAttribute('aria-label', button.title);
      button.innerHTML = SUMMARY_ICON;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const result = this.visible.find((r) => r.el === el) ?? { el, info };
        this.hooks.assistant.summarizePage(this.sourceOf(result));
      });
      el.prepend(button);
    }
    button.hidden = false;
  }

  private ensureBlockButton(result: HTMLElement, host: string): void {
    if (result.querySelector(`:scope > .${CLASSES.blockButton}`)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = CLASSES.blockButton;
    button.title = t('block.button', { site: siteOf(host) });
    button.setAttribute('aria-label', button.title);
    button.innerHTML = BLOCK_ICON;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.revealed.delete(result);
      this.hooks.onBlockSite(host);
    });
    result.prepend(button);
  }

  /** A button, not a link: adapters read a result's links, and ours must not be taken for it. */
  private ensureReportButton(result: HTMLElement, host: string, report: () => void): void {
    if (result.querySelector(`:scope > .${CLASSES.reportButton}`)) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `${CLASSES.blockButton} ${CLASSES.reportButton}`;
    button.title = t('report.button', { site: siteOf(host) });
    button.setAttribute('aria-label', button.title);
    button.innerHTML = REPORT_ICON;
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      report();
    });
    result.prepend(button);
  }

  private ensureWarning(result: HTMLElement, report: () => void): HTMLElement {
    let box = this.warnings.get(result);
    if (!box?.isConnected) {
      box = document.createElement('div');
      box.className = CLASSES.warning;
      box.setAttribute('role', 'note');
      const link = document.createElement('button');
      link.type = 'button';
      link.className = CLASSES.reportLink;
      link.textContent = t('report.link');
      link.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        report();
      });
      box.append(document.createElement('span'), link);
      result.append(box);
      this.warnings.set(result, box);
    }
    return box;
  }

  private collapseAiAnswers(answers: HTMLElement[]): void {
    const active = new Set<HTMLElement>();
    for (const el of answers) {
      const cell = this.cellOf(el);
      const collapse = this.settings.collapseAiAnswers && !this.aiExpanded.has(el);
      cell.classList.toggle(CLASSES.aiCollapsed, collapse);
      if (!collapse) continue;
      let bar = this.aiBars.get(el);
      if (!bar?.isConnected) {
        bar = document.createElement('div');
        bar.className = `${CLASSES.notice} ${CLASSES.aiBar}`;
        const text = document.createElement('span');
        text.textContent = t('ai.collapsed');
        const show = document.createElement('button');
        show.type = 'button';
        show.textContent = t('ai.expand');
        show.addEventListener('click', () => {
          this.aiExpanded.add(el);
          this.apply();
        });
        bar.append(text, show);
        cell.before(bar);
        this.aiBars.set(el, bar);
      }
      bar.hidden = false;
      active.add(bar);
    }
    for (const bar of document.querySelectorAll<HTMLElement>(`.${CLASSES.aiBar}`)) {
      if (!active.has(bar)) bar.hidden = true;
    }
  }

  private showNotice(run: Result[]): HTMLElement {
    const first = this.cellOf(run[0]!.el);
    let notice = this.notices.get(first);
    if (!notice?.isConnected) {
      notice = document.createElement('div');
      notice.className = CLASSES.notice;
      const show = document.createElement('button');
      show.type = 'button';
      show.textContent = t('blocked.show');
      notice.append(document.createElement('span'), show);
      first.before(notice);
      this.notices.set(first, notice);
    }
    const sites = [...new Set(run.map((r) => siteOf(r.info.host!)))];
    setText(
      notice.querySelector('span')!,
      t('blocked.notice', { count: run.length, sites: sites.join(t('blocked.separator')) }),
    );
    // Rebind on every pass: the run behind this notice can change.
    notice.querySelector('button')!.onclick = () => {
      for (const r of run) this.revealed.add(r.el);
      this.apply();
    };
    notice.hidden = false;
    return notice;
  }
}
