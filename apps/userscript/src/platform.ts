import type { KeyValueStore } from '@bettersearch/core';
import { GM_getValue, GM_registerMenuCommand, GM_setValue } from '$';

export const store: KeyValueStore = {
  get: (key, fallback) => GM_getValue(key, fallback),
  set: (key, value) => GM_setValue(key, value),
};

export function registerMenuCommand(label: string, onClick: () => void): void {
  // Some mobile userscript hosts do not implement menus.
  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand(label, onClick);
}
