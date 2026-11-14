import { describe, expect, it } from 'vitest';
import {
  applyDoc,
  DEFAULT_SETTINGS,
  HISTORY_SIZE,
  mergeDocs,
  runSync,
  stampLocal,
  SyncError,
  type HttpRequest,
  type Settings,
  type SyncDoc,
} from '../src';

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...patch });
const DAY = 24 * 60 * 60 * 1000;

/** One device: its settings and its local sync document. */
function device(s: Settings) {
  return { settings: s, doc: null as SyncDoc | null };
}

/** Sync `d` against `remote` in memory, as `runSync` would. */
function syncWith(d: ReturnType<typeof device>, remote: SyncDoc | null, now: number): SyncDoc {
  const local = stampLocal(d.doc, d.settings, now);
  const merged = remote ? mergeDocs(local, remote, now) : local;
  d.settings = applyDoc(d.settings, merged);
  d.doc = merged;
  return merged;
}

describe('stampLocal', () => {
  it('stamps everything 0 the first time, so the synced settings win', () => {
    const doc = stampLocal(null, settings({ columns: '3', rules: '*://*.a.com/*' }), 1000);
    expect(doc.fields.columns).toEqual({ value: '3', at: 0 });
    expect(doc.rules['*://*.a.com/*']).toEqual({ at: 0 });
  });

  it('stamps only what changed, and leaves tombstones for removed rules', () => {
    const first = stampLocal(null, settings({ rules: 'a\nb' }), 1000);
    const next = stampLocal(first, settings({ rules: 'b\nc', columns: '1' }), 2000);
    expect(next.fields.columns!.at).toBe(2000);
    expect(next.fields.layout!.at).toBe(0);
    expect(next.rules).toEqual({ a: { at: 2000, deleted: true }, b: { at: 0 }, c: { at: 2000 } });
  });

  it('never includes the API key or the settings version', () => {
    const doc = stampLocal(null, settings({ aiApiKey: 'sk-secret' }), 1000);
    expect(JSON.stringify(doc)).not.toContain('sk-secret');
    expect(doc.fields.version).toBeUndefined();
  });
});

describe('sync between devices', () => {
  it('gives a new device the synced settings and keeps rules from both', () => {
    const a = device(settings({ columns: '3', rules: '*://*.a.com/*' }));
    const remote = syncWith(a, null, 1000);
    const b = device(settings({ rules: '*://*.b.com/*' }));
    syncWith(b, remote, 2000);
    expect(b.settings.columns).toBe('3');
    expect(b.settings.rules).toBe('*://*.b.com/*\n*://*.a.com/*');
  });

  it('keeps the later change of each field', () => {
    const a = device(settings());
    let remote = syncWith(a, null, 1000);
    const b = device(settings());
    remote = syncWith(b, remote, 1100);

    a.settings = { ...a.settings, columns: '1' };
    a.doc = stampLocal(a.doc, a.settings, 2000);
    b.settings = { ...b.settings, columns: '3', density: 'comfortable' };
    b.doc = stampLocal(b.doc, b.settings, 3000);

    remote = syncWith(a, remote, 3500);
    remote = syncWith(b, remote, 4000);
    syncWith(a, remote, 5000);
    expect(a.settings.columns).toBe('3');
    expect(a.settings.density).toBe('comfortable');
  });

  it('does not bring back a rule another device removed', () => {
    const a = device(settings({ rules: 'x\ny' }));
    let remote = syncWith(a, null, 1000);
    const b = device(settings());
    remote = syncWith(b, remote, 1100);
    expect(b.settings.rules).toBe('x\ny');

    b.settings = { ...b.settings, rules: 'y' };
    remote = syncWith(b, remote, 2000);
    syncWith(a, remote, 3000);
    expect(a.settings.rules).toBe('y');
  });

  it('removes subscriptions removed elsewhere and takes their newer state', () => {
    const one = { urls: ['https://one/'], enabled: true };
    const two = { urls: ['https://two/'], enabled: true };
    const a = device(settings({ subscriptions: [one, two] }));
    let remote = syncWith(a, null, 1000);
    const b = device(settings());
    remote = syncWith(b, remote, 1100);

    b.settings = { ...b.settings, subscriptions: [{ ...one, enabled: false }] };
    remote = syncWith(b, remote, 2000);
    syncWith(a, remote, 3000);
    expect(a.settings.subscriptions).toEqual([{ ...one, enabled: false }]);
  });

  it('clears the API key when another device switched services', () => {
    const a = device(settings());
    let remote = syncWith(a, null, 1000);
    const b = device(settings({ aiApiKey: 'sk-b' }));
    remote = syncWith(b, remote, 1100);

    a.settings = { ...a.settings, aiProvider: 'kimi', aiBaseUrl: 'https://api.moonshot.cn/v1' };
    remote = syncWith(a, remote, 2000);
    syncWith(b, remote, 3000);
    expect(b.settings.aiBaseUrl).toBe('https://api.moonshot.cn/v1');
    expect(b.settings.aiApiKey).toBe('');
  });

  it('keeps fields it does not know, and ignores values of the wrong type', () => {
    const local = stampLocal(null, settings(), 1000);
    const remote: SyncDoc = {
      ...local,
      fields: { ...local.fields, futureThing: { value: 1, at: 5 }, columns: { value: 3, at: 5 } },
    };
    const merged = mergeDocs(local, remote, 2000);
    expect(merged.fields.futureThing).toEqual({ value: 1, at: 5 });
    expect(applyDoc(settings(), merged).columns).toBe('2');
  });

  it('forgets old tombstones', () => {
    const local = stampLocal(null, settings(), 0);
    const remote: SyncDoc = { ...local, rules: { old: { at: 1, deleted: true }, recent: { at: 200 * DAY, deleted: true } } };
    expect(Object.keys(mergeDocs(local, remote, 200 * DAY).rules)).toEqual(['recent']);
  });
});

/** A WebDAV server in memory: files by path below the user's folder. */
function davServer(files: Record<string, string> = {}, folders = new Set<string>()) {
  const log: string[] = [];
  const send = async (r: HttpRequest) => {
    const path = r.url.replace('https://dav.example/dav/', '');
    log.push(`${r.method} ${path}`);
    if (r.headers.Authorization !== `Basic ${btoa('me:pw')}`) return { status: 401, body: '' };
    const parent = path.replace(/[^/]+\/?$/, '');
    switch (r.method) {
      case 'GET':
        return path in files ? { status: 200, body: files[path]! } : { status: 404, body: '' };
      case 'PUT':
        if (parent && !folders.has(parent)) return { status: 409, body: '' };
        files[path] = r.body!;
        return { status: 201, body: '' };
      case 'MKCOL':
        if (folders.has(path)) return { status: 405, body: '' };
        folders.add(path);
        return { status: 201, body: '' };
      case 'DELETE':
        delete files[path];
        return { status: 204, body: '' };
      default:
        return { status: 400, body: '' };
    }
  };
  return { files, folders, log, send };
}

const config = { url: 'https://dav.example/dav', username: 'me', password: 'pw' };

describe('runSync', () => {
  it('creates the folders and uploads on first use', async () => {
    const server = davServer();
    const local = stampLocal(null, settings({ rules: 'x' }), 1000);
    const { doc, uploaded } = await runSync(server.send, config, local, 1000);
    expect(uploaded).toBe(true);
    expect(server.folders).toEqual(new Set(['BetterSearch/', 'BetterSearch/history/']));
    expect(JSON.parse(server.files['BetterSearch/sync.json']!)).toEqual(doc);
  });

  it('uploads nothing when the remote copy already matches', async () => {
    const server = davServer();
    const local = stampLocal(null, settings(), 1000);
    await runSync(server.send, config, local, 1000);
    server.log.length = 0;
    const { uploaded } = await runSync(server.send, config, local, 2000);
    expect(uploaded).toBe(false);
    expect(server.log).toEqual(['GET BetterSearch/sync.json']);
  });

  it('keeps the replaced version as a backup, at most HISTORY_SIZE of them', async () => {
    const server = davServer();
    let local = stampLocal(null, settings(), 0);
    for (let i = 1; i <= HISTORY_SIZE + 3; i++) {
      local = stampLocal(local, settings({ autoPageLimit: i }), i * 1000);
      local = (await runSync(server.send, config, local, i * 1000)).doc;
    }
    const backups = Object.keys(server.files).filter((f) => f.startsWith('BetterSearch/history/'));
    expect(backups).toHaveLength(HISTORY_SIZE);
    expect(local.history).toEqual(backups.map((f) => f.replace('BetterSearch/', '')).sort());
    const newest = JSON.parse(server.files[`BetterSearch/${local.history!.at(-1)}`]!) as SyncDoc;
    expect(newest.fields.autoPageLimit!.value).toBe(HISTORY_SIZE + 2);
  });

  it('reports a wrong password and a file that is not ours', async () => {
    const server = davServer({ 'BetterSearch/sync.json': '<html>' });
    const local = stampLocal(null, settings(), 0);
    await expect(runSync(server.send, { ...config, password: 'no' }, local, 0)).rejects.toMatchObject({ message: 'auth', status: 401 });
    await expect(runSync(server.send, config, local, 0)).rejects.toBeInstanceOf(SyncError);
  });

  it('encodes a non-ASCII password as UTF-8', async () => {
    const seen: string[] = [];
    const send = async (r: HttpRequest) => (seen.push(r.headers.Authorization!), { status: 404, body: '' });
    await runSync(send, { ...config, password: '密码' }, stampLocal(null, settings(), 0), 0).catch(() => {});
    expect(atob(seen[0]!.slice(6))).toBe(String.fromCharCode(...new TextEncoder().encode('me:密码')));
  });
});
