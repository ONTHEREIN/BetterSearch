import type { KeyValueStore } from './types';

export type BlockAction = 'collapse' | 'hide';
export type Columns = 'auto' | '1' | '2' | '3';
export type CardStyle = 'card' | 'line';
export type Density = 'compact' | 'comfortable';

export interface Settings {
  removeAds: boolean;
  /** Link straight to the destination and drop tracking parameters. */
  cleanLinks: boolean;
  blockAction: BlockAction;
  /** Rearrange results into a grid; off keeps the engine's own layout. */
  layout: boolean;
  /** `auto` picks as many columns as the available width allows. */
  columns: Columns;
  cardStyle: CardStyle;
  density: Density;
  /** Fold the engine's own AI answer into a one-line bar. */
  collapseAiAnswers: boolean;
  /** Block rules in uBlacklist syntax, one per line. */
  rules: string;
}

export const DEFAULT_SETTINGS: Settings = {
  removeAds: true,
  cleanLinks: true,
  blockAction: 'collapse',
  layout: true,
  columns: 'auto',
  cardStyle: 'card',
  density: 'compact',
  collapseAiAnswers: true,
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
