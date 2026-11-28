import { blankPixels } from './frames';
import { plot, type Clip, type Pixels, type RGBA } from './pixelEdit';

/**
 * The texture editor's layers, shapes, selections and colour replacing, on raw RGBA so they run in
 * tests. Layers only live while the editor is open: saving merges them into the one image Minecraft
 * reads.
 */

export interface PaintLayer {
  id: number;
  name: string;
  px: Pixels;
  visible: boolean;
  /** 0…100 */
  opacity: number;
}

/** A rectangle in sheet pixels; `w` and `h` are at least 1. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The rectangle spanned by two corner pixels (both included), clipped to `bounds`. */
export function rectBetween(a: [number, number], b: [number, number], bounds?: Rect): Rect | undefined {
  let x0 = Math.min(a[0], b[0]);
  let y0 = Math.min(a[1], b[1]);
  let x1 = Math.max(a[0], b[0]) + 1;
  let y1 = Math.max(a[1], b[1]) + 1;
  if (bounds) {
    x0 = Math.max(x0, bounds.x);
    y0 = Math.max(y0, bounds.y);
    x1 = Math.min(x1, bounds.x + bounds.w);
    y1 = Math.min(y1, bounds.y + bounds.h);
  }
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : undefined;
}

/** Puts `top` over `bottom` the way the game blends a translucent pixel (straight alpha). */
function over(d: Uint8ClampedArray, i: number, r: number, g: number, b: number, a: number): void {
  if (a <= 0) return;
  const da = d[i + 3] / 255;
  if (a >= 1 || da === 0) {
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
    d[i + 3] = Math.round(a * 255);
    return;
  }
  const oa = a + da * (1 - a);
  d[i] = (r * a + d[i] * da * (1 - a)) / oa;
  d[i + 1] = (g * a + d[i + 1] * da * (1 - a)) / oa;
  d[i + 2] = (b * a + d[i + 2] * da * (1 - a)) / oa;
  d[i + 3] = Math.round(oa * 255);
}

/**
 * The picture all visible layers make, bottom layer first. A single visible, fully opaque layer is
 * returned as it is (no copy), so an editor without extra layers costs nothing.
 */
export function flatten(layers: readonly PaintLayer[], width: number, height: number): Pixels {
  const shown = layers.filter((l) => l.visible && l.opacity > 0);
  if (shown.length === 1 && shown[0].opacity >= 100 && shown[0].px.width === width && shown[0].px.height === height) return shown[0].px;
  const out = blankPixels(width, height);
  for (const l of shown) {
    const s = l.px.data;
    const k = l.opacity / 100;
    for (let i = 0; i < out.data.length && i < s.length; i += 4) over(out.data, i, s[i], s[i + 1], s[i + 2], (s[i + 3] / 255) * k);
  }
  return out;
}

/** Draws `top` (at its opacity) onto `bottom`, as "merge down" does. */
export function mergeInto(bottom: Pixels, top: Pixels, opacity = 100): void {
  const s = top.data;
  for (let i = 0; i < bottom.data.length && i < s.length; i += 4) over(bottom.data, i, s[i], s[i + 1], s[i + 2], (s[i + 3] / 255) * (opacity / 100));
}

/** A rectangle outline (or a filled one) between two corner pixels, `size` px thick. */
export function drawRect(p: Pixels, a: [number, number], b: [number, number], c: RGBA, filled = false, size = 1, clip?: Clip): void {
  const r = rectBetween(a, b);
  if (!r) return;
  for (let y = r.y; y < r.y + r.h; y++)
    for (let x = r.x; x < r.x + r.w; x++) {
      const edge = x - r.x < size || r.x + r.w - 1 - x < size || y - r.y < size || r.y + r.h - 1 - y < size;
      if (filled || edge) plot(p, x, y, c, clip);
    }
}

/** Snaps the end of a line to the nearest 45° direction, or a rectangle's corner to a square. */
export function constrain(a: [number, number], b: [number, number], square = false): [number, number] {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (square) {
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    return [a[0] + Math.sign(dx || 1) * d, a[1] + Math.sign(dy || 1) * d];
  }
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.max(Math.abs(dx), Math.abs(dy));
  // pixel diagonals go one step across per step down, so both sides get the full length
  return [a[0] + Math.round(Math.cos(angle)) * len, a[1] + Math.round(Math.sin(angle)) * len];
}

/** A copy of the pixels inside `r`. */
export function copyRect(p: Pixels, r: Rect): Pixels {
  const out = blankPixels(r.w, r.h);
  for (let y = 0; y < r.h; y++) {
    const sy = r.y + y;
    if (sy < 0 || sy >= p.height) continue;
    for (let x = 0; x < r.w; x++) {
      const sx = r.x + x;
      if (sx < 0 || sx >= p.width) continue;
      out.data.set(p.data.subarray((sy * p.width + sx) * 4, (sy * p.width + sx) * 4 + 4), (y * r.w + x) * 4);
    }
  }
  return out;
}

/** Writes `piece` at (x, y), replacing what's there (transparent pixels too). */
export function putRect(p: Pixels, piece: Pixels, x: number, y: number): void {
  for (let py = 0; py < piece.height; py++) {
    const ty = y + py;
    if (ty < 0 || ty >= p.height) continue;
    for (let px = 0; px < piece.width; px++) {
      const tx = x + px;
      if (tx < 0 || tx >= p.width) continue;
      p.data.set(piece.data.subarray((py * piece.width + px) * 4, (py * piece.width + px) * 4 + 4), (ty * p.width + tx) * 4);
    }
  }
}

/** The part both rectangles cover. */
export function intersect(a: Rect, b: Rect): Rect | undefined {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : undefined;
}

/** Makes the pixels inside `r` transparent. */
export function clearRect(p: Pixels, r: Rect): void {
  for (let y = Math.max(0, r.y); y < Math.min(p.height, r.y + r.h); y++) p.data.fill(0, (y * p.width + Math.max(0, r.x)) * 4, (y * p.width + Math.min(p.width, r.x + r.w)) * 4);
}

/**
 * Puts `piece` at (x, y), over what's there; parts outside `clip` (the frame being edited) are left
 * out. Transparent pixels of the piece let the picture below show through.
 */
export function paste(p: Pixels, piece: Pixels, x: number, y: number, clip?: Rect): void {
  const c = clip ?? { x: 0, y: 0, w: p.width, h: p.height };
  for (let py = 0; py < piece.height; py++) {
    const ty = y + py;
    if (ty < c.y || ty >= c.y + c.h || ty < 0 || ty >= p.height) continue;
    for (let px = 0; px < piece.width; px++) {
      const tx = x + px;
      if (tx < c.x || tx >= c.x + c.w || tx < 0 || tx >= p.width) continue;
      const s = (py * piece.width + px) * 4;
      over(p.data, (ty * p.width + tx) * 4, piece.data[s], piece.data[s + 1], piece.data[s + 2], piece.data[s + 3] / 255);
    }
  }
}

/** Puts back the pixels inside `r` from `before` (a copy of the whole image), e.g. to redraw a shape being dragged. */
export function restoreRect(p: Pixels, before: Uint8ClampedArray, r: Rect): void {
  const x0 = Math.max(0, r.x);
  const x1 = Math.min(p.width, r.x + r.w);
  if (x1 <= x0) return;
  for (let y = Math.max(0, r.y); y < Math.min(p.height, r.y + r.h); y++) {
    const a = (y * p.width + x0) * 4;
    p.data.set(before.subarray(a, a + (x1 - x0) * 4), a);
  }
}

/** The pixels a line or rectangle between two points can touch, with a `size` px brush. */
export function shapeBounds(a: [number, number], b: [number, number], size = 1): Rect {
  const off = Math.floor((size - 1) / 2);
  return { x: Math.min(a[0], b[0]) - off, y: Math.min(a[1], b[1]) - off, w: Math.abs(a[0] - b[0]) + size, h: Math.abs(a[1] - b[1]) + size };
}

/** A mask (1 = inside) for a rectangle, to limit a colour adjustment. */
export function rectMask(width: number, height: number, r: Rect): Uint8Array {
  const m = new Uint8Array(width * height);
  for (let y = Math.max(0, r.y); y < Math.min(height, r.y + r.h); y++) m.fill(1, y * width + Math.max(0, r.x), y * width + Math.min(width, r.x + r.w));
  return m;
}

const near = (d: Uint8ClampedArray, i: number, c: RGBA, tol: number) =>
  (d[i + 3] === 0 && c[3] === 0) ||
  (Math.abs(d[i] - c[0]) <= tol && Math.abs(d[i + 1] - c[1]) <= tol && Math.abs(d[i + 2] - c[2]) <= tol && Math.abs(d[i + 3] - c[3]) <= tol);

/**
 * Recolours every pixel of colour `from` (within `tolerance` per channel) to `to`; returns how many
 * changed. Pixels that were only close to `from` keep their distance from it, so shading survives.
 * `mask` limits it to some pixels.
 */
export function replaceColor(p: Pixels, from: RGBA, to: RGBA, tolerance = 0, mask?: Uint8Array): number {
  const d = p.data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (mask && !mask[i / 4]) continue;
    if (!near(d, i, from, tolerance)) continue;
    const next = [0, 1, 2, 3].map((k) => (d[i + 3] === 0 && from[3] === 0 ? to[k] : to[k] + (d[i + k] - from[k])));
    if (next.every((v, k) => d[i + k] === Math.max(0, Math.min(255, v)))) continue;
    d.set(next, i);
    n++;
  }
  return n;
}

/** How many pixels have colour `c` (within `tolerance`). */
export function countColor(p: Pixels, c: RGBA, tolerance = 0): number {
  let n = 0;
  for (let i = 0; i < p.data.length; i += 4) if (near(p.data, i, c, tolerance)) n++;
  return n;
}
