import { siteOf } from './url';

/**
 * A subset of the uBlacklist rule syntax, one rule per line:
 *
 *   *://*.example.com/*   match pattern (scheme `*`, `http` or `https`)
 *   example.com           shorthand for `*://*.example.com/*`
 *   /tracker\d+/          regular expression tested against the whole URL
 *   @*://ok.example.com/* `@` prefix: never block what this matches
 *   # comment
 */
export interface RuleSet {
  blocks(url: string): boolean;
}

type Matcher = (url: URL) => boolean;

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function compileMatchPattern(pattern: string): Matcher | null {
  const m = pattern.match(/^(\*|https?):\/\/(\*|(?:\*\.)?[^/*]+)(\/.*)$/);
  if (!m) return null;
  const [, scheme, host, path] = m as unknown as [string, string, string, string];
  const pathRe = globToRegExp(path);
  return (url) => {
    if (scheme !== '*' && url.protocol !== `${scheme}:`) return false;
    if (host !== '*') {
      if (host.startsWith('*.')) {
        const base = host.slice(2);
        if (url.hostname !== base && !url.hostname.endsWith(`.${base}`)) return false;
      } else if (url.hostname !== host) {
        return false;
      }
    }
    return pathRe.test(url.pathname + url.search);
  };
}

function compileLine(line: string): Matcher | null {
  if (line.length > 2 && line.startsWith('/') && line.endsWith('/')) {
    try {
      const re = new RegExp(line.slice(1, -1));
      return (url) => re.test(url.href);
    } catch {
      return null;
    }
  }
  if (line.includes('://')) return compileMatchPattern(line);
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(line)) return compileMatchPattern(`*://*.${line.toLowerCase()}/*`);
  return null;
}

export function compileRules(text: string): RuleSet {
  const block: Matcher[] = [];
  const allow: Matcher[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const isAllow = line.startsWith('@');
    const matcher = compileLine(isAllow ? line.slice(1) : line);
    if (matcher) (isAllow ? allow : block).push(matcher);
  }
  return {
    blocks(href) {
      let url: URL;
      try {
        url = new URL(href);
      } catch {
        return false;
      }
      return block.some((m) => m(url)) && !allow.some((m) => m(url));
    },
  };
}

/** The rule added when the user clicks "block this site". */
export function siteRule(host: string): string {
  return `*://*.${siteOf(host)}/*`;
}
