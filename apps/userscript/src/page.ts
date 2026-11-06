import {
  checkLookalike,
  compileRules,
  planGrid,
  siteOf,
  stripTracking,
  type EngineAdapter,
  type ResultInfo,
  type RuleSet,
  type Settings,
} from '@bettersearch/core';
import { Grid } from './layout';
import { CLASSES } from './style';

const BLOCK_ICON =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M5.6 5.6l12.8 12.8"></path></svg>';

export interface PageHooks {
  onBlockSite(host: string): void;
}

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

  update(settings: Settings): void {
    this.settings = settings;
    this.rules = compileRules(settings.rules);
    this.apply();
  }

  apply(): void {
    // The script also runs on the engine's other pages (home, other tabs),
    // which can turn into a results page without a reload.
    const url = new URL(location.href);
    if (!this.adapter.matches(url)) return;
    const query = this.adapter.query(url);

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
    this.grid.apply(container, this.adapter.sideColumn(document), plan, new Set(results.keys()), this.settings);
    this.collapseAiAnswers(blocks.filter((b) => b.type === 'ai-answer').map((b) => b.el));

    // Runs of blocked results with nothing visible between them share a notice.
    // Ads do not break a run: they are hidden too.
    const runs: Result[][] = [];
    let run: Result[] | null = null;
    for (const block of blocks) {
      const result = results.get(block.el);
      if (result) this.decorate(result, query, page);
      if (result && this.isBlocked(result)) {
        if (!run) runs.push((run = []));
        run.push(result);
      } else if (block.type !== 'ad') {
        run = null;
      }
    }

    const blocked = new Set(runs.flat().map((r) => r.el));
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

  /** What every result gets, blocked or not. */
  private decorate({ el, info }: Result, query: string, page: ResultInfo[]): void {
    el.classList.add(CLASSES.result);
    if (this.settings.cleanLinks) this.cleanLinks(el, info);
    if (!info.host) return;
    this.ensureBlockButton(el, info.host);
    const warning = checkLookalike(info, query, page);
    el.classList.toggle(CLASSES.suspicious, !!warning);
    if (warning) {
      const box = this.ensureWarning(el);
      setText(box.querySelector('span')!, warning.message);
      box.hidden = false;
    } else {
      const box = this.warnings.get(el);
      if (box) box.hidden = true;
    }
  }

  /** Point the result's links at the real destination and stop click pings. */
  private cleanLinks(result: HTMLElement, info: ResultInfo): void {
    const target = info.url ? stripTracking(info.url) : null;
    for (const link of result.querySelectorAll<HTMLAnchorElement>('a[href]')) {
      link.removeAttribute('ping');
      if (target && link.getAttribute('href') === info.href) link.setAttribute('href', target);
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

  private ensureWarning(result: HTMLElement): HTMLElement {
    let box = this.warnings.get(result);
    if (!box?.isConnected) {
      box = document.createElement('div');
      box.className = CLASSES.warning;
      box.setAttribute('role', 'note');
      box.append(document.createElement('span'));
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
        text.textContent = '已折叠搜索引擎生成的 AI 回答。';
        const show = document.createElement('button');
        show.type = 'button';
        show.textContent = '展开';
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
      show.textContent = '显示';
      notice.append(document.createElement('span'), show);
      first.before(notice);
      this.notices.set(first, notice);
    }
    const sites = [...new Set(run.map((r) => siteOf(r.info.host!)))];
    setText(notice.querySelector('span')!, `隐藏了 ${run.length} 条来自 ${sites.join('、')} 的结果，这些是你屏蔽的网站。`);
    // Rebind on every pass: the run behind this notice can change.
    notice.querySelector('button')!.onclick = () => {
      for (const r of run) this.revealed.add(r.el);
      this.apply();
    };
    notice.hidden = false;
    return notice;
  }
}
