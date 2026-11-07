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
  /** The real destination when the page reveals it; null behind an opaque redirect. */
  url: string | null;
  /** Hostname of the destination, or of the URL the engine displays. */
  host: string | null;
  /**
   * The engine presents this result as the site itself: sitelinks on Google
   * and Bing, Baidu's "官方" badge. Usually the official site.
   */
  prominent: boolean;
}

export interface EngineAdapter {
  id: EngineId;
  /** True for any page on this engine's search host, results or not. */
  ownsHost(hostname: string): boolean;
  /** True when `url` is this engine's "all / web" results tab. */
  matches(url: URL): boolean;
  /** The search terms in a results URL. */
  query(url: URL): string;
  /**
   * CSS selectors for ads, injected at document-start so ads never paint.
   * May use `:has()`. Ads are still classified by `collectBlocks`.
   */
  adSelectors: readonly string[];
  /** The element whose children are the main results; the grid container. */
  resultsContainer(root: ParentNode): HTMLElement | null;
  /** The engine's right-hand column, if any. */
  sideColumn(root: ParentNode): HTMLElement | null;
  /** Absolute URL of the next results page, or null on the last page. */
  nextPageUrl(root: ParentNode, base: string): string | null;
  /**
   * Modules the engine injects inside a result after the page loaded, matched
   * as direct children of the result (e.g. Bing's related searches after
   * returning from a click). With the grid on they are moved out, after it.
   */
  injectedModules: string;
  /** The engine's own page links, hidden while results load automatically. */
  paginationSelector: string;
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
