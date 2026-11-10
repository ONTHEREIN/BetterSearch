import type { CardStyle, Density, Settings } from './settings';

/** The part of the settings a shared theme carries. */
export type Theme = Pick<Settings, 'cardStyle' | 'density' | 'customCss'>;

const FORMAT = 'bettersearch-theme';
const CARD_STYLES: readonly CardStyle[] = ['card', 'raised', 'line'];
const DENSITIES: readonly Density[] = ['compact', 'comfortable'];

/** The theme in `settings` as JSON to share. */
export function exportTheme(settings: Settings): string {
  const { cardStyle, density, customCss } = settings;
  return JSON.stringify({ format: FORMAT, version: 1, cardStyle, density, css: customCss }, null, 2);
}

/** Why a shared theme was refused; each is a message key. */
export type ThemeProblem = 'theme.invalid' | 'theme.remote' | 'theme.escape';

/**
 * Reasons not to apply CSS from someone else. CSS can send what the page shows
 * to a server, one character at a time, through attribute selectors and a
 * remote `url()` (`input[value^="a"] { background: url(…?a) }`), so a shared
 * theme may only use inline `data:` URLs. Escapes are refused too: `\75 rl(`
 * is also `url(`.
 */
export function themeCssProblem(css: string): ThemeProblem | null {
  const code = css.replace(/\/\*[\s\S]*?(\*\/|$)/g, ' ').toLowerCase();
  if (code.includes('\\')) return 'theme.escape';
  if (/@import|image-set\(|(^|[^\w-])src\(/.test(code)) return 'theme.remote';
  for (const match of code.matchAll(/url\(\s*(['"]?)\s*([^'")\s]*)/g)) {
    if (!match[2]!.startsWith('data:')) return 'theme.remote';
  }
  return null;
}

/** A shared theme read from `text`, or the reason it cannot be used. */
export function parseTheme(text: string): { theme: Theme } | { problem: ThemeProblem } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { problem: 'theme.invalid' };
  }
  if (!data || typeof data !== 'object') return { problem: 'theme.invalid' };
  const { format, cardStyle, density, css } = data as Record<string, unknown>;
  if (
    format !== FORMAT ||
    !CARD_STYLES.includes(cardStyle as CardStyle) ||
    !DENSITIES.includes(density as Density) ||
    typeof css !== 'string'
  ) {
    return { problem: 'theme.invalid' };
  }
  const problem = themeCssProblem(css);
  if (problem) return { problem };
  return { theme: { cardStyle: cardStyle as CardStyle, density: density as Density, customCss: css } };
}
