import { describe, expect, it } from 'vitest';
import { addRule, compileRules, hostFromDisplayUrl, removeRule, siteRule } from '../src';

describe('compileRules', () => {
  const rules = compileRules(
    [
      '# comment',
      '*://*.example.com/*',
      'https://exact.org/blog/*',
      'shorthand.net',
      '/bad-word/',
      '@*://good.example.com/*',
      'not a rule',
      '/[unclosed/',
    ].join('\n'),
  );

  it.each([
    ['https://example.com/', true],
    ['https://a.b.example.com/x', true],
    ['https://notexample.com/', false],
    ['https://exact.org/blog/post', true],
    ['http://exact.org/blog/post', false],
    ['https://exact.org/shop', false],
    ['https://www.shorthand.net/', true],
    ['https://site.io/bad-word/page', true],
    ['https://good.example.com/', false],
    ['not a url', false],
  ])('%s -> %s', (url, expected) => {
    expect(rules.blocks(url)).toBe(expected);
  });
});

describe('siteRule', () => {
  it('drops www and covers subdomains', () => {
    expect(siteRule('www.example.com')).toBe('*://*.example.com/*');
    expect(compileRules(siteRule('www.example.com')).blocks('https://cdn.example.com/a')).toBe(true);
  });
});

describe('addRule / removeRule', () => {
  it('adds a rule once and removes it again', () => {
    const once = addRule('a.com', 'b.com');
    expect(once).toBe('a.com\nb.com');
    expect(addRule(once, 'b.com')).toBe(once);
    expect(removeRule(once, 'a.com')).toBe('b.com');
    expect(addRule('', 'a.com')).toBe('a.com');
  });
});

describe('hostFromDisplayUrl', () => {
  it.each([
    ['https://www.workbuddy.ai › docs › Overview', 'www.workbuddy.ai'],
    ['zh.wikipedia.org/wiki/x', 'zh.wikipedia.org'],
    ['HTTPS://Example.COM', 'example.com'],
    ['YouTube · Jay Chou', null],
    [null, null],
  ])('%s -> %s', (text, expected) => {
    expect(hostFromDisplayUrl(text)).toBe(expected);
  });
});
