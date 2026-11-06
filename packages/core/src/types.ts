export type EngineId = 'google' | 'bing' | 'baidu';

export type BlockType =
  | 'organic'
  | 'ad'
  | 'related'
  | 'news'
  | 'video'
  | 'ai-answer'
  | 'paa'
  | 'knowledge'
  | 'widget'
  | 'unknown';

export interface Block {
  el: HTMLElement;
  type: BlockType;
}

export interface EngineAdapter {
  id: EngineId;
  /** True when `url` is this engine's "all / web" results tab. */
  matches(url: URL): boolean;
  collectBlocks(root: ParentNode): Block[];
}
