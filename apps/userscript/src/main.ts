import {
  addRule,
  googleAdapter,
  loadSettings,
  removeRule,
  saveSettings,
  siteRule,
  stripWww,
  type Settings,
} from '@bettersearch/core';
import { Page } from './page';
import { registerMenuCommand, store } from './platform';
import { addGearButton, toggleSettings, type PanelOptions } from './settings/panel';
import { injectStyle, NO_ADS_CLASS } from './style';
import { showToast } from './toast';

const adapter = googleAdapter;
let settings: Settings = loadSettings(store);

const page = new Page(adapter, {
  onBlockSite(host) {
    const rule = siteRule(host);
    update({ ...settings, rules: addRule(settings.rules, rule) });
    showToast(`已屏蔽 ${stripWww(host)}`, {
      label: '撤销',
      run: () => update({ ...settings, rules: removeRule(settings.rules, rule) }),
    });
  },
});

const panel: PanelOptions = {
  getSettings: () => settings,
  onChange: (next) => update(next),
};

function applyGlobal(): void {
  document.documentElement.classList.toggle(NO_ADS_CLASS, settings.removeAds);
}

function update(next: Settings): void {
  settings = next;
  saveSettings(store, settings);
  applyGlobal();
  page.update(settings);
}

function watchForResults(): void {
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      page.apply();
    });
  }).observe(document.body, { childList: true, subtree: true });
}

function start(): void {
  page.update(settings);
  addGearButton(document.querySelector('textarea[name="q"], input[name="q"]'), panel);
  watchForResults();
}

if (adapter.matches(new URL(location.href))) {
  // Runs at document-start: hide ads before the page paints.
  injectStyle();
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
