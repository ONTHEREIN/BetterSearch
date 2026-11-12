import { aiReady, chatRequest, type ChatMessage, type Settings, type Source } from '@bettersearch/core';
import { mount, unmount } from 'svelte';
import { fetchPage, streamRequest } from '../platform';
import AssistantBar from './Assistant.svelte';

export interface AssistantOptions {
  settings(): Settings;
  /** The results on the page now, blocked sites left out. */
  sources(): Source[];
  openSettings(): void;
}

type App = { summarizePage(source: Source): Promise<void> };

/**
 * The AI bar: a full-width row at the top of the results. Nothing is sent
 * until the user asks. A new search, or new AI settings, starts afresh.
 */
export class Assistant {
  private host: HTMLElement | null = null;
  private app: App | null = null;
  /** The search and settings the open conversation belongs to. */
  private key = '';

  constructor(private readonly options: AssistantOptions) {}

  ready(): boolean {
    const s = this.options.settings();
    return aiReady({ provider: s.aiProvider, baseUrl: s.aiBaseUrl, apiKey: s.aiApiKey, model: s.aiModel });
  }

  /** Call on every page pass; `container` is null when the page has no results. */
  sync(container: HTMLElement | null, query: string): void {
    if (!container || !this.ready()) {
      this.remove();
      return;
    }
    const s = this.options.settings();
    const key = [query, s.aiBaseUrl, s.aiModel, s.aiApiKey].join('\n');
    if (key !== this.key) this.remove();
    this.key = key;
    if (!this.host) this.create(query);
    // The engine may rebuild the container, or put new content before the bar.
    if (container.firstElementChild !== this.host) container.prepend(this.host!);
    const theme = document.documentElement.dataset.bsTheme ?? 'light';
    if (this.host!.dataset.theme !== theme) this.host!.dataset.theme = theme;
  }

  summarizePage(source: Source): void {
    if (!this.app || !this.host) return;
    this.host.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    void this.app.summarizePage(source);
  }

  private create(query: string): void {
    const s = this.options.settings();
    const config = { baseUrl: s.aiBaseUrl, apiKey: s.aiApiKey, model: s.aiModel };
    this.host = document.createElement('div');
    this.host.className = 'bs-assistant';
    const shadow = this.host.attachShadow({ mode: 'open' });
    this.app = mount(AssistantBar, {
      target: shadow,
      props: {
        query,
        model: s.aiModel,
        sources: () => this.options.sources(),
        chat: (messages: ChatMessage[], onText: (received: string) => void) => streamRequest(chatRequest(config, messages), onText),
        fetchPage,
        openSettings: () => this.options.openSettings(),
      },
    }) as App;
  }

  private remove(): void {
    if (this.app) void unmount(this.app);
    this.host?.remove();
    this.app = null;
    this.host = null;
    this.key = '';
  }
}
