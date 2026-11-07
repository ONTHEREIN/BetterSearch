import { gridSize, type GridPlan, type Settings } from '@bettersearch/core';

export const LAYOUT_ATTR = 'data-bs-layout';

export const GRID = {
  container: 'bs-grid',
  inline: 'bs-grid-inline',
  wrapper: 'bs-flatten',
  cell: 'bs-cell',
  organic: 'bs-cell-organic',
  span: 'bs-cell-span',
  noBleed: 'bs-no-bleed',
  empty: 'bs-cell-empty',
  wide: 'bs-wide',
  wideParent: 'bs-wide-parent',
  side: 'bs-side',
  shift: 'bs-shift',
} as const;

/** Classes that depend on the measured room; dropped and set again on each measure. */
const MEASURED: ReadonlySet<string> = new Set([GRID.wide, GRID.wideParent, GRID.side, GRID.shift]);

const SIDE_WIDTH = 300;
const SIDE_GAP = 32;
const RIGHT_PADDING = 24;

/** Looked up on use: at document-start the script can run before <html> exists. */
const root = () => document.documentElement;

/** Elements that never render; flattening them with display: contents would show their source text. */
const NON_RENDERED = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'LINK', 'META', 'NOSCRIPT']);

function setVar(name: string, value: string): void {
  if (root().style.getPropertyValue(name) !== value) root().style.setProperty(name, value);
}

function isShown(el: HTMLElement | null): el is HTMLElement {
  return !!el && el.getClientRects().length > 0 && !!el.textContent?.trim();
}

/**
 * Engines pull some modules into their page gutter with negative side margins
 * (Bing's encyclopedia cards use -20px). Inside a padded card that pushes them
 * past its edge, so cancel those margins. A negative margin matched by equal
 * padding (Bing's captions: -16px and 16px) keeps its content in place and is
 * left alone, or the content would shift inwards.
 */
function preventBleed(cell: HTMLElement): void {
  const bleeds = (margin: string, padding: string) => parseFloat(margin) + parseFloat(padding) < 0;
  for (const el of cell.querySelectorAll<HTMLElement>('div, ul, ol, section')) {
    const style = getComputedStyle(el);
    if (bleeds(style.marginLeft, style.paddingLeft) || bleeds(style.marginRight, style.paddingRight)) {
      el.classList.add(GRID.noBleed);
    }
  }
}

/** Turns the results container into a grid and makes room for it. */
export class Grid {
  /** Every element we put a class on, so turning the layout off can undo it. */
  private readonly marked = new Map<HTMLElement, string>();
  private measuredFor: { container: HTMLElement; viewport: number; settings: string; side: boolean } | null = null;
  /** Results whose content does not fit one column, e.g. sitelinks in two columns. */
  private readonly spanning = new WeakSet<HTMLElement>();
  private readonly bleedChecked = new WeakSet<HTMLElement>();

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
    root().setAttribute(LAYOUT_ATTR, '');
    root().dataset.bsStyle = settings.cardStyle;
    root().dataset.bsDensity = settings.density;

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
    // An empty module cell (nothing rendered yet, or hidden by the engine) would
    // take a full row too and split the results around it.
    const range = document.createRange();
    for (const [blockEl, cell] of plan.cells) {
      if (organic.has(blockEl) || cell.classList.contains('bs-ad')) continue;
      // Measured through its contents, text included (our page dividers hold
      // only text): a flattened cell has no box of its own, and must come back
      // once the engine fills it.
      range.selectNodeContents(cell);
      const rendered = range.getBoundingClientRect().height > 0;
      cell.classList.toggle(GRID.empty, !rendered && !cell.querySelector('img, video, iframe'));
    }
    for (const parent of [container, ...plan.wrappers]) {
      for (const child of parent.children) {
        if (NON_RENDERED.has(child.tagName) || !(child instanceof HTMLElement) || cells.has(child)) continue;
        // Re-mark placeholders flattened on an earlier pass too: unmarked
        // elements are cleaned up below, which would un-flatten them every
        // other pass. A flattened placeholder has no box, so it still reads 0.
        const ours = [...child.classList].some((c) => c.startsWith('bs-') && c !== GRID.wrapper);
        if (!ours && child.getBoundingClientRect().height === 0) mark(child, GRID.wrapper);
      }
    }
    for (const [el, cls] of this.marked) {
      if (!keep.has(el) && !MEASURED.has(cls)) {
        el.classList.remove(cls, GRID.organic);
        this.marked.delete(el);
      }
    }

    this.measure(container, side, settings);

    // Some results carry fixed-width content wider than a column. Give those a
    // full row; once given, keep it so the cell does not flip back and forth.
    for (const cell of plan.cells.values()) {
      if (!cell.classList.contains(GRID.organic)) continue;
      if (!this.spanning.has(cell) && cell.scrollWidth > cell.clientWidth + 4) this.spanning.add(cell);
      cell.classList.toggle(GRID.span, this.spanning.has(cell));
      if (!this.bleedChecked.has(cell)) {
        this.bleedChecked.add(cell);
        preventBleed(cell);
      }
    }
  }

  /** Re-measure on the next apply, e.g. after a resize. */
  invalidate(): void {
    this.measuredFor = null;
  }

  private measure(container: HTMLElement, side: HTMLElement | null, settings: Settings): void {
    const viewport = root().clientWidth;
    const key = `${settings.columns}`;
    // The side column often renders after the results; its arrival changes the room.
    const sidePresent = isShown(side);
    const m = this.measuredFor;
    if (m && m.container === container && m.viewport === viewport && m.settings === key && m.side === sidePresent) return;
    this.measuredFor = { container, viewport, settings: key, side: sidePresent };

    // Measure the engine's own layout: switch ours off for the duration. All of
    // this is synchronous, so the page never paints in between.
    for (const [el, cls] of this.marked) {
      if (MEASURED.has(cls)) {
        el.classList.remove(cls);
        this.marked.delete(el);
      }
    }
    root().removeAttribute(LAYOUT_ATTR);
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
    root().setAttribute(LAYOUT_ATTR, '');

    const room = viewport - box.left - RIGHT_PADDING - (hasSide ? SIDE_WIDTH + SIDE_GAP : 0);
    const { columns, width: mainWidth } = gridSize(settings.columns, room, box.width);
    setVar('--bs-main-w', `${mainWidth}px`);
    setVar('--bs-cols', String(columns));
    for (const el of chain) {
      el.classList.add(GRID.wide);
      this.marked.set(el, GRID.wide);
    }

    // A parent holding both columns may be too narrow for the wider results,
    // which would push a floated side column below them.
    const parent = chain[chain.length - 1]?.parentElement;
    if (hasSide && parent?.contains(side)) {
      const needed = Math.round(box.left + mainWidth + SIDE_GAP + SIDE_WIDTH - parent.getBoundingClientRect().left);
      if (parent.getBoundingClientRect().width < needed) {
        setVar('--bs-parent-w', `${needed}px`);
        parent.classList.add(GRID.wideParent);
        this.marked.set(parent, GRID.wideParent);
      }
    }
    if (hasSide) {
      side.classList.add(GRID.side);
      this.marked.set(side, GRID.side);
    }

    // Centre the results and the side column together. Engines align the
    // results with their logo, which leaves the widened page lopsided. Measured
    // after widening: a parent centred with auto margins (Baidu on wide
    // screens) moves everything when it gets wider.
    const total = mainWidth + (hasSide ? SIDE_GAP + SIDE_WIDTH : 0);
    const left = Math.round(Math.max(RIGHT_PADDING, (viewport - total) / 2));
    setVar('--bs-main-shift', '0px');
    setVar('--bs-side-shift', '0px');
    const outer = chain[chain.length - 1];
    if (outer) {
      outer.classList.add(GRID.shift);
      this.marked.set(outer, GRID.shift);
    }
    setVar('--bs-main-shift', `${left - Math.round(container.getBoundingClientRect().left)}px`);
    if (hasSide) setVar('--bs-side-shift', `${left + mainWidth + SIDE_GAP - Math.round(side.getBoundingClientRect().left)}px`);
  }

  private clear(): void {
    if (!root().hasAttribute(LAYOUT_ATTR) && !this.marked.size) return;
    root().removeAttribute(LAYOUT_ATTR);
    for (const [el, cls] of this.marked) el.classList.remove(cls, GRID.organic, GRID.inline, GRID.span, GRID.empty);
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
html[${LAYOUT_ATTR}][data-bs-style='raised'] {
  --bs-card: #f6f8fb; --bs-shadow: 0 1px 2px rgba(16, 24, 40, .06), 0 1px 3px rgba(16, 24, 40, .08);
  --bs-shadow-hover: 0 4px 12px rgba(16, 24, 40, .12);
}
html[${LAYOUT_ATTR}][data-bs-style='raised'][data-bs-theme='dark'] {
  --bs-card: rgba(255, 255, 255, .06); --bs-shadow: none; --bs-shadow-hover: 0 0 0 1px rgba(255, 255, 255, .16);
}

html[${LAYOUT_ATTR}] .${GRID.wide} { width: var(--bs-main-w) !important; max-width: none !important; min-width: 0 !important; }
html[${LAYOUT_ATTR}] .${GRID.shift} { transform: translateX(var(--bs-main-shift, 0px)); }
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
/* Out of the grid flow so it takes no slot, but still laid out, so we can see
   when the engine fills it and bring it back. */
html[${LAYOUT_ATTR}] .${GRID.empty} { position: absolute !important; width: 1px; pointer-events: none; }
html[${LAYOUT_ATTR}] :is(script, style, template, link, noscript).${GRID.wrapper} { display: none !important; }
/* Rows: everything spans the full width except organic results. Row gaps come
   from cell margins, so the engine's empty placeholder nodes add no space. */
html[${LAYOUT_ATTR}] :is(.${GRID.container}, .${GRID.wrapper}) > * { grid-column: 1 / -1; }
html[${LAYOUT_ATTR}] :is(.${GRID.container}, .${GRID.wrapper}) > .${GRID.organic} { grid-column: auto; }
html[${LAYOUT_ATTR}] :is(.${GRID.container}, .${GRID.wrapper}) > .${GRID.organic}.${GRID.span} { grid-column: 1 / -1; }
html[${LAYOUT_ATTR}] .${GRID.cell} {
  width: auto !important; max-width: none !important; min-width: 0; margin: 0 0 var(--bs-gap) !important; box-sizing: border-box;
}
/* Cards in a row share its height so their edges line up; spanning modules keep their own. */
html[${LAYOUT_ATTR}] .${GRID.organic} { overflow-wrap: anywhere; align-self: stretch; }
/* The card's padding is the only space below the content: drop the engine's own. */
html[${LAYOUT_ATTR}] .${GRID.organic} > :last-child,
html[${LAYOUT_ATTR}] .${GRID.organic} > :last-child > :last-child { margin-bottom: 0 !important; padding-bottom: 0 !important; }
/* Only media is capped. Capping every element would also squeeze carousel
   tracks, which are meant to be wider than the card, into stacked slides;
   content that really does not fit makes the cell span the row instead. */
html[${LAYOUT_ATTR}] .${GRID.organic} :is(img, video) { max-width: 100%; height: auto; }
/* Engines give the URL line a fixed one-line height; wrapping would overlap the title. */
html[${LAYOUT_ATTR}] .${GRID.organic} :has(> cite) { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
html[${LAYOUT_ATTR}][data-bs-style='card'] .${GRID.organic} {
  padding: var(--bs-pad) !important; border: 1px solid var(--bs-line); border-radius: 10px; background: var(--bs-card);
}
html[${LAYOUT_ATTR}][data-bs-style='raised'] .${GRID.organic} {
  padding: var(--bs-pad) !important; border-radius: 12px; background: var(--bs-card); box-shadow: var(--bs-shadow);
  transition: box-shadow .15s;
}
html[${LAYOUT_ATTR}][data-bs-style='raised'] .${GRID.organic}:hover { box-shadow: var(--bs-shadow-hover); }
html[${LAYOUT_ATTR}][data-bs-style='line'] .${GRID.organic} { padding: 12px 0 !important; border-bottom: 1px solid var(--bs-line); }
html[${LAYOUT_ATTR}] .${GRID.organic} .${GRID.noBleed} { margin-left: 0 !important; margin-right: 0 !important; }
html[${LAYOUT_ATTR}] .${GRID.organic} :is(h2, h3) {
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
`;
