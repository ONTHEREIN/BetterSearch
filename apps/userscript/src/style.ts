export const NO_ADS_CLASS = 'bs-no-ads';

export const CLASSES = {
  ad: 'bs-ad',
  result: 'bs-result',
  blocked: 'bs-blocked',
  blockButton: 'bs-block-btn',
  notice: 'bs-notice',
  toast: 'bs-toast',
} as const;

const C = CLASSES;

// The adapter's ad selectors hide ads before the script has classified
// anything, which avoids a flash of ads on load. One rule per selector, so a
// browser without `:has()` drops only the rules that use it.
const adCss = (adSelectors: readonly string[]) =>
  [...adSelectors, `.${C.ad}`].map((s) => `html.${NO_ADS_CLASS} ${s} { display: none !important; }\n`).join('');

const CSS = `
.${C.result} { position: relative; }
.${C.blocked} { display: none !important; }

.${C.blockButton} {
  position: absolute; top: 0; right: 0; z-index: 1;
  width: 32px; height: 32px; padding: 0; border: 0; border-radius: 8px;
  display: inline-flex; align-items: center; justify-content: center;
  background: transparent; color: inherit; opacity: 0; cursor: pointer;
  transition: opacity .15s;
}
.${C.result}:hover .${C.blockButton}, .${C.blockButton}:focus-visible { opacity: .6; }
.${C.blockButton}:hover { opacity: 1 !important; background: rgba(127, 127, 127, .15); }
.${C.blockButton}:focus-visible { outline: 2px solid #4c7cf0; outline-offset: 1px; }
@media (hover: none) { .${C.blockButton} { opacity: .6; } }

.${C.notice} {
  display: flex; align-items: center; gap: 8px; margin: 0 0 16px; padding: 6px 0;
  font: 13px/1.5 system-ui, sans-serif; color: inherit; opacity: .7;
}
.${C.notice}[hidden] { display: none; }
.${C.notice} button {
  padding: 0; border: 0; background: none; color: #4c7cf0; font: inherit; cursor: pointer;
}

.${C.toast} {
  position: fixed; left: 50%; bottom: 24px; z-index: 2147483646; transform: translateX(-50%);
  display: flex; align-items: center; gap: 16px; padding: 10px 16px; border-radius: 10px;
  background: #1f2329; color: #f2f4f7; box-shadow: 0 4px 16px rgba(0, 0, 0, .25);
  font: 14px/1.4 system-ui, sans-serif;
}
.${C.toast} button {
  padding: 0; border: 0; background: none; color: #a9c1ff; font: inherit; font-weight: 600; cursor: pointer;
}
`;

let style: HTMLStyleElement | null = null;

/**
 * Add the stylesheet, or put it back if the page removed it: Baidu rewrites
 * <head> when it swaps in new results. Safe to call repeatedly.
 */
export function injectStyle(adSelectors: readonly string[]): void {
  if (style?.isConnected) return;
  if (!style) {
    style = document.createElement('style');
    style.textContent = adCss(adSelectors) + CSS;
  }
  // At document-start <head> may not exist yet; <html> always does.
  (document.head ?? document.documentElement).append(style);
}
