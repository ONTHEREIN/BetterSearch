import { describe, expect, it } from 'vitest';
import { bingAdapter, brandTokens, checkLookalike, type PageResult } from '../src';
import { loadFixture } from './fixtures';

describe('brandTokens', () => {
  it('keeps latin words of three or more characters', () => {
    expect(brandTokens('WorkBuddy 官网 下载 v2')).toEqual(['workbuddy']);
    expect(brandTokens('谷歌浏览器')).toEqual([]);
  });
});

describe('checkLookalike', () => {
  const page: PageResult[] = [
    { title: 'WorkBuddy - AI Agent', host: 'www.workbuddy.cn' },
    { title: 'WorkBuddy官网-AI Agent', host: 'workbuddy-sc.com.cn' },
  ];

  it('flags an "official" site on brand-plus-suffix domain and names the likely official one', () => {
    expect(checkLookalike(page[1]!, 'workbuddy', page)).toEqual({
      message: expect.stringContaining('官网可能是 workbuddy.cn'),
      likelyOfficial: 'www.workbuddy.cn',
    });
  });

  it.each([
    ['the brand domain itself', { title: 'WorkBuddy 官网', host: 'www.workbuddy.cn' }],
    ['a site that does not claim to be official', { title: 'WorkBuddy 教程', host: 'workbuddy-sc.com.cn' }],
    ['an unrelated domain', { title: 'WorkBuddy 官方介绍', host: 'cloud.tencent.com' }],
    ['a different brand that only shares letters', { title: 'CodeBuddy 官网', host: 'www.codebuddy.cn' }],
    ['a long tail that is a different word', { title: 'Chrome 官方', host: 'chromeextensionsdevelopment.com' }],
  ])('does not flag %s', (_, result) => {
    expect(checkLookalike(result, 'workbuddy chrome', [...page, result])).toBeNull();
  });

  describe('next to a prominent result', () => {
    const official = { title: '网易UU远程', host: 'uuyc.163.com', prominent: true };
    const check = (host: string, title = 'UU远程 - 远程办公') =>
      checkLookalike({ title, host }, 'uu远程', [official, { title, host }]);

    it('flags the site name plus a copycat tail, without an "official" claim', () => {
      expect(check('uuycpro.com.cn')).toEqual({
        message: expect.stringContaining('uuyc.163.com'),
        likelyOfficial: 'uuyc.163.com',
      });
      expect(check('uuyc-download.cn')).not.toBeNull();
    });

    it.each(['uuyc.163.com', 'uuyc.cn.163.com', 'pythonhosted.org', 'uuycommunity.com', 'remote.example.com'])(
      'does not flag %s',
      (host) => expect(check(host)).toBeNull(),
    );

    it('ignores prominent results with very short site names', () => {
      const short = { title: 'QQ', host: 'im.qq.com', prominent: true };
      expect(checkLookalike({ title: 'QQ', host: 'impro.cn' }, 'qq', [short])).toBeNull();
    });
  });

  it('flags exactly the three look-alikes in the real Bing results', () => {
    const blocks = bingAdapter.collectBlocks(loadFixture('bing', 'workbuddy.html'));
    const results = blocks.map((b) => bingAdapter.extractResult(b)).filter((r) => r !== null);
    const flagged = results.filter((r) => checkLookalike(r, 'workbuddy', results)).map((r) => r.host);
    expect(flagged).toEqual(['workbuddy-dt.com.cn', 'workbuddy-sy.com.cn', 'workbuddy-sc.com.cn']);
  });
});
