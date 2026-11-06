import { describe, expect, it } from 'vitest';
import { baiduAdapter, bingAdapter, googleAdapter } from '../src';
import { loadFixture } from './fixtures';

describe('nextPageUrl', () => {
  it.each([
    [googleAdapter, 'google', 'https://www.google.com/search?q=workbuddy', /^https:\/\/www\.google\.com\/search\?q=workbuddy.*start=10/],
    [bingAdapter, 'bing', 'https://www.bing.com/search?q=workbuddy', /^https:\/\/www\.bing\.com\/search\?q=workbuddy.*first=10/],
    [baiduAdapter, 'baidu', 'https://www.baidu.com/s?wd=workbuddy', /^https:\/\/www\.baidu\.com\/s\?wd=workbuddy&pn=10/],
  ])('%#: finds page 2 on %s', (adapter, engine, base, expected) => {
    expect(adapter.nextPageUrl(loadFixture(engine, 'workbuddy.html'), base)).toMatch(expected);
  });

  it('returns null without page links', () => {
    expect(googleAdapter.nextPageUrl(new DOMParser().parseFromString('<p></p>', 'text/html'), 'https://www.google.com/')).toBeNull();
  });
});
