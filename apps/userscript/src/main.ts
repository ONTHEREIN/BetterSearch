import {
  adapterForHost,
  errorMessage,
  modelsRequest,
  parseModels,
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
import { Assistant } from './assistant';
import { LAYOUT_CSS } from './layout';
import { Page } from './page';
import { Pager, pagerCss } from './pager';
import { fetchText, onStoreChange, registerMenuCommand, sendRequest, store } from './platform';
import { addGearButton, isSettingsOpen, openSettings, toggleSettings, type PanelOptions } from './settings/panel';
import { injectStyle, NO_ADS_CLASS, setCustomCss } from './style';
import { syncTheme } from './theme';
import { Sync } from './sync';
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

  const assistant = new Assistant({
    settings: () => settings,
    sources: () => page.sources(),
    openSettings: () => openSettings(panel),
  });

  const page = new Page(adapter, {
    sites: () => (settings.markOfficial ? sites : null),
    assistant,
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
  const sync = new Sync({
    settings: () => settings,
    apply(next) {
      update(next);
      // Subscriptions added on another device.
      void refreshSubscriptions();
    },
    busy: isSettingsOpen,
  });
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
    sync: {
      config: () => sync.config(),
      setConfig: (config) => sync.setConfig(config),
      status: () => sync.status(),
      now: () => sync.now(),
    },
    async listModels(config) {
      const { status, body } = await sendRequest(modelsRequest(config));
      if (status < 200 || status >= 300) throw new Error(errorMessage(body) ?? `HTTP ${status}`);
      return parseModels(body);
    },
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
    // Lets custom CSS scope a rule to one engine.
    document.documentElement.dataset.bsEngine = adapter.id;
    setCustomCss(settings.customCss);
  }

  function update(next: Settings): void {
    saveSettings(store, next);
    show(next);
    sync.changed(next);
  }

  function show(next: Settings): void {
    settings = next;
    page.grid.invalidate();
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
    sync.start();
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

  // Another tab changed the settings, or synced them: saving our stale copy would undo that.
  onStoreChange('settings', () => show(loadSettings(store)));

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
