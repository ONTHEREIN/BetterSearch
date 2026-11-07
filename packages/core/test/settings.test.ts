import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, migrateSettings, SETTINGS_VERSION, type KeyValueStore } from '../src';

const storeWith = (value: unknown): KeyValueStore => ({ get: <T>(_: string, fallback: T) => (value ?? fallback) as T, set: () => {} });

describe('settings', () => {
  it('uses the defaults when nothing is stored', () => {
    expect(loadSettings(storeWith(null))).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.columns).toBe('2');
  });

  it('moves v1 "auto" columns to the two-column default', () => {
    expect(migrateSettings({ columns: 'auto' })).toEqual({ columns: '2', version: SETTINGS_VERSION });
    expect(loadSettings(storeWith({ columns: 'auto', rules: 'a.com' }))).toMatchObject({ columns: '2', rules: 'a.com' });
  });

  it('keeps choices made under the current version', () => {
    expect(migrateSettings({ version: 2, columns: 'auto' }).columns).toBe('auto');
    expect(migrateSettings({ columns: '3' }).columns).toBe('3');
  });
});
