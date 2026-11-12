<script lang="ts">
  import {
    AI_PROVIDERS,
    exportTheme,
    parseTheme,
    removeRule,
    t,
    type AiConfig,
    type Settings,
    type Subscription,
  } from '@bettersearch/core';
  import type { SubscriptionStatus } from './panel';

  interface Props {
    settings: Settings;
    onchange: (settings: Settings) => void;
    onclose: () => void;
    refreshSubscriptions: () => Promise<void>;
    subscriptionStatus: (sub: Subscription) => SubscriptionStatus;
    listModels: (config: AiConfig) => Promise<string[]>;
  }

  let { settings: initial, onchange, onclose, refreshSubscriptions, subscriptionStatus, listModels }: Props = $props();
  // The panel edits its own copy, taken once when it opens.
  // svelte-ignore state_referenced_locally
  let settings = $state({ ...initial });

  const SITE_RULE = /^\*:\/\/\*\.([^/]+)\/\*$/;
  let blockedSites = $derived(
    settings.rules
      .split('\n')
      .map((line) => line.trim().match(SITE_RULE)?.[1])
      .filter((host): host is string => !!host),
  );

  function commit() {
    onchange({ ...settings });
  }

  function unblock(host: string) {
    settings.rules = removeRule(settings.rules, `*://*.${host}/*`);
    commit();
  }

  let newSubscription = $state('');
  let refreshing = $state(false);
  /** Bumped after a refresh so the status lines read the cache again. */
  let statusVersion = $state(0);

  function addSubscription() {
    const urls = newSubscription.split(/\s+/).filter((u) => /^https?:\/\//.test(u));
    if (!urls.length) return;
    settings.subscriptions = [...settings.subscriptions, { urls, enabled: true }];
    newSubscription = '';
    commit();
  }

  function removeSubscription(index: number) {
    settings.subscriptions = settings.subscriptions.filter((_, i) => i !== index);
    commit();
  }

  async function refreshAll() {
    refreshing = true;
    await refreshSubscriptions();
    refreshing = false;
    statusVersion += 1;
  }

  function describe(sub: Subscription, _version: number): string {
    const status = subscriptionStatus(sub);
    if (status.error && !status.fetchedAt) return t('subs.failed', { error: status.error });
    if (!status.fetchedAt) return t('subs.notFetched');
    const when = new Date(status.fetchedAt).toLocaleString();
    return t('subs.status', { count: status.ruleCount, when }) + (status.error ? t('subs.lastFailed') : '');
  }

  let provider = $derived(AI_PROVIDERS.find((p) => p.id === settings.aiProvider) ?? AI_PROVIDERS.at(-1)!);
  let models = $state<string[]>([]);
  let modelsMessage = $state('');

  function chooseProvider() {
    if (provider.id !== 'custom') {
      settings.aiBaseUrl = provider.baseUrl;
      settings.aiModel = provider.model;
    }
    // A key belongs to one service; never send it to the next one.
    settings.aiApiKey = '';
    models = [];
    modelsMessage = '';
    commit();
  }

  async function loadModels() {
    modelsMessage = '';
    try {
      models = await listModels({ baseUrl: settings.aiBaseUrl, apiKey: settings.aiApiKey, model: settings.aiModel });
      modelsMessage = t('aiset.models', { count: models.length });
    } catch (error) {
      modelsMessage = t('aiset.modelsFailed', { error: (error as Error).message });
    }
  }

  /** Pasted theme JSON while importing, null otherwise. */
  let themeText = $state<string | null>(null);
  let themeMessage = $state('');

  async function copyTheme() {
    const json = exportTheme(settings);
    try {
      await navigator.clipboard.writeText(json);
      themeMessage = t('theme.copied');
    } catch {
      // No clipboard access: show it to copy by hand.
      themeText = json;
      themeMessage = '';
    }
  }

  function applyTheme() {
    const result = parseTheme(themeText ?? '');
    if ('problem' in result) {
      themeMessage = t(result.problem);
      return;
    }
    Object.assign(settings, result.theme);
    themeText = null;
    themeMessage = t('theme.imported');
    commit();
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onclose();
  }
</script>

<svelte:window {onkeydown} />

<div class="backdrop" onclick={onclose} aria-hidden="true"></div>
<aside class="drawer" aria-labelledby="bs-title">
  <header>
    <h2 id="bs-title">{t('settings.title')}</h2>
    <button type="button" class="icon" aria-label={t('settings.close')} onclick={onclose}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"
        ><path d="M6 6l12 12M18 6L6 18"></path></svg
      >
    </button>
  </header>

  <section>
    <h3>{t('appearance.title')}</h3>
    <label class="row">
      <input type="checkbox" bind:checked={settings.layout} onchange={commit} />
      <span>{t('appearance.layout')}</span>
    </label>
    {#if settings.layout}
      <label class="row">
        <span class="label">{t('appearance.columns')}</span>
        <select bind:value={settings.columns} onchange={commit}>
          <option value="1">{t('appearance.columns1')}</option>
          <option value="2">{t('appearance.columns2')}</option>
          <option value="3">{t('appearance.columns3')}</option>
        </select>
      </label>
      <fieldset>
        <legend>{t('appearance.theme')}</legend>
        <label class="row">
          <input type="radio" name="bs-style" value="card" bind:group={settings.cardStyle} onchange={commit} />
          <span>{t('appearance.card')}</span>
        </label>
        <label class="row">
          <input type="radio" name="bs-style" value="raised" bind:group={settings.cardStyle} onchange={commit} />
          <span>{t('appearance.raised')}</span>
        </label>
        <label class="row">
          <input type="radio" name="bs-style" value="line" bind:group={settings.cardStyle} onchange={commit} />
          <span>{t('appearance.line')}</span>
        </label>
      </fieldset>
      <fieldset>
        <legend>{t('appearance.density')}</legend>
        <label class="row">
          <input type="radio" name="bs-density" value="compact" bind:group={settings.density} onchange={commit} />
          <span>{t('appearance.compact')}</span>
        </label>
        <label class="row">
          <input type="radio" name="bs-density" value="comfortable" bind:group={settings.density} onchange={commit} />
          <span>{t('appearance.comfortable')}</span>
        </label>
      </fieldset>
    {/if}
    <label class="row">
      <input type="checkbox" bind:checked={settings.collapseAiAnswers} onchange={commit} />
      <span>{t('appearance.collapseAi')}</span>
    </label>

    <label class="stack">
      <span>{t('theme.css')}</span>
      <textarea rows="5" spellcheck="false" bind:value={settings.customCss} oninput={commit}></textarea>
    </label>
    <!-- Our own constant markup, not user input. -->
    <p class="hint">{@html t('theme.cssHint')}</p>
    <div class="row actions">
      <button type="button" class="link" onclick={copyTheme}>{t('theme.export')}</button>
      {#if themeText === null}
        <button type="button" class="link" onclick={() => ((themeText = ''), (themeMessage = ''))}>{t('theme.import')}</button>
      {/if}
    </div>
    {#if themeText !== null}
      <textarea
        rows="5"
        spellcheck="false"
        aria-label={t('theme.import')}
        placeholder={t('theme.importPlaceholder')}
        bind:value={themeText}
      ></textarea>
      <div class="row actions">
        <button type="button" class="link" onclick={applyTheme}>{t('theme.apply')}</button>
        <button type="button" class="link" onclick={() => ((themeText = null), (themeMessage = ''))}>{t('theme.cancel')}</button>
      </div>
    {/if}
    <p class="hint" role="status">{themeMessage || t('theme.shareHint')}</p>
  </section>

  <section>
    <h3>{t('paging.title')}</h3>
    <label class="row">
      <input type="checkbox" bind:checked={settings.autoPage} onchange={commit} />
      <span>{t('paging.auto')}</span>
    </label>
    {#if settings.autoPage}
      <label class="row">
        <span class="label">{t('paging.limitBefore')}</span>
        <input class="number" type="number" min="1" max="20" bind:value={settings.autoPageLimit} onchange={commit} />
        <span>{t('paging.limitAfter')}</span>
      </label>
    {/if}
  </section>

  <section>
    <h3>{t('ads.title')}</h3>
    <label class="row">
      <input type="checkbox" bind:checked={settings.removeAds} onchange={commit} />
      <span>{t('ads.remove')}</span>
    </label>
  </section>

  <section>
    <h3>{t('links.title')}</h3>
    <label class="row">
      <input type="checkbox" bind:checked={settings.cleanLinks} onchange={commit} />
      <span>{t('links.clean')}</span>
    </label>
    <p class="hint">{t('links.googleHint')}</p>
    <label class="row">
      <span class="label">{t('links.open')}</span>
      <select bind:value={settings.openLinks} onchange={commit}>
        <option value="engine">{t('links.openEngine')}</option>
        <option value="new">{t('links.openNew')}</option>
        <option value="same">{t('links.openSame')}</option>
      </select>
    </label>
  </section>

  <section>
    <h3>{t('official.title')}</h3>
    <label class="row">
      <input type="checkbox" bind:checked={settings.markOfficial} onchange={commit} />
      <span>{t('official.mark')}</span>
    </label>
    {#if settings.markOfficial}
      <label class="row">
        <input type="checkbox" bind:checked={settings.pinOfficial} onchange={commit} />
        <span>{t('official.pin')}</span>
      </label>
    {/if}
    <p class="hint">{t('official.hint')}</p>
    {#if settings.markOfficial}
      <label class="stack">
        <span>{t('official.proxy')}</span>
        <input class="text" type="url" placeholder="https://…/" bind:value={settings.githubProxy} onchange={commit} />
      </label>
      <p class="hint">{t('official.proxyHint')}</p>
    {/if}
  </section>

  <section>
    <h3>{t('aiset.title')}</h3>
    <p class="hint">{t('aiset.hint')}</p>
    <label class="stack">
      <span>{t('aiset.provider')}</span>
      <select bind:value={settings.aiProvider} onchange={chooseProvider}>
        {#each AI_PROVIDERS as p (p.id)}
          <option value={p.id}>{p.id === 'custom' ? t('aiset.custom') : p.name}</option>
        {/each}
      </select>
    </label>
    <label class="stack">
      <span>{t('aiset.key')}</span>
      <input class="text" type="password" autocomplete="off" spellcheck="false" bind:value={settings.aiApiKey} onchange={commit} />
    </label>
    {#if provider.keyUrl}
      <p class="hint"><a href={provider.keyUrl} target="_blank" rel="noopener noreferrer">{t('aiset.getKey')}</a></p>
    {/if}
    <label class="stack">
      <span>{t('aiset.baseUrl')}</span>
      <input class="text" type="url" placeholder="http://localhost:11434/v1" bind:value={settings.aiBaseUrl} onchange={commit} />
    </label>
    <label class="stack">
      <span>{t('aiset.model')}</span>
      <input class="text" list="bs-models" spellcheck="false" bind:value={settings.aiModel} onchange={commit} />
    </label>
    <datalist id="bs-models">
      {#each models as model (model)}<option value={model}></option>{/each}
    </datalist>
    <div class="actions">
      <button type="button" onclick={loadModels}>{t('aiset.listModels')}</button>
    </div>
    {#if modelsMessage}<p class="hint" role="status">{modelsMessage}</p>{/if}
    <p class="hint">{t('aiset.firstRequest')}</p>
  </section>

  <section>
    <h3>{t('blocking.title')}</h3>
    <fieldset>
      <legend>{t('blocking.action')}</legend>
      <label class="row">
        <input type="radio" name="bs-action" value="collapse" bind:group={settings.blockAction} onchange={commit} />
        <span>{t('blocking.collapse')}</span>
      </label>
      <label class="row">
        <input type="radio" name="bs-action" value="hide" bind:group={settings.blockAction} onchange={commit} />
        <span>{t('blocking.hide')}</span>
      </label>
    </fieldset>

    {#if blockedSites.length}
      <ul class="sites" aria-label={t('blocking.sites')}>
        {#each blockedSites as host (host)}
          <li>
            <span class="host">{host}</span>
            <button type="button" class="link" onclick={() => unblock(host)}>{t('blocking.unblock')}</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">{t('blocking.none')}</p>
    {/if}

    <h3 class="sub">{t('subs.title')}</h3>
    {#each settings.subscriptions as sub, i (sub.urls[0])}
      <div class="subscription">
        <label class="row">
          <input type="checkbox" bind:checked={sub.enabled} onchange={commit} />
          <span class="host">{sub.urls[0]}</span>
        </label>
        <p class="hint">{describe(sub, statusVersion)}{sub.urls.length > 1 ? t('subs.mirrors', { count: sub.urls.length - 1 }) : ''}</p>
        <button type="button" class="link" onclick={() => removeSubscription(i)}>{t('subs.remove')}</button>
      </div>
    {/each}
    <div class="row add">
      <label class="visually-hidden" for="bs-new-sub">{t('subs.address')}</label>
      <input
        id="bs-new-sub"
        class="text"
        type="url"
        placeholder={t('subs.placeholder')}
        bind:value={newSubscription}
        onkeydown={(e) => e.key === 'Enter' && addSubscription()}
      />
      <button type="button" class="link" onclick={addSubscription}>{t('subs.add')}</button>
    </div>
    {#if settings.subscriptions.length}
      <button type="button" class="link" disabled={refreshing} onclick={refreshAll}>
        {refreshing ? t('subs.refreshing') : t('subs.refresh')}
      </button>
    {/if}
    <p class="hint">{t('subs.hint')}</p>

    <label class="stack">
      <span>{t('rules.title')}</span>
      <textarea rows="8" spellcheck="false" bind:value={settings.rules} oninput={commit}></textarea>
    </label>
    <!-- Our own constant markup, not user input. -->
    <p class="hint">{@html t('rules.hint')}</p>
  </section>
</aside>

<style>
  :host {
    --bg: #ffffff;
    --fg: #16181d;
    --dim: #5c6370;
    --line: #e3e7ed;
    --accent: #1a4fd6;
    --field: #f5f6f8;
  }
  /* The host carries the engine page's theme, which may differ from the system's. */
  :host([data-theme='dark']) {
    --bg: #171a21;
    --fg: #e4e7ec;
    --dim: #9aa3b2;
    --line: #2a303b;
    --accent: #a9c1ff;
    --field: #1f242d;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    background: rgba(0, 0, 0, 0.2);
  }
  .drawer {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 2147483647;
    box-sizing: border-box;
    width: min(400px, 100vw);
    overflow-y: auto;
    padding: 20px 24px 32px;
    background: var(--bg);
    color: var(--fg);
    box-shadow: -8px 0 24px rgba(0, 0, 0, 0.15);
    font: 14px/1.6 'IBM Plex Sans', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif;
  }
  @media (max-width: 600px) {
    .drawer {
      top: auto;
      left: 0;
      width: 100vw;
      max-height: 85vh;
      border-radius: 16px 16px 0 0;
    }
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
  }
  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
  }
  h3 {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 600;
  }
  section {
    padding: 16px 0;
    border-top: 1px solid var(--line);
  }
  fieldset {
    margin: 0 0 12px;
    padding: 0;
    border: 0;
  }
  legend {
    margin-bottom: 4px;
    color: var(--dim);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    cursor: pointer;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 12px;
  }
  .label {
    min-width: 3em;
    color: var(--dim);
  }
  h3.sub {
    margin-top: 16px;
  }
  .subscription {
    padding: 6px 0;
    border-bottom: 1px solid var(--line);
  }
  .subscription .hint {
    margin: 0 0 2px 26px;
  }
  .subscription .link {
    margin-left: 26px;
  }
  .add {
    margin-top: 8px;
  }
  .actions {
    gap: 16px;
  }
  input.text {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--field);
    color: var(--fg);
    font: 13px 'IBM Plex Mono', ui-monospace, monospace;
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  input.number {
    width: 4em;
    padding: 4px 6px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--field);
    color: var(--fg);
    font: inherit;
  }
  select {
    padding: 4px 8px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--field);
    color: var(--fg);
    font: inherit;
  }
  textarea {
    box-sizing: border-box;
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--field);
    color: var(--fg);
    font: 13px/1.5 'IBM Plex Mono', ui-monospace, monospace;
    resize: vertical;
  }
  .hint {
    margin: 8px 0 0;
    color: var(--dim);
    font-size: 13px;
  }
  .hint :global(code) {
    font-family: 'IBM Plex Mono', ui-monospace, monospace;
    font-size: 12px;
  }
  .sites {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .sites li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 36px;
    border-bottom: 1px solid var(--line);
  }
  .host {
    font: 13px 'IBM Plex Mono', ui-monospace, monospace;
    overflow-wrap: anywhere;
  }
  button.link {
    flex: none;
    padding: 4px 0;
    border: 0;
    background: none;
    color: var(--accent);
    font: inherit;
    cursor: pointer;
  }
  button.icon {
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--fg);
    cursor: pointer;
  }
  button.icon:hover {
    background: var(--field);
  }
  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
</style>
