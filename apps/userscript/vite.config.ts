import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  build: {
    // Greasy Fork rejects minified code.
    minify: false,
  },
  plugins: [
    // Inject component CSS next to the component, which lands it inside the
    // settings panel's shadow root instead of the page's <head>.
    svelte({ compilerOptions: { css: 'injected' } }),
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'BetterSearch',
        namespace: 'bettersearch',
        description: {
          '': 'Cleaner, safer search results for Google, Bing and Baidu: no ads, site blocking, lookalike warnings, auto-paging and a card layout.',
          'zh-CN': '让 Google、Bing、百度的搜索结果更干净、更安全：去广告、屏蔽网站、提示仿冒官网、自动翻页、多列卡片布局。',
        },
        homepageURL: 'https://github.com/ONTHEREIN/BetterSearch',
        supportURL: 'https://github.com/ONTHEREIN/BetterSearch/issues',
        license: 'GPL-3.0-or-later',
        match: [
          'https://www.google.com/search*',
          'https://www.google.com.hk/search*',
          'https://www.google.co.jp/search*',
          'https://www.bing.com/search*',
          'https://cn.bing.com/search*',
          // News only on www: cn.bing.com has no news tab.
          'https://www.bing.com/news/search*',
          // Baidu's home page turns into a results page without reloading.
          'https://www.baidu.com/',
          'https://www.baidu.com/s*',
          'https://m.baidu.com/s*',
          'https://m.baidu.com/*/s*',
        ],
        'run-at': 'document-start',
        // Subscriptions can live on any host; the manager asks once per host.
        connect: ['*'],
      },
      build: {
        fileName: 'bettersearch.user.js',
      },
    }),
  ],
});
