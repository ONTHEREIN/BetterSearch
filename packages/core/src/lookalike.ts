import { registrableDomain } from './url';

const CLAIMS_OFFICIAL = /官网|官方|official/i;
/** What a look-alike adds to the brand: `-sc`, `xiazai`, `2026`, ... */
const LOOKALIKE_TAIL = /^[-_]?[a-z0-9]{1,10}$/;

export interface PageResult {
  title: string;
  host: string | null;
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
 * Flag a result that calls itself the official site while its domain is the
 * brand plus a short tail, e.g. "WorkBuddy官网" on workbuddy-sc.com.cn. This is
 * a hint only: it never blocks anything.
 */
export function checkLookalike(result: PageResult, query: string, page: PageResult[]): LookalikeWarning | null {
  if (!result.host || !CLAIMS_OFFICIAL.test(result.title)) return null;
  const label = domainLabel(result.host);
  for (const brand of brandTokens(query)) {
    if (label === brand || !label.startsWith(brand)) continue;
    if (!LOOKALIKE_TAIL.test(label.slice(brand.length))) continue;
    const official = page.find((r) => r.host && domainLabel(r.host) === brand)?.host ?? null;
    const site = registrableDomain(result.host);
    return {
      message: official
        ? `这个网站自称官网，但 ${brand} 的官网可能是 ${registrableDomain(official)}。${site} 的域名像是仿冒的，下载前请核对。`
        : `这个网站自称官网，但 ${site} 的域名像是在 ${brand} 后面加了后缀，可能是仿冒的。下载前请核对。`,
      likelyOfficial: official,
    };
  }
  return null;
}
