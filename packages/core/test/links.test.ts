import { describe, expect, it } from 'vitest';
import { stripTracking } from '../src';

describe('stripTracking', () => {
  it.each([
    ['https://a.com/p?utm_source=x&utm_medium=y&id=3', 'https://a.com/p?id=3'],
    ['https://a.com/p?spm=1.2&gclid=abc', 'https://a.com/p'],
    ['https://a.com/p?from=home&ref=nav', 'https://a.com/p?from=home&ref=nav'],
    ['https://a.com/p', 'https://a.com/p'],
    ['/relative?utm_source=x', '/relative?utm_source=x'],
  ])('%s -> %s', (input, expected) => {
    expect(stripTracking(input)).toBe(expected);
  });
});
