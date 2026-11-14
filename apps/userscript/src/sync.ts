import {
  applyDoc,
  runSync,
  sameContent,
  stampLocal,
  type Settings,
  type SyncDoc,
  type WebDavConfig,
} from '@bettersearch/core';
import { sendRequest, store } from './platform';

export interface SyncConfig extends WebDavConfig {
  enabled: boolean;
}

export interface SyncStatus {
  /** When the last sync succeeded. */
  at: number | null;
  /** Why the last attempt failed; null when it succeeded. */
  error: string | null;
}

const CONFIG_KEY = 'sync:webdav';
const DOC_KEY = 'sync:doc';
const STATUS_KEY = 'sync:status';

/** Opening search pages syncs at most this often. */
const INTERVAL_MS = 10 * 60 * 1000;
/** A change is uploaded once the settings have been still this long. */
const DEBOUNCE_MS = 5000;

export interface SyncOptions {
  settings(): Settings;
  /** Save and apply settings that came from another device. */
  apply(settings: Settings): void;
  /** True while the settings panel is open; it edits its own copy, so syncing waits. */
  busy(): boolean;
}

/** WebDAV sync of the user's own configuration; see `@bettersearch/core` sync. */
export class Sync {
  private timer = 0;
  private running: Promise<SyncStatus> | null = null;

  constructor(private readonly options: SyncOptions) {}

  config(): SyncConfig {
    return store.get<SyncConfig>(CONFIG_KEY, { enabled: false, url: '', username: '', password: '' });
  }

  setConfig(config: SyncConfig): void {
    store.set(CONFIG_KEY, config);
    if (!config.enabled) clearTimeout(this.timer);
  }

  status(): SyncStatus {
    return store.get<SyncStatus>(STATUS_KEY, { at: null, error: null });
  }

  private ready(): boolean {
    const c = this.config();
    return c.enabled && !!c.url.trim() && !!c.username.trim();
  }

  /** Call after every settings change: records what changed and uploads it soon. */
  changed(settings: Settings): void {
    if (!this.ready()) return;
    const previous = store.get<SyncDoc | null>(DOC_KEY, null);
    const doc = stampLocal(previous, settings, Date.now());
    if (previous && sameContent(doc, previous)) return;
    store.set(DOC_KEY, doc);
    this.schedule();
  }

  /** On opening a search page: sync if it has been a while. */
  start(): void {
    if (this.ready() && Date.now() - (this.status().at ?? 0) >= INTERVAL_MS) this.schedule(0);
  }

  private schedule(delay = DEBOUNCE_MS): void {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      if (this.options.busy()) this.schedule();
      else void this.now();
    }, delay);
  }

  /** Sync now; resolves with the outcome, which is also kept for the settings panel. */
  now(): Promise<SyncStatus> {
    clearTimeout(this.timer);
    this.running ??= this.run().finally(() => (this.running = null));
    return this.running;
  }

  private async run(): Promise<SyncStatus> {
    const config = this.config();
    let status: SyncStatus;
    try {
      const settings = this.options.settings();
      const now = Date.now();
      const local = stampLocal(store.get<SyncDoc | null>(DOC_KEY, null), settings, now);
      const { doc } = await runSync(sendRequest, config, local, now);
      if (this.options.settings() === settings) {
        store.set(DOC_KEY, { ...doc, history: undefined });
        const next = applyDoc(settings, doc);
        if (JSON.stringify(next) !== JSON.stringify(settings)) this.options.apply(next);
      } else {
        // Changed while the request was out: merge again rather than overwrite the change.
        this.schedule();
      }
      status = { at: Date.now(), error: null };
    } catch (error) {
      status = { at: this.status().at, error: (error as Error).message };
    }
    store.set(STATUS_KEY, status);
    return status;
  }
}
