import { decodeHtml, type Fetcher, type HttpRequest, type KeyValueStore } from '@bettersearch/core';
import { GM_getValue, GM_registerMenuCommand, GM_setValue, GM_xmlhttpRequest } from '$';

export const store: KeyValueStore = {
  get: (key, fallback) => GM_getValue(key, fallback),
  set: (key, value) => GM_setValue(key, value),
};

export function registerMenuCommand(label: string, onClick: () => void): void {
  // Some mobile userscript hosts do not implement menus.
  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand(label, onClick);
}

const FETCH_TIMEOUT_MS = 15_000;

/** Cross-origin GET for rule lists; page `fetch` would be blocked by CORS. */
export const fetchText: Fetcher = (url) =>
  new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      timeout: FETCH_TIMEOUT_MS,
      onload: (r) => (r.status >= 200 && r.status < 300 ? resolve(r.responseText) : reject(new Error(`HTTP ${r.status}`))),
      onerror: () => reject(new Error('network error')),
      ontimeout: () => reject(new Error('timeout')),
    });
  });

export interface Streaming {
  abort(): void;
  /** Resolves with the HTTP status and the complete body. */
  done: Promise<{ status: number; body: string }>;
}

/**
 * Cross-origin request whose body arrives in pieces: `onText` gets everything
 * received so far, each time more arrives. Tampermonkey hands over a stream;
 * Violentmonkey reports progress with the text so far.
 */
export function streamRequest(request: HttpRequest, onText: (received: string) => void): Streaming {
  let abort = () => {};
  const done = new Promise<{ status: number; body: string }>((resolve, reject) => {
    const common = {
      method: request.method,
      url: request.url,
      headers: request.headers,
      data: request.body,
      onerror: () => reject(new Error('network error')),
      onabort: () => reject(new DOMException('aborted', 'AbortError')),
    };
    if (GM_xmlhttpRequest.RESPONSE_TYPE_STREAM) {
      let started = false;
      const handle = GM_xmlhttpRequest({
        ...common,
        responseType: 'stream',
        onloadstart: async (r) => {
          if (started) return;
          started = true;
          const reader = (r.response as ReadableStream<Uint8Array>).getReader();
          const decoder = new TextDecoder();
          let body = '';
          try {
            for (;;) {
              const { value, done: end } = await reader.read();
              if (end) break;
              body += decoder.decode(value, { stream: true });
              onText(body);
            }
            resolve({ status: r.status, body: body + decoder.decode() });
          } catch (error) {
            reject(error);
          }
        },
      });
      abort = () => handle.abort();
    } else {
      const handle = GM_xmlhttpRequest({
        ...common,
        onprogress: (r) => {
          if (r.responseText) onText(r.responseText);
        },
        onload: (r) => resolve({ status: r.status, body: r.responseText }),
      });
      abort = () => handle.abort();
    }
  });
  return { abort: () => abort(), done };
}

/** One request for a small response, e.g. a model list. */
export function sendRequest(request: HttpRequest): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: request.method,
      url: request.url,
      headers: request.headers,
      data: request.body,
      timeout: FETCH_TIMEOUT_MS,
      onload: (r) => resolve({ status: r.status, body: r.responseText }),
      onerror: () => reject(new Error('network error')),
      ontimeout: () => reject(new Error('timeout')),
    });
  });
}

/** A web page as a document, in whatever charset it uses. Sends no cookies. */
export function fetchPage(url: string): Promise<Document> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET',
      url,
      responseType: 'arraybuffer',
      anonymous: true,
      timeout: FETCH_TIMEOUT_MS,
      onload: (r) => {
        if (r.status < 200 || r.status >= 300) return reject(new Error(`HTTP ${r.status}`));
        const type = /^content-type:\s*(.*)$/im.exec(r.responseHeaders ?? '')?.[1] ?? null;
        if (type && !/html|xml|text\/plain/i.test(type)) return reject(new Error(type));
        resolve(new DOMParser().parseFromString(decodeHtml(new Uint8Array(r.response as ArrayBuffer), type), 'text/html'));
      },
      onerror: () => reject(new Error('network error')),
      ontimeout: () => reject(new Error('timeout')),
    });
  });
}
