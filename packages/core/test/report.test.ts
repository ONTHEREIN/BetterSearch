import { describe, expect, it } from 'vitest';
import { reportUrl } from '../src';

describe('reportUrl', () => {
  it('fills in the site, query and engine for the issue form', () => {
    const url = new URL(reportUrl('www.workbuddy-sc.com.cn', 'workbuddy 下载', 'baidu'));
    expect(url.origin + url.pathname).toBe('https://github.com/ONTHEREIN/bettersearch-rules/issues/new');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      template: 'report.yml',
      title: '[举报] workbuddy-sc.com.cn',
      domain: 'workbuddy-sc.com.cn',
      query: 'workbuddy 下载',
      engine: '百度 Baidu',
    });
  });
});
