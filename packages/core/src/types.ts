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

export interface ResultInfo {
  title: string;
  /** The link as written in the page; may be an engine redirect. */
  href: string;
  /** Hostname taken from the URL the engine displays, e.g. `www.example.com`. */
  host: string | null;
}

export interface EngineAdapter {
  id: EngineId;
  /** True when `url` is this engine's "all / web" results tab. */
  matches(url: URL): boolean;
  /** All recognised blocks, in document order. */
  collectBlocks(root: ParentNode): Block[];
  /** Details of an organic result; null when the block is not one. */
  extractResult(block: Block): ResultInfo | null;
}

/** Synchronous key-value storage provided by the host platform. */
export interface KeyValueStore {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
}
