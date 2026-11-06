import { describe, expect, it } from 'vitest';
import { adapters, autoColumns, planGrid, type EngineAdapter } from '../src';
import { loadFixture } from './fixtures';

const byId = Object.fromEntries(adapters.map((a) => [a.id, a])) as Record<string, EngineAdapter>;

describe('planGrid', () => {
  it.each([
    ['google', 'workbuddy.html'],
    ['google', 'pizza.html'],
    ['google', 'usd-rate.html'],
    ['bing', 'workbuddy.html'],
    ['baidu', 'workbuddy.html'],
  ])('%s %s: every cell holds exactly one block and cells do not nest', (engine, name) => {
    const adapter = byId[engine]!;
    const doc = loadFixture(engine, name);
    const container = adapter.resultsContainer(doc)!;
    const blocks = adapter.collectBlocks(doc);
    const { cells, wrappers } = planGrid(container, blocks);

    expect(cells.size).toBe(blocks.filter((b) => container.contains(b.el)).length);
    const cellList = [...cells.values()];
    for (const cell of cellList) {
      expect(blocks.filter((b) => cell.contains(b.el))).toHaveLength(1);
      expect(cellList.filter((other) => other !== cell && other.contains(cell))).toEqual([]);
      // A cell sits in the container, possibly through flattened wrappers only.
      for (let p = cell.parentElement; p !== container; p = p!.parentElement) expect(wrappers.has(p!)).toBe(true);
    }
  });

  it('flattens the wrapper Google sometimes puts around a group of results', () => {
    const doc = loadFixture('google', 'pizza.html');
    const container = byId.google!.resultsContainer(doc)!;
    const { wrappers } = planGrid(container, byId.google!.collectBlocks(doc));
    expect(wrappers.size).toBeGreaterThan(0);
  });

  it('needs no wrappers when results are direct children', () => {
    const doc = loadFixture('bing', 'workbuddy.html');
    const container = byId.bing!.resultsContainer(doc)!;
    const { cells, wrappers } = planGrid(container, byId.bing!.collectBlocks(doc));
    expect(wrappers.size).toBe(0);
    for (const cell of cells.values()) expect(cell.parentElement).toBe(container);
  });
});

describe('autoColumns', () => {
  it.each([
    [700, 1],
    [913, 2],
    [1400, 3],
  ])('%ipx -> %i', (width, expected) => {
    expect(autoColumns(width)).toBe(expected);
  });
});
