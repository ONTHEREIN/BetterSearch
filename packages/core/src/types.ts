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
  /** True for any page on this engine's search host, results or not. */
  ownsHost(hostname: string): boolean;
  /** True when `url` is this engine's "all / web" results tab. */
  matches(url: URL): boolean;
  /**
   * CSS selectors for ads, injected at document-start so ads never paint.
   * May use `:has()`. Ads are still classified by `collectBlocks`.
   */
  adSelectors: readonly string[];
  /** The visible search bar, where the settings button goes. */
  searchBar(root: ParentNode): HTMLElement | null;
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
