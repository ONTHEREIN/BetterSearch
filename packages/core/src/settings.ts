import type { Subscription } from './subscriptions';
import type { KeyValueStore } from './types';

export type BlockAction = 'collapse' | 'hide';
export type Columns = 'auto' | '1' | '2' | '3';
export type CardStyle = 'card' | 'line';
export type Density = 'compact' | 'comfortable';
/** Where result links open; `engine` keeps each engine's own behaviour. */
export type OpenLinks = 'engine' | 'new' | 'same';

export interface Settings {
  /** Schema version, for migrating stored settings. */
  version: number;
  removeAds: boolean;
  /** Link straight to the destination and drop tracking parameters. */
  cleanLinks: boolean;
  openLinks: OpenLinks;
  blockAction: BlockAction;
  /** Rearrange results into a grid; off keeps the engine's own layout. */
  layout: boolean;
  /** Most columns to use; fewer when the window is too narrow. `auto` allows three. */
  columns: Columns;
  cardStyle: CardStyle;
  density: Density;
  /** Load the next page of results when scrolling near the end. */
  autoPage: boolean;
  /** Pages loaded automatically before switching to a "load more" button. */
  autoPageLimit: number;
  /** Fold the engine's own AI answer into a one-line bar. */
  collapseAiAnswers: boolean;
  /** Block rules in uBlacklist syntax, one per line. */
  rules: string;
  /** Rule lists fetched from the web, in the same syntax. */
  subscriptions: Subscription[];
}

export const SETTINGS_VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  removeAds: true,
  cleanLinks: true,
  openLinks: 'engine',
  blockAction: 'collapse',
  layout: true,
  columns: '2',
  cardStyle: 'card',
  density: 'compact',
  collapseAiAnswers: true,
  autoPage: true,
  autoPageLimit: 5,
  rules: '',
  subscriptions: [],
};

const KEY = 'settings';

/** Bring settings saved by an older version up to date. */
export function migrateSettings(stored: Partial<Settings>): Partial<Settings> {
  const next = { ...stored };
  // v1 defaulted to `auto` columns, which meant three on wide windows. Two is
  // the intended default; `auto` remains available as an explicit choice.
  if ((next.version ?? 1) < 2 && next.columns === 'auto') next.columns = '2';
  next.version = SETTINGS_VERSION;
  return next;
}

export function loadSettings(store: KeyValueStore): Settings {
  const stored = store.get<Partial<Settings> | null>(KEY, null);
  return { ...DEFAULT_SETTINGS, ...(stored ? migrateSettings(stored) : {}) };
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
