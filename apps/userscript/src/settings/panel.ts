import type { Settings, Subscription } from '@bettersearch/core';
import { mount, unmount } from 'svelte';
import SettingsPanel from './Settings.svelte';

const GEAR_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"></path></svg>';

export interface SubscriptionStatus {
  fetchedAt: number | null;
  ruleCount: number;
  error: string | null;
}

export interface PanelOptions {
  getSettings(): Settings;
  getTheme(): 'dark' | 'light';
  refreshSubscriptions(): Promise<void>;
  subscriptionStatus(sub: Subscription): SubscriptionStatus;
  onChange(settings: Settings): void;
}

let open: { host: HTMLElement; app: ReturnType<typeof mount> } | null = null;

export function closeSettings(): void {
  if (!open) return;
  void unmount(open.app);
  open.host.remove();
  open = null;
}

export function openSettings(options: PanelOptions): void {
  if (open) return;
  const host = document.createElement('div');
  host.id = 'bettersearch-settings';
  host.dataset.theme = options.getTheme();
  // Outside <body> so the page's mutation observer does not see it.
  document.documentElement.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const app = mount(SettingsPanel, {
    target: shadow,
    props: {
      settings: options.getSettings(),
      onchange: options.onChange,
      onclose: closeSettings,
      refreshSubscriptions: options.refreshSubscriptions,
      subscriptionStatus: options.subscriptionStatus,
    },
  });
  open = { host, app };
}

export function toggleSettings(options: PanelOptions): void {
  if (open) closeSettings();
  else openSettings(options);
}

/** Put a gear button right of the engine's search bar, if one can be found. */
export function addGearButton(bar: HTMLElement | null, options: PanelOptions): void {
  if (!bar || bar.querySelector('.bs-gear')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'bs-gear';
  button.title = 'BetterSearch 设置（Alt+,）';
  button.setAttribute('aria-label', 'BetterSearch 设置');
  button.innerHTML = GEAR_ICON;
  Object.assign(button.style, {
    position: 'absolute',
    top: '50%',
    right: '-52px',
    transform: 'translateY(-50%)',
    width: '40px',
    height: '40px',
    padding: '0',
    border: '0',
    borderRadius: '50%',
    background: 'transparent',
    color: 'inherit',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  });
  button.addEventListener('click', () => toggleSettings(options));
  if (getComputedStyle(bar).position === 'static') bar.style.position = 'relative';
  bar.append(button);
}
