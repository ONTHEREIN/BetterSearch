import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  build: {
    // Greasy Fork rejects minified code.
    minify: false,
  },
  plugins: [
    monkey({
      entry: 'src/main.ts',
      userscript: {
        name: 'BetterSearch',
        namespace: 'bettersearch',
        description: 'Cleaner, safer search results for Google, Bing and Baidu.',
        license: 'GPL-3.0-or-later',
        match: [
          'https://www.google.com/search*',
          'https://www.google.com.hk/search*',
          'https://www.google.co.jp/search*',
        ],
        'run-at': 'document-start',
      },
      build: {
        fileName: 'bettersearch.user.js',
      },
    }),
  ],
});
