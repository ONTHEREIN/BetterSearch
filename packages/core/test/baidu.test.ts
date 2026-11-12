import { describe, expect, it } from 'vitest';
import { baiduAdapter } from '../src';
import { expectNotNested, loadFixture, summarize } from './fixtures';

const blocksOf = (name: string) => baiduAdapter.collectBlocks(loadFixture('baidu', name));
const summaryOf = (name: string) => summarize(baiduAdapter, blocksOf(name));

describe('baiduAdapter.tab', () => {
  it.each([
    ['https://www.baidu.com/s?wd=a', 'web'],
    ['https://www.baidu.com/s?wd=a&tn=baiduhome_pg', 'web'],
    ['https://www.baidu.com/s?word=a&tn=news', null],
    ['https://www.baidu.com/s?wd=a&pd=note', null],
    ['https://www.baidu.com/', null],
    ['https://image.baidu.com/search/index?word=a', null],
  ])('%s -> %s', (url, expected) => {
    expect(baiduAdapter.tab(new URL(url))).toBe(expected);
  });
});

describe('baiduAdapter.collectBlocks', () => {
  it('finds ads between results', () => {
    const summary = summaryOf('workbuddy.html');
    expect(summary.filter((s) => s === 'ad')).toHaveLength(5);
    expect(summary.filter((s) => s.startsWith('organic'))).toEqual([
      'organic:copilot.tencent.com',
      'organic:cloud.tencent.com',
      'organic:workbuddy.qq.com',
      'organic:cloud.tencent.com',
      'organic:edu.retail.tencent.com',
      'organic:www.workbuddy.com',
    ]);
  });

  it('takes the real host from mu, not the brand name Baidu displays', () => {
    const organic = summaryOf('chrome-download.html').filter((s) => s.startsWith('organic'));
    expect(organic).toEqual([
      'organic:www.google.cn',
      'organic:www.google.cn',
      'organic:support.google.cn',
      'organic:m.onlinedown.net',
      'organic:mip.onlinedown.net',
      'organic:zhidao.baidu.com',
    ]);
  });

  it('classifies Baidu modules by template', () => {
    const summary = summaryOf('iphone-price.html');
    for (const type of ['ad', 'ai-answer', 'related', 'widget', 'knowledge']) expect(summary).toContain(type);
    expect(summaryOf('tokyo-tower.html')).toContain('video');
    expect(summaryOf('jay-chou.html')).toContain('news');
  });

  it('returns non-nested blocks', () => {
    for (const name of ['workbuddy.html', 'chrome-download.html', 'iphone-price.html', 'jay-chou.html']) {
      expectNotNested(blocksOf(name));
    }
  });
});

describe('baiduAdapter.extractResult', () => {
  it('keeps the redirect link and resolves the host', () => {
    const block = blocksOf('workbuddy.html').find((b) => b.type === 'organic')!;
    expect(baiduAdapter.extractResult(block)).toMatchObject({
      title: 'WorkBuddy - AI Agent 办公新范式',
      href: expect.stringMatching(/^http:\/\/www\.baidu\.com\/link\?url=/),
      url: 'https://copilot.tencent.com/work/',
      host: 'copilot.tencent.com',
      prominent: true,
    });
  });
});

describe('baiduAdapter.adSelectors', () => {
  it('match exactly the ads, so they can be hidden before classification', () => {
    const doc = loadFixture('baidu', 'workbuddy.html');
    const bySelector = new Set(doc.querySelectorAll(baiduAdapter.adSelectors.join(',')));
    const byClassifier = baiduAdapter.collectBlocks(doc).filter((b) => b.type === 'ad').map((b) => b.el);
    expect(byClassifier.every((el) => bySelector.has(el))).toBe(true);
    expect(bySelector.size).toBe(byClassifier.length);
  });
});
