import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Block, EngineAdapter } from '../src';

export function loadFixture(engine: string, name: string): Document {
  const html = readFileSync(join(import.meta.dirname, '../../../fixtures', engine, name), 'utf8');
  return new DOMParser().parseFromString(html, 'text/html');
}

/** Compact summary: organic results by host, other blocks by type. */
export function summarize(adapter: EngineAdapter, blocks: Block[]): string[] {
  return blocks.map((b) => (b.type === 'organic' ? `organic:${adapter.extractResult(b)?.host}` : b.type));
}

export function expectNotNested(blocks: Block[]): void {
  for (const a of blocks) {
    for (const b of blocks) {
      if (a !== b && a.el.contains(b.el)) throw new Error('nested blocks');
    }
  }
}
