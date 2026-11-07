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

/** The part of a host that names the site: `uuyc` for uuyc.163.com, `workbuddy` for www.workbuddy.cn. */
function siteName(host: string): string {
  return siteOf(host).split('.')[0] ?? '';
}

/**
 * Flag a result whose domain looks like a copy of the real site's. This is a
 * hint only: it never blocks anything.
 */
export function checkLookalike(result: PageResult, query: string, page: PageResult[]): LookalikeWarning | null {
  if (!result.host) return null;
  return claimsOfficialOnBrandDomain(result, query, page) ?? imitatesProminent(result, page);
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
      message: `${site} 的域名像是在 ${siteOf(official.host)} 后面加了后缀，可能是仿冒的。搜索引擎把 ${siteOf(official.host)} 列为这个网站本身，下载前请核对。`,
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
        ? `这个网站自称官网，但 ${brand} 的官网可能是 ${registrableDomain(official)}。${site} 的域名像是仿冒的，下载前请核对。`
        : `这个网站自称官网，但 ${site} 的域名像是在 ${brand} 后面加了后缀，可能是仿冒的。下载前请核对。`,
      likelyOfficial: official,
    };
  }
  return null;
}
