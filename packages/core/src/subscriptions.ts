import type { KeyValueStore } from './types';

export interface Subscription {
  /** Mirrors of the same list, tried in order until one answers. */
  urls: string[];
  enabled: boolean;
}

export interface CachedList {
  fetchedAt: number;
  /** The URL that answered. */
  source: string;
  rules: string;
}

export interface FetchFailure {
  failedAt: number;
  message: string;
}

export type Fetcher = (url: string) => Promise<string>;

export const REFRESH_AFTER_MS = 24 * 60 * 60 * 1000;

const cacheKey = (sub: Subscription) => `subscription:${sub.urls[0] ?? ''}`;
const failureKey = (sub: Subscription) => `subscription-error:${sub.urls[0] ?? ''}`;

export function cachedList(store: KeyValueStore, sub: Subscription): CachedList | null {
  return store.get<CachedList | null>(cacheKey(sub), null);
}

export function lastFailure(store: KeyValueStore, sub: Subscription): FetchFailure | null {
  return store.get<FetchFailure | null>(failureKey(sub), null);
}

export function isStale(list: CachedList | null, now: number): boolean {
  return !list || now - list.fetchedAt >= REFRESH_AFTER_MS;
}

/**
 * Fetch a subscription from the first mirror that answers and cache it. On
 * failure the previous copy stays in use and the error is recorded.
 */
export async function refreshSubscription(
  store: KeyValueStore,
  sub: Subscription,
  fetcher: Fetcher,
  now = Date.now(),
): Promise<CachedList | null> {
  const errors: string[] = [];
  for (const url of sub.urls) {
    try {
      const rules = await fetcher(url);
      const list = { fetchedAt: now, source: url, rules };
      store.set(cacheKey(sub), list);
      store.set(failureKey(sub), null);
      return list;
    } catch (error) {
      errors.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  store.set(failureKey(sub), { failedAt: now, message: errors.join('; ') });
  return cachedList(store, sub);
}

/** The user's own rules followed by every enabled subscription's cached rules. */
export function combinedRules(store: KeyValueStore, userRules: string, subs: Subscription[]): string {
  const lists = subs.filter((s) => s.enabled).map((s) => cachedList(store, s)?.rules ?? '');
  return [userRules, ...lists].join('\n');
}
