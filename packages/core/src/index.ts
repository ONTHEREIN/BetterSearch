export type { Block, BlockType, EngineAdapter, EngineId, KeyValueStore, ResultInfo } from './types';
export { baiduAdapter } from './adapters/baidu';
export { bingAdapter } from './adapters/bing';
export { googleAdapter } from './adapters/google';
export { autoColumns, planGrid, type GridPlan } from './layout';
export { stripTracking } from './links';
export { brandTokens, checkLookalike, type LookalikeWarning, type PageResult } from './lookalike';
export { compileRules, siteRule, type RuleSet } from './rules';
export {
  addRule,
  DEFAULT_SETTINGS,
  loadSettings,
  removeRule,
  saveSettings,
  type BlockAction,
  type CardStyle,
  type Columns,
  type Density,
  type Settings,
} from './settings';
export { hostFromDisplayUrl, registrableDomain, siteOf, stripWww } from './url';

import { baiduAdapter } from './adapters/baidu';
import { bingAdapter } from './adapters/bing';
import { googleAdapter } from './adapters/google';
import type { EngineAdapter } from './types';

export const adapters: readonly EngineAdapter[] = [googleAdapter, bingAdapter, baiduAdapter];

export function adapterForHost(hostname: string): EngineAdapter | undefined {
  return adapters.find((a) => a.ownsHost(hostname));
}
