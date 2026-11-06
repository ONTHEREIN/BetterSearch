import {
  adapterForHost,
  addRule,
  loadSettings,
  removeRule,
  saveSettings,
  siteOf,
  siteRule,
  type EngineAdapter,
  type Settings,
} from '@bettersearch/core';
import { LAYOUT_CSS } from './layout';
import { Page } from './page';
import { registerMenuCommand, store } from './platform';
import { addGearButton, toggleSettings, type PanelOptions } from './settings/panel';
import { injectStyle, NO_ADS_CLASS } from './style';
import { syncTheme } from './theme';
import { showToast } from './toast';

function run(adapter: EngineAdapter): void {
  let settings: Settings = loadSettings(store);

  const page = new Page(adapter, {
    onBlockSite(host) {
      const rule = siteRule(host);
      update({ ...settings, rules: addRule(settings.rules, rule) });
      showToast(`已屏蔽 ${siteOf(host)}`, {
        label: '撤销',
        run: () => update({ ...settings, rules: removeRule(settings.rules, rule) }),
      });
    },
  });

  const panel: PanelOptions = {
    getSettings: () => settings,
    getTheme: syncTheme,
    onChange: (next) => update(next),
  };

  function applyGlobal(): void {
    document.documentElement.classList.toggle(NO_ADS_CLASS, settings.removeAds);
  }

  function update(next: Settings): void {
    settings = next;
    page.grid.invalidate();
    saveSettings(store, settings);
    applyGlobal();
    page.update(settings);
  }

  /** Everything that has to be redone when the page swaps its content in place. */
  function refresh(): void {
    injectStyle(adapter.adSelectors, LAYOUT_CSS);
    syncTheme();
    page.apply();
    addGearButton(adapter.searchBar(document), panel);
  }

  function start(): void {
    syncTheme();
    page.update(settings);
    addGearButton(adapter.searchBar(document), panel);
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
  injectStyle(adapter.adSelectors, LAYOUT_CSS);
  applyGlobal();
  registerMenuCommand('BetterSearch 设置', () => toggleSettings(panel));
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

const adapter = adapterForHost(location.hostname);
if (adapter) run(adapter);
