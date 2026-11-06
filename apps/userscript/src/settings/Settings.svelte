<script lang="ts">
  import { removeRule, type Settings, type Subscription } from '@bettersearch/core';
  import type { SubscriptionStatus } from './panel';

  interface Props {
    settings: Settings;
    onchange: (settings: Settings) => void;
    onclose: () => void;
    refreshSubscriptions: () => Promise<void>;
    subscriptionStatus: (sub: Subscription) => SubscriptionStatus;
  }

  let { settings: initial, onchange, onclose, refreshSubscriptions, subscriptionStatus }: Props = $props();
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
    if (status.error && !status.fetchedAt) return `更新失败：${status.error}`;
    if (!status.fetchedAt) return '尚未下载';
    const when = new Date(status.fetchedAt).toLocaleString();
    return `${status.ruleCount} 条规则，更新于 ${when}${status.error ? '（最近一次更新失败）' : ''}`;
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onclose();
  }
</script>

<svelte:window {onkeydown} />

<div class="backdrop" onclick={onclose} aria-hidden="true"></div>
<aside class="drawer" aria-labelledby="bs-title">
  <header>
    <h2 id="bs-title">BetterSearch 设置</h2>
    <button type="button" class="icon" aria-label="关闭设置" onclick={onclose}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"
        ><path d="M6 6l12 12M18 6L6 18"></path></svg
      >
    </button>
  </header>

  <section>
    <h3>外观</h3>
    <label class="row">
      <input type="checkbox" bind:checked={settings.layout} onchange={commit} />
      <span>使用多列卡片布局</span>
    </label>
    {#if settings.layout}
      <label class="row">
        <span class="label">列数</span>
        <select bind:value={settings.columns} onchange={commit}>
          <option value="auto">自动（按窗口宽度）</option>
          <option value="1">1 列</option>
          <option value="2">2 列</option>
          <option value="3">3 列</option>
        </select>
      </label>
      <fieldset>
        <legend>结果样式</legend>
        <label class="row">
          <input type="radio" name="bs-style" value="card" bind:group={settings.cardStyle} onchange={commit} />
          <span>卡片</span>
        </label>
        <label class="row">
          <input type="radio" name="bs-style" value="line" bind:group={settings.cardStyle} onchange={commit} />
          <span>细线分隔</span>
        </label>
      </fieldset>
      <fieldset>
        <legend>密度</legend>
        <label class="row">
          <input type="radio" name="bs-density" value="compact" bind:group={settings.density} onchange={commit} />
          <span>紧凑</span>
        </label>
        <label class="row">
          <input type="radio" name="bs-density" value="comfortable" bind:group={settings.density} onchange={commit} />
          <span>宽松</span>
        </label>
      </fieldset>
    {/if}
    <label class="row">
      <input type="checkbox" bind:checked={settings.collapseAiAnswers} onchange={commit} />
      <span>把搜索引擎自带的 AI 回答折叠成一行</span>
    </label>
  </section>

  <section>
    <h3>翻页</h3>
    <label class="row">
      <input type="checkbox" bind:checked={settings.autoPage} onchange={commit} />
      <span>滚动到底部时自动加载下一页</span>
    </label>
    {#if settings.autoPage}
      <label class="row">
        <span class="label">自动加载</span>
        <input class="number" type="number" min="1" max="20" bind:value={settings.autoPageLimit} onchange={commit} />
        <span>页后，改为点击按钮加载</span>
      </label>
    {/if}
  </section>

  <section>
    <h3>广告</h3>
    <label class="row">
      <input type="checkbox" bind:checked={settings.removeAds} onchange={commit} />
      <span>去除搜索结果中的广告</span>
    </label>
  </section>

  <section>
    <h3>链接</h3>
    <label class="row">
      <input type="checkbox" bind:checked={settings.cleanLinks} onchange={commit} />
      <span>点击结果时直接打开目标网站，并去掉链接里的跟踪参数</span>
    </label>
    <p class="hint">Google 的结果链接是加密跳转，暂时只能去掉点击上报。</p>
  </section>

  <section>
    <h3>屏蔽</h3>
    <fieldset>
      <legend>被屏蔽的结果</legend>
      <label class="row">
        <input type="radio" name="bs-action" value="collapse" bind:group={settings.blockAction} onchange={commit} />
        <span>折叠成一行，可以点击显示</span>
      </label>
      <label class="row">
        <input type="radio" name="bs-action" value="hide" bind:group={settings.blockAction} onchange={commit} />
        <span>完全隐藏</span>
      </label>
    </fieldset>

    {#if blockedSites.length}
      <ul class="sites" aria-label="已屏蔽的网站">
        {#each blockedSites as host (host)}
          <li>
            <span class="host">{host}</span>
            <button type="button" class="link" onclick={() => unblock(host)}>取消屏蔽</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="hint">还没有屏蔽任何网站。把鼠标移到搜索结果上，点右上角的图标就能屏蔽它所在的网站。</p>
    {/if}

    <h3 class="sub">订阅列表</h3>
    {#each settings.subscriptions as sub, i (sub.urls[0])}
      <div class="subscription">
        <label class="row">
          <input type="checkbox" bind:checked={sub.enabled} onchange={commit} />
          <span class="host">{sub.urls[0]}</span>
        </label>
        <p class="hint">{describe(sub, statusVersion)}{sub.urls.length > 1 ? `，另有 ${sub.urls.length - 1} 个镜像` : ''}</p>
        <button type="button" class="link" onclick={() => removeSubscription(i)}>删除</button>
      </div>
    {/each}
    <div class="row add">
      <label class="visually-hidden" for="bs-new-sub">订阅地址</label>
      <input
        id="bs-new-sub"
        class="text"
        type="url"
        placeholder="订阅地址，多个镜像用空格分隔"
        bind:value={newSubscription}
        onkeydown={(e) => e.key === 'Enter' && addSubscription()}
      />
      <button type="button" class="link" onclick={addSubscription}>添加</button>
    </div>
    {#if settings.subscriptions.length}
      <button type="button" class="link" disabled={refreshing} onclick={refreshAll}>
        {refreshing ? '正在更新…' : '立即更新全部订阅'}
      </button>
    {/if}
    <p class="hint">支持 uBlacklist 格式的列表，每 24 小时自动更新。第一次访问新的地址时，脚本管理器会请你确认。</p>

    <label class="stack">
      <span>屏蔽规则</span>
      <textarea rows="8" spellcheck="false" bind:value={settings.rules} oninput={commit}></textarea>
    </label>
    <p class="hint">每行一条，兼容 uBlacklist 语法，例如 <code>*://*.example.com/*</code>、<code>example.com</code> 或正则 <code>/keyword/</code>。以 <code>@</code> 开头的规则表示不屏蔽。</p>
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
  code {
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
