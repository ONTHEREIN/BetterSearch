// Keeps the user's own configuration the same on every device through a
// WebDAV folder they own. Each setting, rule line and subscription carries the
// time it last changed; merging keeps the newer side of each. Deleted rules and
// subscriptions leave a tombstone so another device does not bring them back.
// The requests are made by the caller, through `send`.

import type { HttpRequest } from './ai';
import { DEFAULT_SETTINGS, SETTINGS_VERSION, type Settings } from './settings';
import type { Subscription } from './subscriptions';

export const SYNC_FORMAT = 1;

/** Fields kept per device: the API key belongs to one service on one device. */
const NOT_SYNCED = new Set<string>(['version', 'aiApiKey', 'rules', 'subscriptions']);

/** Earlier remote versions kept as backups. */
export const HISTORY_SIZE = 10;
/** Tombstones older than this are dropped: every device has seen them by then. */
const TOMBSTONE_MS = 180 * 24 * 60 * 60 * 1000;

interface Stamp {
  /** When it last changed, in ms; 0 when never changed since this device started syncing. */
  at: number;
  deleted?: true;
}

export interface SyncDoc {
  format: number;
  /** `SETTINGS_VERSION` of the newest device that wrote it. */
  settingsVersion: number;
  fields: Record<string, Stamp & { value: unknown }>;
  /** Keyed by the trimmed rule line. */
  rules: Record<string, Stamp>;
  /** Keyed by the subscription's first URL. */
  subscriptions: Record<string, Stamp & { value?: Subscription }>;
  /** Backup files of earlier versions, oldest first; only in the remote copy. */
  history?: string[];
}

function emptyDoc(): SyncDoc {
  return { format: SYNC_FORMAT, settingsVersion: SETTINGS_VERSION, fields: {}, rules: {}, subscriptions: {} };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function ruleLines(rules: string): string[] {
  return [...new Set(rules.split('\n').map((l) => l.trim()).filter(Boolean))];
}

/**
 * This device's settings as a sync document, stamping whatever changed since
 * `previous` with `now`. Without a previous document everything is stamped 0,
 * so a device joining for the first time takes the settings already synced.
 */
export function stampLocal(previous: SyncDoc | null, settings: Settings, now: number): SyncDoc {
  const at = previous ? now : 0;
  const base = previous ?? emptyDoc();
  const doc: SyncDoc = { ...emptyDoc(), fields: { ...base.fields }, rules: { ...base.rules }, subscriptions: { ...base.subscriptions } };

  for (const [key, value] of Object.entries(settings)) {
    if (NOT_SYNCED.has(key)) continue;
    const old = base.fields[key];
    if (!old || !same(old.value, value)) doc.fields[key] = { value, at };
  }

  const lines = new Set(ruleLines(settings.rules));
  for (const line of lines) {
    if (!base.rules[line] || base.rules[line].deleted) doc.rules[line] = { at };
  }
  for (const [line, stamp] of Object.entries(base.rules)) {
    if (!stamp.deleted && !lines.has(line)) doc.rules[line] = { at, deleted: true };
  }

  const subs = new Map(settings.subscriptions.filter((s) => s.urls[0]).map((s) => [s.urls[0]!, s]));
  for (const [key, sub] of subs) {
    const old = base.subscriptions[key];
    if (!old || old.deleted || !same(old.value, sub)) doc.subscriptions[key] = { value: sub, at };
  }
  for (const [key, stamp] of Object.entries(base.subscriptions)) {
    if (!stamp.deleted && !subs.has(key)) doc.subscriptions[key] = { at, deleted: true };
  }
  return doc;
}

/** Newer side of each entry; tombstones from before `pruneBefore` are dropped. */
function mergeMap<T extends Stamp>(local: Record<string, T>, remote: Record<string, T>, pruneBefore: number): Record<string, T> {
  // Remote order first: it is the order other devices append in.
  const out: Record<string, T> = {};
  for (const key of new Set([...Object.keys(remote), ...Object.keys(local)])) {
    const a = local[key];
    const b = remote[key];
    // On a tie the remote side wins, so the first device to sync sets the start.
    const winner = !a ? b! : !b ? a : a.at > b.at ? a : b;
    if (winner.deleted && winner.at < pruneBefore) continue;
    out[key] = winner;
  }
  return out;
}

export function mergeDocs(local: SyncDoc, remote: SyncDoc, now: number): SyncDoc {
  return {
    format: Math.max(local.format, remote.format),
    settingsVersion: Math.max(local.settingsVersion, remote.settingsVersion),
    // Fields this version does not know are kept for the devices that do.
    fields: mergeMap(local.fields, remote.fields, 0),
    rules: mergeMap(local.rules, remote.rules, now - TOMBSTONE_MS),
    subscriptions: mergeMap(local.subscriptions, remote.subscriptions, now - TOMBSTONE_MS),
    history: remote.history,
  };
}

/** True when the two hold the same configuration, whatever their history. */
export function sameContent(a: SyncDoc, b: SyncDoc): boolean {
  return same([a.fields, a.rules, a.subscriptions], [b.fields, b.rules, b.subscriptions]);
}

/** `settings` changed to match `doc`, keeping the local order of rules and subscriptions. */
export function applyDoc(settings: Settings, doc: SyncDoc): Settings {
  const next: Record<string, unknown> = { ...settings };
  for (const [key, { value }] of Object.entries(doc.fields)) {
    const known = DEFAULT_SETTINGS[key as keyof Settings];
    if (known === undefined || NOT_SYNCED.has(key)) continue;
    // Written by another copy of this script, but checked anyway.
    if (typeof value !== typeof known || Array.isArray(value) !== Array.isArray(known)) continue;
    next[key] = value;
  }

  const live = new Set(Object.keys(doc.rules).filter((line) => !doc.rules[line]!.deleted));
  const kept = new Set<string>();
  const lines = settings.rules.split('\n').filter((raw) => {
    const line = raw.trim();
    // Blank lines are layout, not rules.
    if (!line) return true;
    if (!live.has(line) || kept.has(line)) return false;
    kept.add(line);
    return true;
  });
  for (const line of live) if (!kept.has(line)) lines.push(line);
  next.rules = lines.join('\n').replace(/^\n+|\n+$/g, '');

  const subs = settings.subscriptions.filter((s) => {
    const stamp = doc.subscriptions[s.urls[0] ?? ''];
    return stamp && !stamp.deleted;
  });
  const present = new Set(subs.map((s) => s.urls[0]));
  for (const [key, stamp] of Object.entries(doc.subscriptions)) {
    if (!stamp.deleted && stamp.value && !present.has(key)) subs.push(stamp.value);
  }
  next.subscriptions = subs.map((s) => {
    const value = doc.subscriptions[s.urls[0]!]?.value;
    return value ?? s;
  });

  // A key belongs to one service; never send it to another.
  if (next.aiBaseUrl !== settings.aiBaseUrl) next.aiApiKey = '';
  return next as unknown as Settings;
}

export interface WebDavConfig {
  /** The folder URL, e.g. https://dav.jianguoyun.com/dav/ */
  url: string;
  username: string;
  password: string;
}

export type DavMethod = 'GET' | 'PUT' | 'DELETE' | 'MKCOL';
export type Send = (request: HttpRequest) => Promise<{ status: number; body: string }>;

/** Our folder inside the user's WebDAV folder. */
const FOLDER = 'BetterSearch/';
const MAIN = 'sync.json';

function basicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  return `Basic ${btoa(String.fromCharCode(...bytes))}`;
}

export function davRequest(config: WebDavConfig, method: DavMethod, path: string, body?: string): HttpRequest {
  const base = config.url.trim().replace(/\/*$/, '/');
  const headers: Record<string, string> = { Authorization: basicAuth(config.username, config.password) };
  if (body !== undefined) headers['Content-Type'] = 'application/json; charset=utf-8';
  return { method, url: base + FOLDER + path, headers, body };
}

/** Why the server refused, in a form the settings can show. */
export class SyncError extends Error {
  constructor(
    message: string,
    readonly status = 0,
  ) {
    super(message);
  }
}

function parseDoc(body: string): SyncDoc {
  try {
    const doc = JSON.parse(body) as SyncDoc;
    if (typeof doc.format === 'number' && doc.fields && doc.rules && doc.subscriptions) return doc;
  } catch {
    // Reported below.
  }
  throw new SyncError('sync.json is not a BetterSearch sync file');
}

const ok = (status: number) => status >= 200 && status < 300;

function failure(status: number): SyncError {
  return new SyncError(status === 401 || status === 403 ? 'auth' : `HTTP ${status}`, status);
}

/** A file name for a backup taken at `now`, sorting in time order. */
function backupName(now: number): string {
  return `history/${new Date(now).toISOString().replace(/[:.]/g, '-')}.json`;
}

/**
 * Merge `local` with the remote copy and upload the result if it differs,
 * keeping the remote version it replaces as a backup. Returns the merged
 * document, which the caller applies and keeps as its new local copy.
 */
export async function runSync(send: Send, config: WebDavConfig, local: SyncDoc, now: number): Promise<{ doc: SyncDoc; uploaded: boolean }> {
  const got = await send(davRequest(config, 'GET', MAIN));
  if (!ok(got.status) && got.status !== 404) throw failure(got.status);
  const remote = got.status === 404 ? null : parseDoc(got.body);

  const merged = remote ? mergeDocs(local, remote, now) : { ...local, history: [] };
  if (remote && sameContent(merged, remote)) return { doc: merged, uploaded: false };

  const put = async (path: string, body: string) => {
    let r = await send(davRequest(config, 'PUT', path, body));
    // The folders do not exist yet. MKCOL on an existing one fails harmlessly.
    if (r.status === 404 || r.status === 409) {
      await send(davRequest(config, 'MKCOL', ''));
      await send(davRequest(config, 'MKCOL', 'history/'));
      r = await send(davRequest(config, 'PUT', path, body));
    }
    if (!ok(r.status)) throw failure(r.status);
  };

  let history = merged.history ?? [];
  let dropped: string[] = [];
  if (remote) {
    const name = backupName(now);
    await put(name, got.body);
    history = [...history.filter((h) => h !== name), name];
    dropped = history.slice(0, -HISTORY_SIZE);
    history = history.slice(-HISTORY_SIZE);
  }
  const doc = { ...merged, history };
  await put(MAIN, JSON.stringify(doc));
  // Old backups are only tidied up; a failure here loses nothing.
  await Promise.allSettled(dropped.map((name) => send(davRequest(config, 'DELETE', name))));
  return { doc, uploaded: true };
}
