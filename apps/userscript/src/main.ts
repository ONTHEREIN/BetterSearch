import {
  adapterForHost,
  addRule,
  cachedList,
  combinedRules,
  shardUrls,
  SiteDirectory,
  isStale,
  lastFailure,
  refreshSubscription,
  loadSettings,
  removeRule,
  saveSettings,
  siteOf,
  setLocale,
  detectLocale,
  siteRule,
  t,
  type EngineAdapter,
  type Settings,
} from '@bettersearch/core';
import { LAYOUT_CSS } from './layout';
import { Page } from './page';
import { Pager, pagerCss } from './pager';
import { fetchText, registerMenuCommand, store } from './platform';
import { addGearButton, toggleSettings, type PanelOptions } from './settings/panel';
import { injectStyle, NO_ADS_CLASS } from './style';
import { syncTheme } from './theme';
import { showToast } from './toast';

function run(adapter: EngineAdapter): void {
  let settings: Settings = loadSettings(store);
  // Shards arrive one by one as results need them; re-apply after each.
  const sites = new SiteDirectory(
    store,
    fetchText,
    (shard) => shardUrls(shard, settings.githubProxy),
    () => page.apply(),
  );

  const page = new Page(adapter, {
    sites: () => (settings.markOfficial ? sites : null),
    onBlockSite(host) {
      const rule = siteRule(host);
      update({ ...settings, rules: addRule(settings.rules, rule) });
      showToast(t('block.toast', { site: siteOf(host) }), {
        label: t('block.undo'),
        run: () => update({ ...settings, rules: removeRule(settings.rules, rule) }),
      });
    },
  });

  const pager = new Pager(adapter);
  const allRules = () => combinedRules(store, settings.rules, settings.subscriptions);

  /** Fetch subscriptions that are out of date (or all, when forced), then re-apply. */
  async function refreshSubscriptions(force = false): Promise<void> {
    const now = Date.now();
    const due = settings.subscriptions.filter((s) => s.enabled && (force || isStale(cachedList(store, s), now)));
    if (!due.length) return;
    await Promise.all(due.map((s) => refreshSubscription(store, s, fetchText)));
    page.update(settings, allRules());
  }

  const panel: PanelOptions = {
    getSettings: () => settings,
    getTheme: syncTheme,
    onChange: (next) => {
      const added = next.subscriptions.length > settings.subscriptions.length;
      update(next);
      if (added) void refreshSubscriptions();
    },
    refreshSubscriptions: () => refreshSubscriptions(true),
    subscriptionStatus: (sub) => {
      const list = cachedList(store, sub);
      const failure = lastFailure(store, sub);
      return {
        fetchedAt: list?.fetchedAt ?? null,
        ruleCount: list ? list.rules.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length : 0,
        error: failure?.message ?? null,
      };
    },
  };

  function applyGlobal(): void {
    document.documentElement.classList.toggle(NO_ADS_CLASS, settings.removeAds);
  }

  function update(next: Settings): void {
    settings = next;
    page.grid.invalidate();
    saveSettings(store, settings);
    applyGlobal();
    page.update(settings, allRules());
    pager.sync(settings);
  }

  /** Everything that has to be redone when the page swaps its content in place. */
  function refresh(): void {
    injectStyle(adapter.adSelectors, LAYOUT_CSS + pagerCss(adapter.paginationSelector));
    syncTheme();
    page.apply();
    pager.sync(settings);
    addGearButton(adapter.searchBar(document), panel);
  }

  function start(): void {
    syncTheme();
    page.update(settings, allRules());
    pager.sync(settings);
    addGearButton(adapter.searchBar(document), panel);
    void refreshSubscriptions();
    // Mutation callbacks are already batched and run before the next paint, so
    // new results never show unprocessed. requestAnimationFrame would stall in
    // background tabs. `refresh` is idempotent, so its own mutations settle.
    new MutationObserver(refresh).observe(document.body, { childList: true, subtree: true });
    let resizeTimer = 0;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        page.grid.invalidate();
        page.apply();
      }, 100);
    });
  }

  // Runs at document-start: hide ads before the page paints.
  injectStyle(adapter.adSelectors, LAYOUT_CSS + pagerCss(adapter.paginationSelector));
  applyGlobal();
  registerMenuCommand(t('menu.settings'), () => toggleSettings(panel));
  window.addEventListener('keydown', (event) => {
    if (event.altKey && event.code === 'Comma') {
      event.preventDefault();
      toggleSettings(panel);
    }
  });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}

setLocale(detectLocale(navigator.languages ?? [navigator.language]));
const adapter = adapterForHost(location.hostname);
if (adapter) {
  // At document-start the script can run before the parser has created <html>,
  // and everything here needs it.
  if (document.documentElement) {
    run(adapter);
  } else {
    new MutationObserver((_, observer) => {
      if (!document.documentElement) return;
      observer.disconnect();
      run(adapter);
    }).observe(document, { childList: true });
  }
}
