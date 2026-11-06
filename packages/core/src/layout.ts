import type { Block } from './types';

export interface GridPlan {
  /** For each block inside the container, the element that becomes its grid cell. */
  cells: Map<HTMLElement, HTMLElement>;
  /** Wrappers between the container and the cells; laid out with `display: contents`. */
  wrappers: Set<HTMLElement>;
}

/**
 * Work out how to turn `container` into a grid of `blocks`. A block's cell is
 * its highest ancestor below the container that holds no other block, so the
 * engine's markup around one result moves with it. Ancestors that hold several
 * blocks are wrappers and get flattened, which makes the layout independent of
 * how deeply the engine happens to nest its results.
 */
export function planGrid(container: HTMLElement, blocks: Block[]): GridPlan {
  const inside = blocks.filter((b) => b.el !== container && container.contains(b.el));
  const cells = new Map<HTMLElement, HTMLElement>();
  const wrappers = new Set<HTMLElement>();
  const holdsOther = (el: HTMLElement, self: Block) => inside.some((b) => b !== self && el.contains(b.el));

  for (const block of inside) {
    let cell = block.el;
    let parent = cell.parentElement;
    while (parent && parent !== container && !holdsOther(parent, block)) {
      cell = parent;
      parent = cell.parentElement;
    }
    cells.set(block.el, cell);
    for (let w = cell.parentElement; w && w !== container; w = w.parentElement) wrappers.add(w);
  }
  return { cells, wrappers };
}

/** How many columns fit in `width` pixels for the `auto` setting. */
export function autoColumns(width: number): number {
  if (width >= 1320) return 3;
  if (width >= 880) return 2;
  return 1;
}
