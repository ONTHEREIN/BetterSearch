import { googleAdapter } from '@bettersearch/core';

const adapter = googleAdapter;
const ORGANIC_CLASS = 'bs-organic';

const STYLE = `
.${ORGANIC_CLASS} {
  outline: 2px solid #1a4fd6;
  outline-offset: 6px;
  border-radius: 8px;
}
`;

function injectStyle(): void {
  const style = document.createElement('style');
  style.textContent = STYLE;
  // At document-start <head> may not exist yet; <html> always does.
  (document.head ?? document.documentElement).append(style);
}

function markResults(): void {
  for (const block of adapter.collectBlocks(document)) {
    if (block.type === 'organic') block.el.classList.add(ORGANIC_CLASS);
  }
}

function watchForResults(): void {
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      markResults();
    });
  }).observe(document.body, { childList: true, subtree: true });
}

if (adapter.matches(new URL(location.href))) {
  injectStyle();
  const start = () => {
    markResults();
    watchForResults();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
}
