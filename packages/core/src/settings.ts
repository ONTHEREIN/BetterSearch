import type { KeyValueStore } from './types';

export type BlockAction = 'collapse' | 'hide';

export interface Settings {
  removeAds: boolean;
  blockAction: BlockAction;
  /** Block rules in uBlacklist syntax, one per line. */
  rules: string;
}

export const DEFAULT_SETTINGS: Settings = {
  removeAds: true,
  blockAction: 'collapse',
  rules: '',
};

const KEY = 'settings';

export function loadSettings(store: KeyValueStore): Settings {
  return { ...DEFAULT_SETTINGS, ...store.get<Partial<Settings>>(KEY, {}) };
}

export function saveSettings(store: KeyValueStore, settings: Settings): void {
  store.set(KEY, settings);
}

/** Append `rule` unless an identical line already exists. */
export function addRule(rules: string, rule: string): string {
  const lines = rules.split('\n').map((l) => l.trim());
  if (lines.includes(rule)) return rules;
  return rules.trim() ? `${rules.trimEnd()}\n${rule}` : rule;
}

export function removeRule(rules: string, rule: string): string {
  return rules
    .split('\n')
    .filter((l) => l.trim() !== rule)
    .join('\n');
}
