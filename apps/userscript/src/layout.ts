import { autoColumns, type GridPlan, type Settings } from '@bettersearch/core';

export const LAYOUT_ATTR = 'data-bs-layout';

export const GRID = {
  container: 'bs-grid',
  inline: 'bs-grid-inline',
  wrapper: 'bs-flatten',
  cell: 'bs-cell',
  organic: 'bs-cell-organic',
  wide: 'bs-wide',
  wideParent: 'bs-wide-parent',
  side: 'bs-side',
} as const;

const SIDE_WIDTH = 300;
const SIDE_GAP = 32;
const RIGHT_PADDING = 24;
const MAX_MAIN_WIDTH = 1400;

const root = document.documentElement;

function setVar(name: string, value: string): void {
  if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
}

function isShown(el: HTMLElement | null): el is HTMLElement {
  return !!el && el.getClientRects().length > 0 && !!el.textContent?.trim();
}

/** Turns the results container into a grid and makes room for it. */
export class Grid {
  /** Every element we put a class on, so turning the layout off can undo it. */
  private readonly marked = new Map<HTMLElement, string>();
  private measuredFor: { container: HTMLElement; viewport: number; settings: string } | null = null;

  apply(
    container: HTMLElement | null,
    side: HTMLElement | null,
    plan: GridPlan | null,
    organic: ReadonlySet<HTMLElement>,
    settings: Settings,
  ): void {
    if (!container || !plan || !settings.layout) {
      this.clear();
      return;
    }
    root.setAttribute(LAYOUT_ATTR, '');
    root.dataset.bsStyle = settings.cardStyle;
    root.dataset.bsDensity = settings.density;

    const keep = new Set<HTMLElement>();
    const mark = (el: HTMLElement, cls: string) => {
      el.classList.add(cls);
      this.marked.set(el, cls);
      keep.add(el);
    };
    mark(container, GRID.container);
    for (const wrapper of plan.wrappers) mark(wrapper, GRID.wrapper);
    for (const cell of plan.cells.values()) mark(cell, GRID.cell);
    // Cells hold one block each; organic cells sit in columns, the rest span the row.
    for (const [blockEl, cell] of plan.cells) cell.classList.toggle(GRID.organic, organic.has(blockEl));
    // Engines leave empty placeholder nodes between results. As grid items they
    // would each take a full row and split pairs of results, so flatten them.
    const cells = new Set(plan.cells.values());
    for (const parent of [container, ...plan.wrappers]) {
      for (const child of parent.children) {
        if (child instanceof HTMLElement && !cells.has(child) && !child.classList.contains(GRID.wrapper)) {
          if (child.getBoundingClientRect().height === 0 && !child.className.includes('bs-')) mark(child, GRID.wrapper);
        }
      }
    }
    for (const [el, cls] of this.marked) {
      if (!keep.has(el) && cls !== GRID.wide && cls !== GRID.wideParent && cls !== GRID.side) {
        el.classList.remove(cls, GRID.organic);
        this.marked.delete(el);
      }
    }

    this.measure(container, side, settings);
  }

  /** Re-measure on the next apply, e.g. after a resize. */
  invalidate(): void {
    this.measuredFor = null;
  }

  private measure(container: HTMLElement, side: HTMLElement | null, settings: Settings): void {
    const viewport = root.clientWidth;
    const key = `${settings.columns}`;
    const m = this.measuredFor;
    if (m && m.container === container && m.viewport === viewport && m.settings === key) return;
    this.measuredFor = { container, viewport, settings: key };

    // Measure the engine's own layout: switch ours off for the duration. All of
    // this is synchronous, so the page never paints in between.
    for (const [el, cls] of this.marked) {
      if (cls === GRID.wide || cls === GRID.wideParent || cls === GRID.side) {
        el.classList.remove(cls);
        this.marked.delete(el);
      }
    }
    root.removeAttribute(LAYOUT_ATTR);
    const box = container.getBoundingClientRect();
    // An inline-block results list (Bing) shares a line with the side column;
    // a block-level grid would push the side column below it.
    container.classList.toggle(GRID.inline, getComputedStyle(container).display.startsWith('inline'));
    const hasSide = isShown(side);
    // The container and the ancestors exactly as wide as it set the width.
    const chain: HTMLElement[] = [];
    for (let el: HTMLElement | null = container; el && el !== document.body; el = el.parentElement) {
      if (Math.abs(el.getBoundingClientRect().width - box.width) > 2) break;
      chain.push(el);
    }
    root.setAttribute(LAYOUT_ATTR, '');

    const room = viewport - box.left - RIGHT_PADDING - (hasSide ? SIDE_WIDTH + SIDE_GAP : 0);
    const mainWidth = Math.round(Math.min(MAX_MAIN_WIDTH, Math.max(box.width, room)));
    const columns = settings.columns === 'auto' ? autoColumns(mainWidth) : Number(settings.columns);
    setVar('--bs-main-w', `${mainWidth}px`);
    setVar('--bs-cols', String(columns));
    for (const el of chain) {
      el.classList.add(GRID.wide);
      this.marked.set(el, GRID.wide);
    }
    if (!hasSide) return;

    // A parent holding both columns may be too narrow for the wider results,
    // which would push a floated side column below them.
    const parent = chain[chain.length - 1]?.parentElement;
    if (parent?.contains(side)) {
      const needed = Math.round(box.left + mainWidth + SIDE_GAP + SIDE_WIDTH - parent.getBoundingClientRect().left);
      if (parent.getBoundingClientRect().width < needed) {
        setVar('--bs-parent-w', `${needed}px`);
        parent.classList.add(GRID.wideParent);
        this.marked.set(parent, GRID.wideParent);
      }
    }
    side.classList.add(GRID.side);
    this.marked.set(side, GRID.side);
    setVar('--bs-side-shift', '0px');
    const shift = Math.round(box.left + mainWidth + SIDE_GAP - side.getBoundingClientRect().left);
    setVar('--bs-side-shift', `${shift}px`);
  }

  private clear(): void {
    if (!root.hasAttribute(LAYOUT_ATTR) && !this.marked.size) return;
    root.removeAttribute(LAYOUT_ATTR);
    for (const [el, cls] of this.marked) el.classList.remove(cls, GRID.organic, GRID.inline);
    this.marked.clear();
    this.measuredFor = null;
  }
}

export const LAYOUT_CSS = `
html[${LAYOUT_ATTR}] {
  --bs-gap: 12px;
  --bs-pad: 12px 14px;
  --bs-line: #e3e7ed;
  --bs-card: #ffffff;
}
html[${LAYOUT_ATTR}][data-bs-density='comfortable'] { --bs-gap: 16px; --bs-pad: 16px 18px; }
html[${LAYOUT_ATTR}][data-bs-theme='dark'] { --bs-line: rgba(255, 255, 255, .12); --bs-card: rgba(255, 255, 255, .04); }

html[${LAYOUT_ATTR}] .${GRID.wide} { width: var(--bs-main-w) !important; max-width: none !important; min-width: 0 !important; }
html[${LAYOUT_ATTR}] .${GRID.wideParent} { width: var(--bs-parent-w) !important; max-width: none !important; }
html[${LAYOUT_ATTR}] .${GRID.side} {
  width: ${SIDE_WIDTH}px !important; min-width: 0 !important; max-width: ${SIDE_WIDTH}px !important;
  margin-left: 0 !important; margin-right: 0 !important;
  box-sizing: border-box; transform: translateX(var(--bs-side-shift, 0px));
  vertical-align: top; overflow-x: hidden;
}
html[${LAYOUT_ATTR}] .${GRID.side} * { max-width: 100%; }

html[${LAYOUT_ATTR}] .${GRID.container} {
  display: grid !important;
  grid-template-columns: repeat(var(--bs-cols, 1), minmax(0, 1fr));
  column-gap: var(--bs-gap); row-gap: 0;
  align-items: start;
}
html[${LAYOUT_ATTR}] .${GRID.container}.${GRID.inline} { display: inline-grid !important; vertical-align: top; }
html[${LAYOUT_ATTR}] .${GRID.wrapper} { display: contents !important; }
/* Rows: everything spans the full width except organic results. Row gaps come
   from cell margins, so the engine's empty placeholder nodes add no space. */
html[${LAYOUT_ATTR}] :is(.${GRID.container}, .${GRID.wrapper}) > * { grid-column: 1 / -1; }
html[${LAYOUT_ATTR}] :is(.${GRID.container}, .${GRID.wrapper}) > .${GRID.organic} { grid-column: auto; }
html[${LAYOUT_ATTR}] .${GRID.cell} {
  width: auto !important; max-width: none !important; min-width: 0; margin: 0 0 var(--bs-gap) !important; box-sizing: border-box;
}
html[${LAYOUT_ATTR}] .${GRID.organic} { overflow-wrap: anywhere; }
html[${LAYOUT_ATTR}] .${GRID.organic} * { max-width: 100%; }
html[${LAYOUT_ATTR}][data-bs-style='card'] .${GRID.organic} {
  padding: var(--bs-pad) !important; border: 1px solid var(--bs-line); border-radius: 10px; background: var(--bs-card);
}
html[${LAYOUT_ATTR}][data-bs-style='line'] .${GRID.organic} { padding: 12px 0 !important; border-bottom: 1px solid var(--bs-line); }
html[${LAYOUT_ATTR}] .${GRID.organic} :is(h2, h3) {
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
`;
