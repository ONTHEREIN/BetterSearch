import type { EngineId } from './types';
import { siteOf } from './url';

/** Where the community lookalike list lives; reports go to its issue form. */
export const RULES_REPO = 'ONTHEREIN/bettersearch-rules';

/** Option labels of the form's engine dropdown, which must match exactly to preselect. */
const ENGINE_OPTION: Record<EngineId, string> = { google: 'Google', bing: 'Bing', baidu: '百度 Baidu' };

/** The issue form for reporting `host` as a lookalike, with what we know filled in. */
export function reportUrl(host: string, query: string, engine: EngineId): string {
  const site = siteOf(host);
  const url = new URL(`https://github.com/${RULES_REPO}/issues/new`);
  url.searchParams.set('template', 'report.yml');
  url.searchParams.set('title', `[举报] ${site}`);
  url.searchParams.set('domain', site);
  url.searchParams.set('query', query);
  url.searchParams.set('engine', ENGINE_OPTION[engine]);
  return url.href;
}
