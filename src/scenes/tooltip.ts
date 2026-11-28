import type { AssetStore } from '../assets/AssetStore';

/**
 * Item tooltips as the game draws them (1.21.2+): a background and a frame sprite, both stretched
 * or nine-sliced over the text plus 3 px padding and 9 px margin. Items can pick another pair with
 * the `tooltip_style` component: `<ns>:<name>` reads `<ns>:tooltip/<name>_background` and `_frame`.
 */

export const PADDING = 3;
export const MARGIN = 9;
/** A text line's height; the first line has 2 px more below it. */
export const LINE = 10;

const STYLE = /^assets\/([^/]+)\/textures\/gui\/sprites\/tooltip\/(.+)_background\.png$/;

/** Tooltip styles the pack (or the game) has sprites for, besides the default one. */
export function tooltipStyles(store: AssetStore): string[] {
  const out: string[] = [];
  for (const p of store.list('assets/')) {
    const m = STYLE.exec(p);
    if (m) out.push(`${m[1]}:${m[2]}`);
  }
  return out.sort();
}

/** The background and frame sprite (texture ids) of a style; no style is the default look. */
export function tooltipSprites(style?: string): { background: string; frame: string } {
  if (!style) return { background: 'minecraft:gui/sprites/tooltip/background', frame: 'minecraft:gui/sprites/tooltip/frame' };
  const [ns, name] = style.includes(':') ? style.split(':') : ['minecraft', style];
  return { background: `${ns}:gui/sprites/tooltip/${name}_background`, frame: `${ns}:gui/sprites/tooltip/${name}_frame` };
}

export interface TooltipLayout {
  /** The text area. */
  width: number;
  height: number;
  /** Top of each line, from the text area's top. */
  lineY: number[];
  /** Where the sprites go, relative to the text area's top left. */
  box: { x: number; y: number; w: number; h: number };
}

/** Sizes and positions for lines of the given widths. */
export function tooltipLayout(lineWidths: number[]): TooltipLayout {
  const width = Math.max(0, ...lineWidths);
  const n = lineWidths.length;
  const height = (n === 1 ? -2 : 0) + n * LINE;
  const lineY = lineWidths.map((_, i) => i * LINE + (i > 0 ? 2 : 0));
  const out = PADDING + MARGIN;
  return { width, height, lineY, box: { x: -out, y: -out, w: width + 2 * out, h: height + 2 * out } };
}

/** Colours of an item name by rarity, as § codes would give them. */
export const RARITY = { common: '#ffffff', uncommon: '#ffff55', rare: '#55ffff', epic: '#ff55ff' } as const;
export type Rarity = keyof typeof RARITY;
