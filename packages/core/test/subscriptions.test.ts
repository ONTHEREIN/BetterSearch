import { describe, expect, it } from 'vitest';
import {
  cachedList,
  combinedRules,
  isStale,
  lastFailure,
  refreshSubscription,
  REFRESH_AFTER_MS,
  type KeyValueStore,
  type Subscription,
} from '../src';

function memoryStore(): KeyValueStore {
  const data = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback: T) => (data.has(key) ? (data.get(key) as T) : fallback),
    set: (key, value) => void data.set(key, value),
  };
}

const sub: Subscription = { urls: ['https://a.example/list.txt', 'https://b.example/list.txt'], enabled: true };

describe('refreshSubscription', () => {
  it('falls back to the next mirror and caches the answer', async () => {
    const store = memoryStore();
    const list = await refreshSubscription(
      store,
      sub,
      async (url) => {
        if (url.startsWith('https://a.')) throw new Error('timeout');
        return '*://*.farm.example/*';
      },
      1000,
    );
    expect(list).toEqual({ fetchedAt: 1000, source: 'https://b.example/list.txt', rules: '*://*.farm.example/*' });
    expect(cachedList(store, sub)).toEqual(list);
    expect(lastFailure(store, sub)).toBeNull();
  });

  it('keeps the previous copy and records the error when every mirror fails', async () => {
    const store = memoryStore();
    await refreshSubscription(store, sub, async () => 'old.example', 1000);
    const list = await refreshSubscription(store, sub, async () => Promise.reject(new Error('offline')), 2000);
    expect(list?.rules).toBe('old.example');
    expect(lastFailure(store, sub)).toEqual({ failedAt: 2000, message: expect.stringContaining('offline') });
  });
});

describe('isStale', () => {
  it('is stale when missing or older than a day', () => {
    expect(isStale(null, 0)).toBe(true);
    expect(isStale({ fetchedAt: 0, source: '', rules: '' }, REFRESH_AFTER_MS - 1)).toBe(false);
    expect(isStale({ fetchedAt: 0, source: '', rules: '' }, REFRESH_AFTER_MS)).toBe(true);
  });
});

describe('combinedRules', () => {
  it('appends enabled subscriptions to the user rules', async () => {
    const store = memoryStore();
    await refreshSubscription(store, sub, async () => 'farm.example');
    const off = { urls: ['https://c.example/x.txt'], enabled: false };
    await refreshSubscription(store, off, async () => 'ignored.example');
    expect(combinedRules(store, 'mine.example', [sub, off])).toBe('mine.example\nfarm.example');
  });
});
