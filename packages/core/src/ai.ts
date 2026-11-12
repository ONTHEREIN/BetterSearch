// Summaries and questions through the user's own model account. Everything
// here is pure: the userscript sends the requests and shows the answers.

/** A model service with an OpenAI-compatible chat API. */
export interface AiProvider {
  id: string;
  name: string;
  baseUrl: string;
  /** A suggestion only: model names change, so the settings can list the service's own. */
  model: string;
  /** Where to create an API key. */
  keyUrl: string;
}

export const AI_PROVIDERS: readonly AiProvider[] = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { id: 'qwen', name: '通义千问', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus', keyUrl: 'https://bailian.console.aliyun.com/?apiKey=1' },
  { id: 'kimi', name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k', keyUrl: 'https://platform.moonshot.cn/console/api-keys' },
  { id: 'zhipu', name: '智谱', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash', keyUrl: 'https://open.bigmodel.cn/usercenter/apikeys' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini', keyUrl: 'https://platform.openai.com/api-keys' },
  { id: 'claude', name: 'Claude', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-5-5', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { id: 'gemini', name: 'Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash', keyUrl: 'https://aistudio.google.com/apikey' },
  // A local or self-hosted service, e.g. Ollama at http://localhost:11434/v1, may need no key.
  { id: 'custom', name: '', baseUrl: '', model: '', keyUrl: '' },
];

export interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** True when there is enough to send a request: a key, except for a custom service. */
export function aiReady(config: AiConfig & { provider: string }): boolean {
  return !!config.baseUrl.trim() && !!config.model.trim() && (!!config.apiKey.trim() || config.provider === 'custom');
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** A search result given to the model, cited as [n] by its position. */
export interface Source {
  title: string;
  url: string;
  snippet: string;
}

export interface HttpRequest {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: string;
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/${path}`;
}

function authHeaders(config: AiConfig): Record<string, string> {
  const key = config.apiKey.trim();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

export function chatRequest(config: AiConfig, messages: ChatMessage[]): HttpRequest {
  return {
    method: 'POST',
    url: endpoint(config.baseUrl, 'chat/completions'),
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream', ...authHeaders(config) },
    body: JSON.stringify({ model: config.model.trim(), messages, stream: true }),
  };
}

export function modelsRequest(config: AiConfig): HttpRequest {
  return { method: 'GET', url: endpoint(config.baseUrl, 'models'), headers: authHeaders(config) };
}

/** Model ids from a `/models` response, sorted; empty when it is not one. */
export function parseModels(body: string): string[] {
  try {
    const data = JSON.parse(body) as { data?: { id?: unknown }[] };
    return (data.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => typeof id === 'string')
      .sort();
  } catch {
    return [];
  }
}

/** The service's own explanation of a failed request, if the body has one. */
export function errorMessage(body: string): string | null {
  try {
    const data = JSON.parse(body) as { error?: { message?: unknown } | string; message?: unknown };
    const message = typeof data.error === 'string' ? data.error : (data.error?.message ?? data.message);
    return typeof message === 'string' && message ? message : null;
  } catch {
    return null;
  }
}

/**
 * Reads a streamed chat response. Feed it the whole response text received so
 * far, as often as convenient; it returns only the answer text that is new.
 * A service that ignores `stream` answers with plain JSON, read by `finish`.
 */
export class ChatStream {
  private read = 0;
  private partial = '';
  private streamed = false;

  push(received: string): string {
    const chunk = received.slice(this.read);
    this.read = received.length;
    const lines = (this.partial + chunk).split('\n');
    this.partial = lines.pop()!;
    return lines.map((line) => this.line(line)).join('');
  }

  /** Call with the complete response; returns any text not yet returned. */
  finish(received: string): string {
    let text = this.push(received) + this.line(this.partial);
    this.partial = '';
    if (!this.streamed) {
      try {
        const data = JSON.parse(received) as { choices?: { message?: { content?: unknown } }[] };
        const content = data.choices?.[0]?.message?.content;
        if (typeof content === 'string') text += content;
      } catch {
        // Neither a stream nor JSON: nothing more to read.
      }
    }
    return text;
  }

  private line(line: string): string {
    const match = /^data:\s?(.*)$/.exec(line.trim());
    if (!match || match[1] === '[DONE]') return '';
    this.streamed = true;
    try {
      const data = JSON.parse(match[1]!) as { choices?: { delta?: { content?: unknown } }[] };
      const content = data.choices?.[0]?.delta?.content;
      return typeof content === 'string' ? content : '';
    } catch {
      return '';
    }
  }
}

const SNIPPET_CHARS = 300;
const PAGE_CHARS = 12_000;

const ANSWER_STYLE =
  'Answer in the language of the question. Be concise: a short paragraph, then a few bullet points if they help. ' +
  'Use plain Markdown (paragraphs, "- " bullets, **bold**); no headings, tables or code unless asked.';

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Messages asking for a summary of a results page; `sources` exclude blocked sites. */
export function searchPrompt(query: string, sources: Source[]): ChatMessage[] {
  const list = sources
    .map((s, i) => `[${i + 1}] ${s.title}\n${s.url}\n${clip(s.snippet, SNIPPET_CHARS)}`)
    .join('\n\n');
  return [
    {
      role: 'system',
      content:
        'You summarise web search results for the user. Use only the numbered results below; ' +
        'when they do not answer the question, say so. Cite results as [n] after the sentence that uses them. ' +
        ANSWER_STYLE,
    },
    { role: 'user', content: `Search: ${query}\n\nResults:\n\n${list}` },
  ];
}

/** Messages asking for a summary of one page, with what the user searched for. */
export function pagePrompt(query: string, page: { title: string; url: string; text: string }): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You summarise a web page for someone who found it by searching. Say what the page offers, ' +
        'what it says about the search, and anything that makes it less trustworthy. ' +
        ANSWER_STYLE,
    },
    {
      role: 'user',
      content: `Search: ${query}\n\nPage: ${page.title}\n${page.url}\n\n${clip(page.text, PAGE_CHARS)}`,
    },
  ];
}

/** The charset a page's bytes are in: from the Content-Type header, else a <meta> near the top. */
export function htmlCharset(bytes: Uint8Array, contentType: string | null): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1];
  if (fromHeader) return fromHeader.toLowerCase();
  const head = String.fromCharCode(...bytes.subarray(0, 2048));
  return /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1]?.toLowerCase() ?? 'utf-8';
}

export function decodeHtml(bytes: Uint8Array, contentType: string | null): string {
  try {
    return new TextDecoder(htmlCharset(bytes, contentType)).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

const NOT_CONTENT = 'script, style, noscript, template, svg, iframe, form, nav, header, footer, aside, [hidden], [aria-hidden="true"]';
const BLOCKS = 'p, div, li, h1, h2, h3, h4, h5, h6, br, tr, section, article, pre, blockquote, dd, dt';

/** The readable text of a fetched page, one line per paragraph, at most `max` characters. */
export function extractPageText(doc: Document, max = PAGE_CHARS): { title: string; text: string } {
  const title = (
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ??
    doc.title ??
    ''
  ).trim();
  for (const el of doc.querySelectorAll(NOT_CONTENT)) el.remove();
  // The longest <article>, else <main>, else the whole body.
  const articles = [...doc.querySelectorAll('article')].sort(
    (a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0),
  );
  const root = articles[0] ?? doc.querySelector('main, [role="main"]') ?? doc.body;
  if (!root) return { title, text: '' };
  for (const el of root.querySelectorAll(BLOCKS)) el.after(doc.createTextNode('\n'));
  const text = (root.textContent ?? '')
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
  return { title, text: text.slice(0, max) };
}

export type AnswerInline = { text: string; bold?: boolean } | { cite: number };
export interface AnswerBlock {
  type: 'p' | 'li';
  content: AnswerInline[];
}

function inlines(text: string): AnswerInline[] {
  const out: AnswerInline[] = [];
  // **bold** and [n] citations; a group like [1, 3] or [1][3] cites each.
  const pattern = /\*\*(.+?)\*\*|\[(\d+(?:\s*[,，]\s*\d+)*)\]/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    if (match.index > last) out.push({ text: text.slice(last, match.index) });
    if (match[1] !== undefined) out.push({ text: match[1], bold: true });
    else for (const n of match[2]!.split(/[,，]/)) out.push({ cite: Number(n.trim()) });
    last = match.index + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/**
 * The small part of Markdown the prompts ask for, as data to build DOM from:
 * the answer comes from a remote service and is never parsed as HTML.
 */
export function parseAnswer(text: string): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'p', content: inlines(paragraph.join(' ')) });
    paragraph = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    const item = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (!line) {
      flush();
    } else if (item) {
      flush();
      blocks.push({ type: 'li', content: inlines(item[1]!) });
    } else {
      // Headings the model adds anyway read fine as bold lines.
      const heading = /^#{1,6}\s+(.*)$/.exec(line);
      if (heading) {
        flush();
        blocks.push({ type: 'p', content: [{ text: heading[1]!, bold: true }] });
      } else {
        paragraph.push(line);
      }
    }
  }
  flush();
  return blocks;
}
