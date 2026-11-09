import type { Fetcher } from './subscriptions';
import type { KeyValueStore } from './types';
import { registrableDomain } from './url';

const RAW = 'https://raw.githubusercontent.com/ONTHEREIN/bettersearch-rules/main';
/** A copy the rules repo's workflow pushes after each build. */
const GITEE = 'https://gitee.com/R3less/bettersearch-rules/raw/main';
const JSDELIVR = 'https://cdn.jsdelivr.net/gh/ONTHEREIN/bettersearch-rules@main';

/** Shards are rebuilt weekly; checking more often only costs requests. */
export const SHARD_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
/** After a failed download, wait this long before asking any mirror again. */
const RETRY_AFTER_MS = 10 * 60 * 1000;

/**
 * Where a shard of the known-sites list can be downloaded, in the order to try
 * them. Gitee is reachable from mainland China, jsDelivr mostly; GitHub is
 * the source. `githubProxy` is a user-chosen prefix such as
 * `https://ghfast.top/`, tried first when set.
 */
export function shardUrls(shard: string, githubProxy = ''): string[] {
  const path = `sites/${shard}.txt`;
  const urls = [
    `${GITEE}/${path}`,
    `${JSDELIVR}/${path}`,
    `${RAW}/${path}`,
  ];
  const proxy = githubProxy.trim();
  if (/^https?:\/\//.test(proxy)) urls.unshift(`${proxy.replace(/\/*$/, '/')}${RAW}/${path}`);
  return urls;
}

/** First three hex digits of the 32-bit FNV-1a hash of `domain`'s UTF-16 code units. Mirrors the rules repo's build. */
export function shardOf(domain: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < domain.length; i++) {
    h ^= domain.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0').slice(0, 3);
}

/**
 * A list of `key` or `key = value` lines sorted by UTF-16 code units, after an
 * optional header of `#` comments. Lookups binary-search the raw text, so a
 * list is never split into lines.
 */
export class SortedList {
  private readonly start: number;

  constructor(private readonly text: string) {
    let start = 0;
    while (text.startsWith('#', start)) {
      const end = text.indexOf('\n', start);
      start = end === -1 ? text.length : end + 1;
    }
    this.start = start;
  }

  /** The value for `key` (`''` for a bare key), or null when absent. */
  get(key: string): string | null {
    const { text } = this;
    // `lo` is always a line start; the line holding `key`, if any, starts in [lo, hi).
    let lo = this.start;
    let hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const start = text.lastIndexOf('\n', mid - 1) + 1;
      let end = text.indexOf('\n', start);
      if (end === -1) end = text.length;
      const sep = text.indexOf(' = ', start);
      const lineKey = text.slice(start, sep !== -1 && sep < end ? sep : end);
      if (lineKey === key) return sep !== -1 && sep < end ? text.slice(sep + 3, end) : '';
      if (lineKey < key) lo = end + 1;
      else hi = start;
    }
    return null;
  }
}

/** A site in the known-sites list. */
export interface KnownSite {
  /** Brands and products this domain is the official site of, per Wikidata; often empty. */
  names: string[];
}

interface CachedShard {
  fetchedAt: number;
  text: string;
}

/**
 * The known-sites list: every domain Wikidata records as an official website,
 * plus the most-linked domains. Shards are downloaded when first needed and
 * kept in storage; `peek` never waits, and `onLoad` runs when a shard it asked
 * for arrives, so the caller can look again.
 */
export class SiteDirectory {
  private readonly lists = new Map<string, { fetchedAt: number; list: SortedList }>();
  private readonly pending = new Set<string>();
  private readonly failedAt = new Map<string, number>();

  constructor(
    private readonly store: KeyValueStore,
    private readonly fetcher: Fetcher,
    private readonly urls: (shard: string) => string[],
    private readonly onLoad: () => void,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * What the list says about `host`: the site, null when it is not listed, or
   * undefined while its shard is still downloading. A shard that could not be
   * downloaded counts as not listed.
   */
  peek(host: string): KnownSite | null | undefined {
    const domain = registrableDomain(host.toLowerCase());
    const shard = shardOf(domain);
    const loaded = this.load(shard);
    if (!loaded) return this.failedAt.has(shard) ? null : undefined;
    const value = loaded.get(domain);
    return value === null ? null : { names: value ? value.split('|') : [] };
  }

  private load(shard: string): SortedList | null {
    let entry = this.lists.get(shard);
    if (!entry) {
      const cached = this.store.get<CachedShard | null>(`sites:${shard}`, null);
      if (cached) {
        entry = { fetchedAt: cached.fetchedAt, list: new SortedList(cached.text) };
        this.lists.set(shard, entry);
      }
    }
    // A stale shard is still used while a fresh one downloads.
    if (!entry || this.now() - entry.fetchedAt >= SHARD_REFRESH_MS) void this.download(shard);
    return entry?.list ?? null;
  }

  private async download(shard: string): Promise<void> {
    const failed = this.failedAt.get(shard);
    if (this.pending.has(shard) || (failed !== undefined && this.now() - failed < RETRY_AFTER_MS)) return;
    this.pending.add(shard);
    try {
      for (const url of this.urls(shard)) {
        try {
          const text = await this.fetcher(url);
          const entry = { fetchedAt: this.now(), text };
          this.store.set(`sites:${shard}`, entry);
          this.lists.set(shard, { fetchedAt: entry.fetchedAt, list: new SortedList(text) });
          this.failedAt.delete(shard);
          return;
        } catch {
          // Try the next mirror.
        }
      }
      this.failedAt.set(shard, this.now());
    } finally {
      this.pending.delete(shard);
      this.onLoad();
    }
  }
}

/** Lowercase, without quotes, whitespace collapsed: how the list writes names. */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/["“”「」『』]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const isWordChar = (c: string | undefined) => !!c && /[a-z0-9]/.test(c);

/**
 * Whether `name` appears in `text` as a whole word (for Latin) or anywhere
 * (for CJK, which has no spaces). Both are normalized first.
 */
export function mentions(text: string, name: string): boolean {
  const s = normalizeText(text);
  const n = normalizeText(name);
  if (!n) return false;
  for (let i = s.indexOf(n); i !== -1; i = s.indexOf(n, i + 1)) {
    const before = isWordChar(s[i - 1]) && isWordChar(n[0]);
    const after = isWordChar(s[i + n.length]) && isWordChar(n[n.length - 1]);
    if (!before && !after) return true;
  }
  return false;
}

/** The longest of the site's names that the query mentions: what the site is official for here. */
export function officialFor(site: KnownSite, query: string): string | null {
  let best: string | null = null;
  for (const name of site.names) {
    if ((!best || name.length > best.length) && mentions(query, name)) best = name;
  }
  return best;
}
