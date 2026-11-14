import { describe, expect, it } from 'vitest';
import { baiduAdapter } from '../src';
import { expectNotNested, loadFixture, summarize } from './fixtures';

const blocksOf = (name: string) => baiduAdapter.collectBlocks(loadFixture('baidu', name));
const summaryOf = (name: string) => summarize(baiduAdapter, blocksOf(name));

describe('baiduAdapter.tab', () => {
  it.each([
    ['https://www.baidu.com/s?wd=a', 'web'],
    ['https://www.baidu.com/s?wd=a&tn=baiduhome_pg', 'web'],
    ['https://www.baidu.com/s?word=a&tn=news', 'news'],
    ['https://www.baidu.com/s?wd=a&pd=note', null],
    ['https://www.baidu.com/', null],
    ['https://image.baidu.com/search/index?word=a', null],
  ])('%s -> %s', (url, expected) => {
    expect(baiduAdapter.tab(new URL(url), document)).toBe(expected);
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

describe('the news tab', () => {
  const doc = loadFixture('baidu', 'news-huawei.html');

  it('is recognised after Baidu drops tn=news from the address', () => {
    expect(baiduAdapter.tab(new URL('https://www.baidu.com/s?wd=%E5%8D%8E%E4%B8%BA'), doc)).toBe('news');
    expect(baiduAdapter.tab(new URL('https://www.baidu.com/s?wd=workbuddy'), loadFixture('baidu', 'workbuddy.html'))).toBe('web');
  });

  it('reads stories with and without a template, and the brand zone as an ad', () => {
    // The hot list in the right column comes first in the page.
    expect(summaryOf('news-huawei.html')).toEqual([
      'unknown',
      'ad',
      'organic:www.huawei.com',
      'organic:baike.baidu.com',
      'organic:author.baidu.com',
      'organic:baike.baidu.com',
      'organic:consumer.huawei.com',
      'organic:baijiahao.baidu.com',
      'organic:baijiahao.baidu.com',
      'organic:baijiahao.baidu.com',
      'organic:36kr.com',
      'organic:tech.ifeng.com',
    ]);
    expectNotNested(blocksOf('news-huawei.html'));
  });

  it('finds the next page', () => {
    expect(baiduAdapter.nextPageUrl(doc, 'https://www.baidu.com/s?wd=x')).toContain('tn=news');
  });
});

describe('the mobile page', () => {
  const doc = loadFixture('baidu', 'mobile-huawei.html');
  const blocks = baiduAdapter.collectBlocks(doc);

  it('is a results page on m.baidu.com, whatever the path prefix', () => {
    expect(baiduAdapter.tab(new URL('https://m.baidu.com/s?word=x'), doc)).toBe('web');
    expect(baiduAdapter.tab(new URL('https://m.baidu.com/ssid=0/from=0/s?word=x'), doc)).toBe('web');
    expect(baiduAdapter.query(new URL('https://m.baidu.com/s?word=%E5%8D%8E%E4%B8%BA'))).toBe('华为');
  });

  it('reads the real address from the click log, and the title without its tags', () => {
    const results = blocks.filter((b) => b.type === 'organic').map((b) => baiduAdapter.extractResult(b));
    expect(results[0]).toMatchObject({
      title: '华为- 构建万物互联的智能世界',
      url: 'https://www.huawei.com/cn/',
      host: 'www.huawei.com',
      prominent: true,
    });
    expect(results[0]!.href).toMatch(/^https:\/\/m\.baidu\.com\//);
    expect(results.map((r) => r?.host)).toContain('www.vmall.com');
  });

  it('treats the brand zone and ads_* templates as ads', () => {
    expect(blocks.slice(0, 4).map((b) => b.type)).toEqual(['ad', 'ad', 'ad', 'ad']);
    expect(blocks.find((b) => b.el.getAttribute('tpl') === 'sg_kg_entity_san')?.type).toBe('knowledge');
  });

  it('finds the next page and the search box', () => {
    expect(baiduAdapter.nextPageUrl(doc, 'https://m.baidu.com/s?word=x')).toContain('pn=10');
    expect(baiduAdapter.searchBar(doc)?.id).toBe('se-form');
  });

  it('reads a page without ads the same way', () => {
    const other = baiduAdapter.collectBlocks(loadFixture('baidu', 'mobile-iphone.html'));
    expect(other.filter((b) => b.type === 'organic')).toHaveLength(7);
    expect(other.filter((b) => b.type === 'ad')).toEqual([]);
  });
});
