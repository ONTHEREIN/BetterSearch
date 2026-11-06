import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { googleAdapter } from '../src';

function loadFixture(name: string): Document {
  const html = readFileSync(join(import.meta.dirname, '../../../fixtures/google', name), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

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
  const doc = loadFixture('workbuddy.html');
  const blocks = googleAdapter.collectBlocks(doc);

  it('finds every organic result once', () => {
    const titles = blocks.map((b) => b.el.querySelector('h3')?.textContent);
    expect(titles).toEqual([
      'WorkBuddy - AI Agent 办公新范式',
      'WorkBuddy - AI Agent for Everyday Office Work',
      '简介| WorkBuddy - AI Agent 办公新范式',
      'WorkBuddy Pricing - AI Agent for Everyday Office Work',
      'WorkBuddy',
      '更新日志| WorkBuddy - AI Agent 办公新范式',
    ]);
    expect(blocks.every((b) => b.type === 'organic')).toBe(true);
  });

  it('returns non-nested containers', () => {
    for (const a of blocks) {
      for (const b of blocks) {
        if (a !== b) expect(a.el.contains(b.el)).toBe(false);
      }
    }
  });

  it('returns nothing on a page without results', () => {
    expect(googleAdapter.collectBlocks(new DOMParser().parseFromString('<p>hi</p>', 'text/html'))).toEqual([]);
  });
});
