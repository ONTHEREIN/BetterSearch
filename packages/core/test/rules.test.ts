import { describe, expect, it } from 'vitest';
import { addRule, compileRules, hostFromDisplayUrl, registrableDomain, removeRule, siteOf, siteRule } from '../src';

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
  it('covers the whole site, including sibling subdomains', () => {
    expect(siteRule('m.onlinedown.net')).toBe('*://*.onlinedown.net/*');
    expect(compileRules(siteRule('m.onlinedown.net')).blocks('https://mip.onlinedown.net/a')).toBe(true);
  });
});

describe('registrableDomain', () => {
  it.each([
    ['www.example.com', 'example.com'],
    ['a.b.example.co.uk', 'example.co.uk'],
    ['workbuddy-sc.com.cn', 'workbuddy-sc.com.cn'],
    ['www.workbuddy-sc.com.cn', 'workbuddy-sc.com.cn'],
    ['alice.github.io', 'alice.github.io'],
    ['localhost', 'localhost'],
  ])('%s -> %s', (host, expected) => {
    expect(registrableDomain(host)).toBe(expected);
  });
});

describe('siteOf', () => {
  it.each([
    ['m.onlinedown.net', 'onlinedown.net'],
    ['zhidao.baidu.com', 'zhidao.baidu.com'],
    ['www.google.com', 'google.com'],
    ['bob.vercel.app', 'bob.vercel.app'],
  ])('%s -> %s', (host, expected) => {
    expect(siteOf(host)).toBe(expected);
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
