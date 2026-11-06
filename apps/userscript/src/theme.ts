/**
 * Whether the engine page is currently dark. Engines have their own theme
 * setting, so the system preference alone is not enough: a light page on a
 * dark system is common.
 */
export function pageIsDark(): boolean {
  for (const el of [document.body, document.documentElement]) {
    if (!el) continue;
    const rgb = getComputedStyle(el).backgroundColor.match(/[\d.]+/g)?.map(Number);
    if (!rgb || rgb.length < 3 || rgb[3] === 0) continue; // transparent
    const [r, g, b] = rgb as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
  }
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

/** Mirror the page theme on <html> for our own styles. */
export function syncTheme(): 'dark' | 'light' {
  const theme = pageIsDark() ? 'dark' : 'light';
  if (document.documentElement.dataset.bsTheme !== theme) document.documentElement.dataset.bsTheme = theme;
  return theme;
}
