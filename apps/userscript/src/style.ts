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

// Ad containers are listed by id as well so they are hidden before the script
// has classified anything, which avoids a flash of ads on load.
const CSS = `
html.${NO_ADS_CLASS} #tads,
html.${NO_ADS_CLASS} #tadsb,
html.${NO_ADS_CLASS} #tvcap,
html.${NO_ADS_CLASS} #bottomads,
html.${NO_ADS_CLASS} .${C.ad} { display: none !important; }

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

export function injectStyle(): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  // At document-start <head> may not exist yet; <html> always does.
  (document.head ?? document.documentElement).append(style);
}
