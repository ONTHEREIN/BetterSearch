import { describe, expect, it } from 'vitest';
import {
  brandTerms,
  checkLookalike,
  mentions,
  officialFor,
  shardOf,
  shardUrls,
  SiteDirectory,
  SortedList,
  type KeyValueStore,
} from '../src';

function memoryStore(): KeyValueStore {
  const data = new Map<string, unknown>();
  return {
    get: <T>(key: string, fallback: T) => (data.has(key) ? (data.get(key) as T) : fallback),
    set: (key, value) => void data.set(key, value),
  };
}

// Sorted by the domain alone, as the rules repo writes shards.
const lines = ['7-zip.org = 7-zip|7zip', 'a.com', 'a.com.cn = a cn', 'qq.com = 微信|腾讯|腾讯视频', 'zz.net'];

describe('SortedList', () => {
  const list = new SortedList(`${lines.join('\n')}\n`);

  it('finds every key, with or without a value', () => {
    expect(list.get('7-zip.org')).toBe('7-zip|7zip');
    expect(list.get('a.com')).toBe('');
    expect(list.get('a.com.cn')).toBe('a cn');
    expect(list.get('zz.net')).toBe('');
  });

  it.each(['', 'a', 'a.co', 'qq.co', 'zzz.net', '7-zip'])('misses %o', (key) => {
    expect(list.get(key)).toBeNull();
  });

  it('skips a header and handles an empty list', () => {
    expect(new SortedList('# header\na.com').get('a.com')).toBe('');
    expect(new SortedList('').get('a')).toBeNull();
  });
});

describe('shardOf', () => {
  it('matches the build script, which hashes the same way', () => {
    // Values computed by scripts/build.mjs in the rules repo.
    expect(shardOf('')).toBe('811');
    expect(shardOf('qq.com')).toBe('d46');
    expect(shardOf('7-zip.org')).toBe('41d');
  });
});

describe('shardUrls', () => {
  it('tries Gitee, jsDelivr, then GitHub, with a proxy first when set', () => {
    expect(shardUrls('abc')).toEqual([
      'https://gitee.com/R3less/bettersearch-rules/raw/main/sites/abc.txt',
      'https://cdn.jsdelivr.net/gh/ONTHEREIN/bettersearch-rules@main/sites/abc.txt',
      'https://raw.githubusercontent.com/ONTHEREIN/bettersearch-rules/main/sites/abc.txt',
    ]);
    expect(shardUrls('abc', 'https://ghfast.top')[0]).toBe(
      'https://ghfast.top/https://raw.githubusercontent.com/ONTHEREIN/bettersearch-rules/main/sites/abc.txt',
    );
    expect(shardUrls('abc', 'not a url')).toHaveLength(3);
  });
});

describe('SiteDirectory', () => {
  const shardText = (domains: string[]) => `${lines.filter((l) => domains.includes(l.split(' = ')[0]!)).join('\n')}\n`;

  function setup(fetcher: (url: string) => Promise<string>) {
    const store = memoryStore();
    let now = 1_000_000;
    let loads = 0;
    const requested: string[] = [];
    const dir = new SiteDirectory(
      store,
      (url) => {
        requested.push(url);
        return fetcher(url);
      },
      (shard) => [`https://a/${shard}`, `https://b/${shard}`],
      () => loads++,
      () => now,
    );
    return { dir, store, requested, loads: () => loads, advance: (ms: number) => (now += ms) };
  }

  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('downloads the shard on first sight, then answers from it', async () => {
    const t = setup(async () => shardText(['qq.com', '7-zip.org']));
    expect(t.dir.peek('v.qq.com')).toBeUndefined();
    await settle();
    expect(t.loads()).toBe(1);
    expect(t.dir.peek('v.qq.com')).toEqual({ names: ['微信', '腾讯', '腾讯视频'] });
    expect(t.requested).toEqual([`https://a/${shardOf('qq.com')}`]);
  });

  it('answers null for a domain its shard does not list', async () => {
    const t = setup(async () => shardText(['zz.net']));
    t.dir.peek('qq.com');
    await settle();
    expect(t.dir.peek('qq.com')).toBeNull();
  });

  it('falls back to the next mirror and treats total failure as unlisted', async () => {
    const t = setup(async (url) => {
      if (url.startsWith('https://a/')) throw new Error('blocked');
      return shardText(['qq.com']);
    });
    t.dir.peek('qq.com');
    await settle();
    expect(t.dir.peek('qq.com')).toEqual({ names: ['微信', '腾讯', '腾讯视频'] });

    const down = setup(async () => {
      throw new Error('offline');
    });
    expect(down.dir.peek('example.com')).toBeUndefined();
    await settle();
    expect(down.dir.peek('example.com')).toBeNull();
    // No retry storm: the shard is not asked for again right away.
    expect(down.requested).toHaveLength(2);
    down.advance(11 * 60 * 1000);
    down.dir.peek('example.com');
    await settle();
    expect(down.requested).toHaveLength(4);
  });

  it('keeps shards in storage and refreshes them after a week', async () => {
    const t = setup(async () => shardText(['qq.com']));
    t.dir.peek('qq.com');
    await settle();
    const again = new SiteDirectory(t.store, async () => '', () => [], () => {});
    expect(again.peek('qq.com')).not.toBeUndefined();

    t.advance(8 * 24 * 60 * 60 * 1000);
    expect(t.dir.peek('qq.com')).not.toBeUndefined();
    expect(t.requested).toHaveLength(2);
  });
});

describe('mentions and officialFor', () => {
  it('needs whole words for Latin and not for CJK', () => {
    expect(mentions('Steam官方下载', 'steam')).toBe(true);
    expect(mentions('Steamboat 官网', 'steam')).toBe(false);
    expect(mentions('电脑版微信官方下载', '微信')).toBe(true);
    expect(mentions('7-Zip 官网', '7-zip')).toBe(true);
  });

  it('picks the longest name the query mentions', () => {
    const qq = { names: ['微信', '腾讯', '腾讯视频'] };
    expect(officialFor(qq, '腾讯视频下载')).toBe('腾讯视频');
    expect(officialFor(qq, '腾讯')).toBe('腾讯');
    expect(officialFor(qq, '爱奇艺')).toBeNull();
    expect(officialFor({ names: [] }, '腾讯')).toBeNull();
  });
});

describe('brandTerms', () => {
  it.each([
    ['原神官网下载', ['原神']],
    ['7-zip官方下载最新版', ['zip']],
    ['WorkBuddy 官网 下载 windows', ['workbuddy']],
    ['腾讯视频电脑版', ['腾讯视频']],
    ['官网下载', []],
  ])('%s -> %o', (query, expected) => {
    expect(brandTerms(query)).toEqual(expected);
  });
});

describe('checkLookalike with the known-sites list', () => {
  const check = (title: string, host: string, query: string, known: boolean | null | undefined) =>
    checkLookalike({ title, host }, query, [{ title, host }], { known });

  it('flags an unknown site claiming to be the official site of a brand in the query', () => {
    expect(check('原神官网下载-最新版', 'ys-down.cn', '原神官网', false)?.message).toContain('ys-down.cn');
    expect(check('Bandizip官网下载', 'xzsoft123.cn', 'bandizip 下载', false)?.message).toContain('bandizip');
  });

  it.each([
    ['a known site', '腾讯视频官方最新版下载', 'v.qq.com', '腾讯', true],
    ['a site still being looked up', 'Bandizip官网下载', 'xzsoft123.cn', 'bandizip', undefined],
    ['a site that does not claim to be official', '原神攻略', 'ys-down.cn', '原神', false],
    ['a claim about another brand', '崩坏官网', 'ys-down.cn', '原神官网', false],
    ['a domain that names the brand', 'Bandizip 官网', 'bandizip.cn', 'bandizip', false],
  ] as const)('does not flag %s', (_, title, host, query, known) => {
    expect(check(title, host, query, known)).toBeNull();
  });

  it('still flags a brand-plus-suffix domain when the list is off', () => {
    expect(check('WorkBuddy官网', 'workbuddy-sc.com.cn', 'workbuddy', null)).not.toBeNull();
  });

  it('lets the list clear a brand-plus-suffix domain it knows', () => {
    expect(check('WorkBuddy官网', 'workbuddy-sc.com.cn', 'workbuddy', true)).toBeNull();
  });
});
