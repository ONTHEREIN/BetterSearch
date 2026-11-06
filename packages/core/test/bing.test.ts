import { describe, expect, it } from 'vitest';
import { bingAdapter } from '../src';
import { expectNotNested, loadFixture, summarize } from './fixtures';

const blocksOf = (name: string) => bingAdapter.collectBlocks(loadFixture('bing', name));
const summaryOf = (name: string) => summarize(bingAdapter, blocksOf(name));

describe('bingAdapter.matches', () => {
  it.each([
    ['https://www.bing.com/search?q=a', true],
    ['https://cn.bing.com/search?q=a', true],
    ['https://www.bing.com/images/search?q=a', false],
    ['https://www.bing.com/videos/search?q=a', false],
    ['https://www.google.com/search?q=a', false],
  ])('%s -> %s', (url, expected) => {
    expect(bingAdapter.matches(new URL(url))).toBe(expected);
  });
});

describe('bingAdapter.collectBlocks', () => {
  it('reads hosts from results, including look-alike "official" sites', () => {
    expect(summaryOf('workbuddy.html')).toEqual([
      'organic:www.workbuddy.cn',
      'organic:www.workbuddy.ai',
      'organic:www.workbuddy.cn',
      'organic:cloud.tencent.com',
      'organic:zhuanlan.zhihu.com',
      'organic:workbuddy-dt.com.cn',
      'organic:www.codebuddy.cn',
      'organic:workbuddy-sy.com.cn',
      'organic:workbuddy-sc.com.cn',
      'organic:www.workbuddy.ai',
      'news',
      'related',
      'related',
    ]);
  });

  it('treats the promoted pole above results as an ad', () => {
    const summary = summaryOf('chrome-download.html');
    expect(summary[0]).toBe('ad');
    expect(summary).toContain('video');
    expect(summary.filter((s) => s.startsWith('organic'))).toHaveLength(10);
  });

  it('recognises the AI summary, news and related questions', () => {
    const summary = summaryOf('iphone-price.html');
    expect(summary.slice(0, 2)).toEqual(['ai-answer', 'news']);
    expect(summary).toContain('paa');
  });

  it('treats the wide card above results as knowledge', () => {
    expect(summaryOf('jay-chou.html').slice(0, 2)).toEqual(['knowledge', 'video']);
  });

  it('leaves unrecognised answers as unknown', () => {
    expect(summaryOf('pizza.html').slice(0, 4)).toEqual(['ai-answer', 'organic:www.wikihow.com', 'unknown', 'video']);
  });

  it('returns non-nested blocks', () => {
    for (const name of ['workbuddy.html', 'chrome-download.html', 'jay-chou.html', 'pizza.html']) {
      expectNotNested(blocksOf(name));
    }
  });
});

describe('bingAdapter.extractResult', () => {
  it('reads the title and direct link', () => {
    const [first] = blocksOf('workbuddy.html');
    expect(bingAdapter.extractResult(first!)).toEqual({
      title: 'WorkBuddy - AI Agent 办公新范式',
      href: 'https://www.workbuddy.cn/',
      host: 'www.workbuddy.cn',
    });
  });
});
