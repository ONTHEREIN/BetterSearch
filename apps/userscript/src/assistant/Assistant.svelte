<script lang="ts">
  import {
    ChatStream,
    errorMessage,
    extractPageText,
    pagePrompt,
    parseAnswer,
    searchPrompt,
    siteOf,
    t,
    type ChatMessage,
    type Source,
  } from '@bettersearch/core';
  import type { Streaming } from '../platform';
  import type { EngineAnswer } from './index';

  interface Props {
    query: string;
    model: string;
    /** The results on the page now, blocked sites left out. */
    sources: () => Source[];
    chat: (messages: ChatMessage[], onText: (received: string) => void) => Streaming;
    fetchPage: (url: string) => Promise<Document>;
    openSettings: () => void;
  }

  let { query, model, sources: currentSources, chat, fetchPage, openSettings }: Props = $props();

  interface Turn {
    /** What started it: a summary request or the user's question. */
    prompt: string;
    answer: string;
    status: string;
    error: string;
  }

  /** What the answers cite as [n]. */
  let sources = $state<Source[]>([]);
  let turns = $state<Turn[]>([]);
  let messages: ChatMessage[] = [];
  let running: Streaming | null = null;
  let busy = $state(false);
  let question = $state('');
  let engine = $state<EngineAnswer>('none');
  let toggleEngine = () => {};
  /** Less text than this is a login wall, an app shell or an error page. */
  const MIN_PAGE_TEXT = 200;

  /** Send `messages` and stream the answer into `turn`. */
  async function run(turn: Turn): Promise<void> {
    const stream = new ChatStream();
    const append = (text: string) => {
      if (text) turn.answer += text;
    };
    const handle = chat(messages, (received) => append(stream.push(received)));
    running = handle;
    busy = true;
    try {
      const { status, body } = await handle.done;
      if (status < 200 || status >= 300) {
        turn.error = t('assistant.error', { error: errorMessage(body) ?? `HTTP ${status}` });
      } else {
        append(stream.finish(body));
        if (running === handle) messages.push({ role: 'assistant', content: turn.answer });
      }
    } catch (error) {
      if ((error as Error).name === 'AbortError') turn.status = t('assistant.stopped');
      else turn.error = t('assistant.error', { error: (error as Error).message });
    }
    // A newer request may have replaced this one meanwhile.
    if (running === handle) {
      running = null;
      busy = false;
    }
  }

  /** A new conversation, replacing the current one. */
  function start(prompt: string): Turn {
    running?.abort();
    running = null;
    turns = [{ prompt, answer: '', status: '', error: '' }];
    return turns[0]!;
  }

  export function summarizeSearch(): void {
    const found = currentSources().slice(0, 10);
    const turn = start(t('assistant.searchTitle'));
    if (!found.length) {
      turn.error = t('assistant.noSources');
      return;
    }
    sources = found;
    messages = searchPrompt(query, found);
    void run(turn);
  }

  /** Summarise one result's page; falls back to its snippet when the page cannot be read. */
  export async function summarizePage(source: Source): Promise<void> {
    const site = siteOf(new URL(source.url).hostname);
    const turn = start(t('assistant.pageTitle', { site }));
    sources = [source];
    busy = true;
    turn.status = t('assistant.readingPage', { site });
    let text = '';
    let failure = '';
    try {
      text = extractPageText(await fetchPage(source.url)).text;
    } catch (error) {
      failure = (error as Error).message;
    }
    if (turns[0] !== turn) return; // another summary started while reading
    if (text.length < MIN_PAGE_TEXT) {
      turn.status = t('assistant.pageFallback', { site, error: failure || t('assistant.noText') });
      text = source.snippet;
    } else {
      turn.status = '';
    }
    messages = pagePrompt(query, { title: source.title, url: source.url, text });
    await run(turn);
  }

  /** Called on every page pass, so assign only what changed. */
  export function engineAnswer(state: EngineAnswer, toggle: () => void): void {
    if (engine !== state) engine = state;
    toggleEngine = toggle;
  }

  function ask(event: SubmitEvent): void {
    event.preventDefault();
    const text = question.trim();
    if (!text || busy) return;
    question = '';
    messages.push({ role: 'user', content: text });
    turns.push({ prompt: text, answer: '', status: '', error: '' });
    void run(turns[turns.length - 1]!);
  }

  function clear(): void {
    running?.abort();
    running = null;
    busy = false;
    turns = [];
    messages = [];
    sources = [];
  }
</script>

<section class="bar" aria-label={t('assistant.label')}>
  <div class="head">
    <span class="mark" aria-hidden="true">✦</span>
    <strong>{t('assistant.label')}</strong>
    {#if !turns.length}
      <button type="button" class="primary" onclick={summarizeSearch}>{t('assistant.summarize')}</button>
    {/if}
    <span class="model" title={t('assistant.privacy')}>{model}</span>
    {#if busy}
      <button type="button" class="link" onclick={() => running?.abort()}>{t('assistant.stop')}</button>
    {:else if turns.length}
      <button type="button" class="link" onclick={summarizeSearch}>{t('assistant.again')}</button>
      <button type="button" class="link" onclick={clear}>{t('assistant.clear')}</button>
    {/if}
    {#if engine !== 'none'}
      <button type="button" class="link" aria-expanded={engine === 'expanded'} onclick={() => toggleEngine()}
        >{t(engine === 'expanded' ? 'assistant.engineHide' : 'assistant.engineShow')}</button
      >
    {/if}
    <button type="button" class="link" onclick={openSettings}>{t('assistant.settings')}</button>
  </div>

  {#each turns as turn, i (i)}
    <div class="turn">
      <div class="prompt">{turn.prompt}</div>
      {#if turn.status}<div class="status">{turn.status}</div>{/if}
      <div class="answer" aria-live="polite">
        {#each parseAnswer(turn.answer) as block, j (j)}
          <p class:item={block.type === 'li'}>
            {#each block.content as part, k (k)}
              {#if 'cite' in part}
                {@const source = sources[part.cite - 1]}
                {#if source}
                  <a class="cite" href={source.url} title={source.title} target="_blank" rel="noopener noreferrer"
                    >{part.cite}</a
                  >
                {:else}[{part.cite}]{/if}
              {:else if part.bold}<strong>{part.text}</strong>{:else}{part.text}{/if}
            {/each}
          </p>
        {/each}
        {#if busy && i === turns.length - 1 && !turn.answer && !turn.error}
          <p class="status">{t('assistant.thinking')}</p>
        {/if}
      </div>
      {#if turn.error}<div class="error" role="alert">{turn.error}</div>{/if}
    </div>
  {/each}

  {#if turns.length}
    <form class="ask" onsubmit={ask}>
      <input
        type="text"
        bind:value={question}
        placeholder={t('assistant.askPlaceholder')}
        aria-label={t('assistant.ask')}
        disabled={busy}
      />
      <button type="submit" class="primary" disabled={busy || !question.trim()}>{t('assistant.send')}</button>
    </form>
  {/if}
</section>

<style>
  :host {
    --bg: #f7f9ff;
    --fg: #16181d;
    --dim: #5c6370;
    --line: #dfe5f2;
    --accent: #1a4fd6;
    --field: #ffffff;
    --error: #b42318;
  }
  :host([data-theme='dark']) {
    --bg: #1a1f2b;
    --fg: #e4e7ec;
    --dim: #9aa3b2;
    --line: #2d3443;
    --accent: #a9c1ff;
    --field: #141821;
    --error: #ff9b8f;
  }

  .bar {
    box-sizing: border-box;
    padding: 10px 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--bg);
    color: var(--fg);
    font: 14px/1.65 'IBM Plex Sans', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
  }
  .mark {
    color: var(--accent);
  }
  .model {
    margin-left: auto;
    color: var(--dim);
    font-size: 12px;
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  button:disabled {
    cursor: default;
    opacity: 0.5;
  }
  .primary {
    padding: 3px 12px;
    border: 1px solid var(--accent);
    border-radius: 999px;
    background: none;
    color: var(--accent);
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    color: var(--accent);
    font-size: 13px;
  }
  button:focus-visible,
  input:focus-visible,
  a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .turn {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--line);
  }
  .prompt {
    color: var(--dim);
    font-size: 13px;
  }
  .answer p {
    margin: 6px 0;
  }
  .answer p.item {
    position: relative;
    margin: 2px 0;
    padding-left: 16px;
  }
  .answer p.item::before {
    content: '•';
    position: absolute;
    left: 2px;
    color: var(--dim);
  }
  .cite {
    display: inline-block;
    min-width: 16px;
    margin: 0 1px;
    padding: 0 4px;
    border-radius: 4px;
    background: var(--line);
    color: var(--accent);
    font-size: 11px;
    line-height: 16px;
    text-align: center;
    text-decoration: none;
    vertical-align: 2px;
  }
  .status {
    color: var(--dim);
    font-size: 13px;
  }
  .error {
    margin-top: 6px;
    color: var(--error);
    font-size: 13px;
  }
  .ask {
    display: flex;
    gap: 8px;
    margin-top: 10px;
  }
  .ask input {
    flex: 1;
    min-width: 0;
    padding: 4px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--field);
    color: var(--fg);
    font: inherit;
  }
</style>
