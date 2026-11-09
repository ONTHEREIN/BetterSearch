import { t } from './i18n';
import { mentions } from './sites';
import { registrableDomain, siteOf } from './url';

const CLAIMS_OFFICIAL = /官网|官方|official/i;
/** What a look-alike adds to the brand: `-sc`, `xiazai`, `2026`, ... */
const LOOKALIKE_TAIL = /^[-_]?[a-z0-9]{1,10}$/;

export interface PageResult {
  title: string;
  host: string | null;
  /** Presented by the engine as the site itself; see ResultInfo.prominent. */
  prominent?: boolean;
}

/**
 * Tails a look-alike adds to an official domain's name. Stricter than
 * LOOKALIKE_TAIL because this check does not need the "official" claim:
 * short tags, digits and the words copycats favour, but not ordinary words
 * (pythonhosted.org next to python.org is legitimate).
 */
const COPYCAT_TAIL = /^[-_]?([a-z]{1,3}|\d+|pro|app|pc|soft|down|download|xiazai|guanwang|official|online|client)$/;
const MIN_BRAND_LENGTH = 4;
/** Query words that are never a brand, however the title uses them. */
const NOT_BRANDS = new Set([
  'download', 'free', 'official', 'app', 'apk', 'pc', 'windows', 'win', 'mac', 'macos', 'android', 'ios',
  'linux', 'version', 'latest', 'setup', 'install', 'installer', 'online', 'login', 'web', 'site', 'the', 'and',
  'for', 'pro', 'crack', 'portable', 'client', 'chinese', 'english',
]);

/**
 * Words around a brand in a download search that are not the brand:
 * 「原神官网下载」 is about 原神. Longest first, so 官方网站 goes before 官方.
 */
const CJK_FILLER = [
  '官方网站', '下载安装', '最新版本', '官方版', '最新版', '中文版', '电脑版', '手机版', '安卓版', '苹果版', '绿色版',
  '破解版', '免费版', '正式版', '安装包', '客户端', '官网', '官方', '网站', '下载', '最新', '免费', '安装', '入口',
  '登录', '注册', '首页', '软件', '正版', '地址', '链接', '版本', '在线', '网页版',
].sort((a, b) => b.length - a.length);

export interface LookalikeContext {
  /**
   * Whether the result's domain is in the known-sites list: true or false;
   * undefined while its shard downloads; null when the list is off, in which
   * case only the domain-shape rules apply.
   */
  known?: boolean | null;
}

export interface LookalikeWarning {
  /** Shown to the user under the result. */
  message: string;
  /** The page's own result whose domain is exactly the brand, if any. */
  likelyOfficial: string | null;
}

/** First label of the registrable domain: `workbuddy-sc.com.cn` -> `workbuddy-sc`. */
function domainLabel(host: string): string {
  return registrableDomain(host).split('.')[0] ?? '';
}

/** Latin words of 3+ characters in the query, which are likely brand names. */
export function brandTokens(query: string): string[] {
  return [...new Set(query.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
}

/**
 * Names in the query a fake official site would claim: its Latin words, and
 * its CJK runs with download words removed (「原神官网下载」 -> 原神).
 */
export function brandTerms(query: string): string[] {
  const latin = brandTokens(query).filter((w) => !NOT_BRANDS.has(w));
  let rest = query.toLowerCase().replace(/[a-z0-9]+/g, ' ');
  for (const word of CJK_FILLER) rest = rest.split(word).join(' ');
  const cjk = rest.match(/[\u3400-\u9fff\uf900-\ufaff]{2,}/g) ?? [];
  return [...new Set([...latin, ...cjk])];
}

/** The part of a host that names the site: `uuyc` for uuyc.163.com, `workbuddy` for www.workbuddy.cn. */
function siteName(host: string): string {
  return siteOf(host).split('.')[0] ?? '';
}

/**
 * Flag a result whose domain looks like a copy of the real site's. This is a
 * hint only: it never blocks anything.
 */
export function checkLookalike(
  result: PageResult,
  query: string,
  page: PageResult[],
  { known = null }: LookalikeContext = {},
): LookalikeWarning | null {
  // The engine vouches for a result it presents as the site itself; copies
  // rarely get sitelinks or Baidu's badge. A site in the known-sites list is
  // some organization's real site, not a throwaway copy. While the list is
  // still being asked, say nothing rather than warn and take it back.
  if (!result.host || result.prominent || known === true || known === undefined) return null;
  return (
    claimsOfficialOnBrandDomain(result, query, page) ??
    imitatesProminent(result, page) ??
    (known === false ? claimsOfficialUnknownSite(result, query) : null)
  );
}

/**
 * A result that calls itself the official site of a brand from the query
 * while its domain is in no list of known sites and does not even name the
 * brand. Brand-named domains are claimsOfficialOnBrandDomain's.
 */
function claimsOfficialUnknownSite(result: PageResult, query: string): LookalikeWarning | null {
  if (!CLAIMS_OFFICIAL.test(result.title)) return null;
  const label = domainLabel(result.host!);
  for (const brand of brandTerms(query)) {
    if (label.includes(brand) || !mentions(result.title, brand)) continue;
    return { message: t('lookalike.unknown', { site: registrableDomain(result.host!), brand }), likelyOfficial: null };
  }
  return null;
}

/**
 * A domain that is a prominent result's site name plus a copycat tail, e.g.
 * uuycpro.com.cn next to uuyc.163.com with sitelinks. Needs no "official"
 * claim in the title and no brand word in the query.
 */
function imitatesProminent(result: PageResult, page: PageResult[]): LookalikeWarning | null {
  const site = registrableDomain(result.host!);
  const label = site.split('.')[0] ?? '';
  for (const official of page) {
    if (!official.prominent || !official.host || official === result) continue;
    if (registrableDomain(official.host) === site) continue;
    const name = siteName(official.host);
    if (name.length < MIN_BRAND_LENGTH || label === name || !label.startsWith(name)) continue;
    if (!COPYCAT_TAIL.test(label.slice(name.length))) continue;
    return {
      message: t('lookalike.prominent', { site, official: siteOf(official.host) }),
      likelyOfficial: official.host,
    };
  }
  return null;
}

/**
 * A result that calls itself the official site while its domain is a brand
 * word from the query plus a short tail, e.g. "WorkBuddy官网" on
 * workbuddy-sc.com.cn.
 */
function claimsOfficialOnBrandDomain(result: PageResult, query: string, page: PageResult[]): LookalikeWarning | null {
  if (!CLAIMS_OFFICIAL.test(result.title)) return null;
  const label = domainLabel(result.host!);
  for (const brand of brandTokens(query)) {
    if (label === brand || !label.startsWith(brand)) continue;
    if (!LOOKALIKE_TAIL.test(label.slice(brand.length))) continue;
    const official = page.find((r) => r.host && domainLabel(r.host) === brand)?.host ?? null;
    const site = registrableDomain(result.host!);
    return {
      message: official
        ? t('lookalike.claimsWithOfficial', { brand, official: registrableDomain(official), site })
        : t('lookalike.claims', { site, brand }),
      likelyOfficial: official,
    };
  }
  return null;
}
