import { hslToRgb, rgbToHsl } from '../funny/colorize';

/**
 * Pixel editing on raw RGBA (ImageData-compatible, so it runs in tests without a canvas). All
 * operations change `img` in place; the editor copies the image before each step for undo.
 */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type RGBA = [number, number, number, number];

export const copyPixels = (p: Pixels): Pixels => ({ width: p.width, height: p.height, data: p.data.slice() });

export function getPixel(p: Pixels, x: number, y: number): RGBA {
  const i = (y * p.width + x) * 4;
  return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]];
}

export function setPixel(p: Pixels, x: number, y: number, c: RGBA): void {
  if (x < 0 || y < 0 || x >= p.width || y >= p.height) return;
  p.data.set(c, (y * p.width + x) * 4);
}

/** Draws a square brush of `size` px at every point of the line from (x0,y0) to (x1,y1). */
export function drawLine(p: Pixels, x0: number, y0: number, x1: number, y1: number, c: RGBA, size = 1): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const off = Math.floor((size - 1) / 2);
  for (;;) {
    for (let by = 0; by < size; by++) for (let bx = 0; bx < size; bx++) setPixel(p, x0 - off + bx, y0 - off + by, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

const close = (p: Pixels, i: number, c: RGBA, tol: number) =>
  // fully transparent pixels count as equal, whatever colour they hide
  (p.data[i + 3] === 0 && c[3] === 0) ||
  (Math.abs(p.data[i] - c[0]) <= tol && Math.abs(p.data[i + 1] - c[1]) <= tol && Math.abs(p.data[i + 2] - c[2]) <= tol && Math.abs(p.data[i + 3] - c[3]) <= tol);

/**
 * Bucket fill from (x, y). `contiguous` false recolours every matching pixel of the image.
 * `bounds` keeps a contiguous fill inside one frame of an animated texture.
 */
export function floodFill(p: Pixels, x: number, y: number, c: RGBA, contiguous = true, tolerance = 0, bounds?: { y0: number; y1: number }): number {
  if (x < 0 || y < 0 || x >= p.width || y >= p.height) return 0;
  const target = getPixel(p, x, y);
  if (target.every((v, k) => v === c[k])) return 0;
  let n = 0;
  if (!contiguous) {
    for (let i = 0; i < p.data.length; i += 4)
      if (close(p, i, target, tolerance)) {
        p.data.set(c, i);
        n++;
      }
    return n;
  }
  const y0 = bounds?.y0 ?? 0;
  const y1 = bounds?.y1 ?? p.height;
  const seen = new Uint8Array(p.width * p.height);
  const stack = [y * p.width + x];
  while (stack.length) {
    const k = stack.pop()!;
    if (seen[k]) continue;
    seen[k] = 1;
    if (!close(p, k * 4, target, tolerance)) continue;
    p.data.set(c, k * 4);
    n++;
    const px = k % p.width;
    const py = (k - px) / p.width;
    if (px > 0) stack.push(k - 1);
    if (px < p.width - 1) stack.push(k + 1);
    if (py > y0) stack.push(k - p.width);
    if (py < y1 - 1) stack.push(k + p.width);
  }
  return n;
}

/** Mirrors every frame (`frameHeight` rows each) left–right or top–bottom. */
export function flip(p: Pixels, axis: 'h' | 'v', frameHeight = p.height): void {
  const src = p.data.slice();
  const { width: w, height: h } = p;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const f = Math.floor(y / frameHeight) * frameHeight;
      const sx = axis === 'h' ? w - 1 - x : x;
      const sy = axis === 'v' ? f + (frameHeight - 1 - (y - f)) : y;
      p.data.set(src.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 4), (y * w + x) * 4);
    }
}

/** Rotates every square frame by 90° clockwise (or counter-clockwise). */
export function rotate(p: Pixels, clockwise = true, frameHeight = p.height): boolean {
  const w = p.width;
  if (frameHeight !== w) return false;
  const src = p.data.slice();
  for (let f = 0; f < p.height; f += w)
    for (let y = 0; y < w; y++)
      for (let x = 0; x < w; x++) {
        const [sx, sy] = clockwise ? [y, w - 1 - x] : [w - 1 - y, x];
        p.data.set(src.subarray(((f + sy) * w + sx) * 4, ((f + sy) * w + sx) * 4 + 4), ((f + y) * w + x) * 4);
      }
  return true;
}

/** Moves every frame's content by (dx, dy), wrapping around – handy for seamless block textures. */
export function shift(p: Pixels, dx: number, dy: number, frameHeight = p.height): void {
  const src = p.data.slice();
  const { width: w, height: h } = p;
  const mod = (a: number, m: number) => ((a % m) + m) % m;
  for (let y = 0; y < h; y++) {
    const f = Math.floor(y / frameHeight) * frameHeight;
    const sy = f + mod(y - f - dy, frameHeight);
    for (let x = 0; x < w; x++) {
      const sx = mod(x - dx, w);
      p.data.set(src.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 4), (y * w + x) * 4);
    }
  }
}

/**
 * Shifts hue (−180…180°), saturation and lightness (−100…100 %) of every visible pixel.
 * `mask` limits the change to pixels where it is non-zero.
 */
export function adjustHsl(p: Pixels, hue: number, sat: number, light: number, mask?: Uint8Array): void {
  const d = p.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0 || (mask && !mask[i / 4])) continue;
    let [h, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
    h += hue / 360;
    s = sat >= 0 ? s + (1 - s) * (sat / 100) : s * (1 + sat / 100);
    l = light >= 0 ? l + (1 - l) * (light / 100) : l * (1 + light / 100);
    const [r, g, b] = hslToRgb(h, s, l);
    d[i] = r;
    d[i + 1] = g;
    d[i + 2] = b;
  }
}

export function grayscale(p: Pixels): void {
  const d = p.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = v;
  }
}

export function invert(p: Pixels): void {
  const d = p.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
}

/** The image's colours, most frequent first (transparent pixels left out). */
export function usedColors(p: Pixels, limit = 32): RGBA[] {
  const counts = new Map<number, number>();
  const view = new Uint32Array(p.data.buffer, p.data.byteOffset, p.data.length / 4);
  for (let i = 0; i < view.length; i++) if (p.data[i * 4 + 3] !== 0) counts.set(view[i], (counts.get(view[i]) ?? 0) + 1);
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([v]) => {
      const b = new Uint8Array(new Uint32Array([v]).buffer);
      return [b[0], b[1], b[2], b[3]];
    });
}

export const toHex = ([r, g, b]: RGBA | [number, number, number]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
export const fromHex = (hex: string, alpha = 255): RGBA => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, alpha];
};
