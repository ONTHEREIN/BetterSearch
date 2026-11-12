import { describe, expect, it } from 'vitest';
import {
  aiReady,
  ChatStream,
  chatRequest,
  decodeHtml,
  errorMessage,
  extractPageText,
  htmlCharset,
  parseAnswer,
  parseModels,
  searchPrompt,
} from '../src';

const sse = (...parts: string[]) =>
  parts.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`).join('') + 'data: [DONE]\n\n';

describe('ChatStream', () => {
  it('returns only new text, however the stream is split', () => {
    const body = sse('你好', '，世界');
    for (const cut of [1, 7, 30, body.length - 3]) {
      const stream = new ChatStream();
      const text = stream.push(body.slice(0, cut)) + stream.push(body.slice(0, cut + 5)) + stream.finish(body);
      expect(text).toBe('你好，世界');
    }
  });

  it('reads a service that answers with plain JSON', () => {
    const body = JSON.stringify({ choices: [{ message: { content: 'done' } }] });
    const stream = new ChatStream();
    expect(stream.push(body) + stream.finish(body)).toBe('done');
  });
});

describe('requests', () => {
  const config = { baseUrl: 'https://api.example.com/v1/', apiKey: ' k ', model: 'm' };

  it('posts a streamed chat to the base URL', () => {
    const request = chatRequest(config, [{ role: 'user', content: 'hi' }]);
    expect(request.url).toBe('https://api.example.com/v1/chat/completions');
    expect(request.headers.Authorization).toBe('Bearer k');
    expect(JSON.parse(request.body!)).toEqual({ model: 'm', messages: [{ role: 'user', content: 'hi' }], stream: true });
  });

  it('needs a key except for a custom service', () => {
    expect(aiReady({ ...config, apiKey: '', provider: 'deepseek' })).toBe(false);
    expect(aiReady({ ...config, apiKey: '', provider: 'custom' })).toBe(true);
    expect(aiReady({ ...config, model: ' ', provider: 'deepseek' })).toBe(false);
  });

  it('reads model lists and error messages', () => {
    expect(parseModels(JSON.stringify({ data: [{ id: 'b' }, { id: 'a' }, {}] }))).toEqual(['a', 'b']);
    expect(parseModels('<html>')).toEqual([]);
    expect(errorMessage(JSON.stringify({ error: { message: 'Invalid key' } }))).toBe('Invalid key');
    expect(errorMessage('Bad gateway')).toBeNull();
  });
});

describe('searchPrompt', () => {
  it('numbers the results so the answer can cite them', () => {
    const [, user] = searchPrompt('q', [
      { title: 'A', url: 'https://a.example/', snippet: 'x'.repeat(400) },
      { title: 'B', url: 'https://b.example/', snippet: 'y' },
    ]);
    expect(user!.content).toContain('[1] A\nhttps://a.example/\n');
    expect(user!.content).toContain('[2] B');
    expect(user!.content).toContain('…');
  });
});

describe('pages', () => {
  it('finds the charset in the header or a meta tag', () => {
    const bytes = new TextEncoder().encode('<html><head><meta charset="GBK">');
    expect(htmlCharset(bytes, 'text/html; charset=UTF-8')).toBe('utf-8');
    expect(htmlCharset(bytes, 'text/html')).toBe('gbk');
    expect(htmlCharset(new Uint8Array(), null)).toBe('utf-8');
  });

  it('decodes GBK pages', () => {
    const gbk = new Uint8Array([0xc4, 0xe3, 0xba, 0xc3]); // 你好
    expect(decodeHtml(gbk, 'text/html; charset=gbk')).toBe('你好');
  });

  it('keeps the article and drops page furniture', () => {
    const doc = new DOMParser().parseFromString(
      `<title>T</title><nav>Menu</nav><article><h1>Head</h1><p>One  two</p><p>Three</p><script>x()</script></article><footer>F</footer>`,
      'text/html',
    );
    expect(extractPageText(doc)).toEqual({ title: 'T', text: 'Head\nOne two\nThree' });
  });
});

describe('parseAnswer', () => {
  it('reads paragraphs, bullets, bold and citations', () => {
    expect(parseAnswer('First **bold** line [1]\ncontinues [2, 3].\n\n- item [4][5]\n## Head')).toEqual([
      {
        type: 'p',
        content: [{ text: 'First ' }, { text: 'bold', bold: true }, { text: ' line ' }, { cite: 1 }, { text: ' continues ' }, { cite: 2 }, { cite: 3 }, { text: '.' }],
      },
      { type: 'li', content: [{ text: 'item ' }, { cite: 4 }, { cite: 5 }] },
      { type: 'p', content: [{ text: 'Head', bold: true }] },
    ]);
  });

  it('keeps markup as text', () => {
    expect(parseAnswer('<img src=x onerror=alert(1)>')).toEqual([{ type: 'p', content: [{ text: '<img src=x onerror=alert(1)>' }] }]);
  });
});
