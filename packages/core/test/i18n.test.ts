import { afterEach, describe, expect, it } from 'vitest';
import { checkLookalike, detectLocale, setLocale, t } from '../src';

afterEach(() => setLocale('zh'));

describe('detectLocale', () => {
  it.each([
    [['zh-CN', 'en'], 'zh'],
    [['zh-TW'], 'zh'],
    [['en-US', 'zh-CN'], 'en'],
    [['ja'], 'en'],
    [[], 'en'],
  ] as const)('%o -> %s', (languages, expected) => {
    expect(detectLocale(languages)).toBe(expected);
  });
});

describe('t', () => {
  it('fills placeholders, every occurrence', () => {
    expect(t('pager.divider', { page: 3 })).toBe('第 3 页');
    setLocale('en');
    expect(t('lookalike.prominent', { site: 'a.cn', official: 'b.com' })).toBe(
      'a.cn looks like b.com with a suffix added and may be an imitation. The search engine lists b.com as the site itself. Check before downloading anything.',
    );
  });

  it('leaves unknown placeholders visible rather than dropping them', () => {
    expect(t('pager.divider')).toBe('第 {page} 页');
  });

  it('switches warnings to English', () => {
    setLocale('en');
    const page = [
      { title: 'WorkBuddy - AI Agent', host: 'www.workbuddy.cn' },
      { title: 'WorkBuddy官网', host: 'workbuddy-sc.com.cn' },
    ];
    expect(checkLookalike(page[1]!, 'workbuddy', page)?.message).toBe(
      'This site calls itself official, but the official workbuddy site is probably workbuddy.cn. workbuddy-sc.com.cn looks like an imitation. Check before downloading anything.',
    );
  });
});
