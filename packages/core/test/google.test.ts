import { describe, expect, it } from 'vitest';
import { googleAdapter, type Block } from '../src';
import { expectNotNested, loadFixture as load, summarize as summarizeWith } from './fixtures';

const loadFixture = (name: string) => load('google', name);
const summarize = (blocks: Block[]) => summarizeWith(googleAdapter, blocks);

describe('googleAdapter.matches', () => {
  it.each([
    ['https://www.google.com/search?q=a', true],
    ['https://www.google.com.hk/search?q=a', true],
    ['https://www.google.co.jp/search?q=a&udm=14', true],
    ['https://www.google.com/search?q=a&udm=2', false],
    ['https://www.google.com/search?q=a&tbm=nws', false],
    ['https://www.google.com/maps?q=a', false],
    ['https://www.notgoogle.com/search?q=a', false],
  ])('%s -> %s', (url, expected) => {
    expect(googleAdapter.matches(new URL(url))).toBe(expected);
  });
});

describe('googleAdapter.collectBlocks', () => {
  it('finds organic results, an inline AI overview and bottom ads', () => {
    expect(summarize(googleAdapter.collectBlocks(loadFixture('workbuddy.html')))).toEqual([
      'organic:www.workbuddy.cn',
      'organic:www.workbuddy.ai',
      'organic:www.workbuddy.ai',
      'ai-answer',
      'organic:www.workbuddy.ai',
      'organic:cloud.tencent.com',
      'organic:www.workbuddy.ai',
      'ad',
      'related',
    ]);
  });

  it('finds the AI overview above #rso and ignores empty ad slots', () => {
    const types = summarize(googleAdapter.collectBlocks(loadFixture('chrome-download.html')));
    expect(types[0]).toBe('ai-answer');
    expect(types).not.toContain('ad');
    expect(types.filter((t) => t.startsWith('organic'))).toHaveLength(9);
  });

  it('finds top ads', () => {
    const types = summarize(googleAdapter.collectBlocks(loadFixture('hotel.html')));
    expect(types[0]).toBe('ad');
    expect(types.filter((t) => t.startsWith('organic'))).toHaveLength(10);
  });

  it('separates knowledge modules, questions and the side panel from results', () => {
    expect(summarize(googleAdapter.collectBlocks(loadFixture('jay-chou.html')))).toEqual([
      'unknown',
      'knowledge',
      'organic:zh.wikipedia.org',
      'knowledge',
      'organic:baike.baidu.com',
      'organic:null',
      'knowledge',
      'organic:open.spotify.com',
      'paa',
      'organic:null',
      'organic:www.sonymusic.co.jp',
      'organic:music.apple.com',
      'organic:www.universal-music.co.jp',
      'organic:null',
      'organic:wuu.wikipedia.org',
      'related',
      'knowledge',
    ]);
  });

  it('does not count videos inside a carousel as results', () => {
    const types = summarize(googleAdapter.collectBlocks(loadFixture('pizza.html')));
    expect(types.slice(0, 2)).toEqual(['ai-answer', 'video']);
    expect(types).toContain('paa');
    expect(types.filter((t) => t.startsWith('organic'))).toHaveLength(7);
  });

  it('recognises the currency converter', () => {
    expect(summarize(googleAdapter.collectBlocks(loadFixture('usd-rate.html')))[0]).toBe('widget');
  });

  it('returns non-nested blocks', () => {
    for (const name of ['workbuddy.html', 'jay-chou.html', 'pizza.html', 'hotel.html']) {
      expectNotNested(googleAdapter.collectBlocks(loadFixture(name)));
    }
  });

  it('returns nothing on a page without results', () => {
    expect(googleAdapter.collectBlocks(new DOMParser().parseFromString('<p>hi</p>', 'text/html'))).toEqual([]);
  });
});

describe('googleAdapter.extractResult', () => {
  it('reads the title, redirect link and displayed host', () => {
    const [first] = googleAdapter.collectBlocks(loadFixture('workbuddy.html'));
    expect(googleAdapter.extractResult(first!)).toMatchObject({
      title: 'WorkBuddy - AI Agent 办公新范式',
      href: expect.stringMatching(/^\/goto\?url=/),
      host: 'www.workbuddy.cn',
    });
  });

  it('returns null for non-organic blocks', () => {
    const blocks = googleAdapter.collectBlocks(loadFixture('workbuddy.html'));
    expect(googleAdapter.extractResult(blocks.find((b) => b.type === 'ad')!)).toBeNull();
  });
});
