import type { Fetcher, KeyValueStore } from '@bettersearch/core';
import { GM_getValue, GM_registerMenuCommand, GM_setValue, GM_xmlhttpRequest } from '$';

export const store: KeyValueStore = {
  get: (key, fallback) => GM_getValue(key, fallback),
  set: (key, value) => GM_setValue(key, value),
};

export function registerMenuCommand(label: string, onClick: () => void): void {
  // Some mobile userscript hosts do not implement menus.
  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand(label, onClick);
}

const FETCH_TIMEOUT_MS = 15_000;

/** Cross-origin GET for rule lists; page `fetch` would be blocked by CORS. */
export const fetchText: Fetcher = (url) =>
  new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      timeout: FETCH_TIMEOUT_MS,
      onload: (r) => (r.status >= 200 && r.status < 300 ? resolve(r.responseText) : reject(new Error(`HTTP ${r.status}`))),
      onerror: () => reject(new Error('network error')),
      ontimeout: () => reject(new Error('timeout')),
    });
  });
