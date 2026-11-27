import type { Pixels } from '../../render/pixelEdit';
import { blankPixels } from '../../render/frames';

/**
 * Replays Mojang's slicer (https://github.com/Mojang/slicer, MIT licence) on pack textures: it cuts
 * old combined textures (widgets.png, icons.png, particles.png, map_icons.png, bed and sign
 * textures …) into the separate sprites newer versions read. The steps come from slices.json,
 * written by scripts/update-gui-slices.mjs. Sizes are scaled the slicer's way, so 2× or 4× packs
 * are cut at the same places.
 */

/** x, y, w, h in a texture of totalW × totalH. */
export type SliceBox = [x: number, y: number, w: number, h: number, totalW: number, totalH: number];
export type SliceOp = [name: string, ...args: number[]];

export interface SlicePart {
  box: SliceBox;
  ops: SliceOp[];
  at: [number, number];
}

export interface SliceOutput {
  path: string;
  /** A single cut-out … */
  box?: SliceBox;
  /** … or an image of `size` put together from parts. */
  size?: [number, number];
  parts?: SlicePart[];
  ops: SliceOp[];
  /** .mcmeta the slicer writes beside the output (when the input has none to copy). */
  meta?: unknown;
}

export interface SliceInput {
  input: string;
  outputs: SliceOutput[];
}

export interface SliceFile {
  stages: Record<string, SliceInput[]>;
}

/** Game version of each slicer step → the resource pack format that version brought. */
export const SLICE_FORMATS: Record<string, number> = { '1.14': 4, '1.20.2': 18, '1.20.5': 32, '26.2': 88 };

// the slicer works with Java's integer division
const sx = (b: SliceBox, w: number) => Math.floor((b[0] * w) / b[4]);
const sy = (b: SliceBox, h: number) => Math.floor((b[1] * h) / b[5]);
const sw = (b: SliceBox, w: number) => Math.floor((b[2] * w) / b[4]);
const sh = (b: SliceBox, h: number) => Math.floor((b[3] * h) / b[5]);

/** The output covers the whole input unchanged (a plain move). */
export const isWholeCopy = (o: SliceOutput) => !!o.box && o.box[0] === 0 && o.box[1] === 0 && o.box[2] === o.box[4] && o.box[3] === o.box[5] && !o.ops.length;

function crop(p: Pixels, x: number, y: number, w: number, h: number): Pixels {
  const out = blankPixels(w, h);
  for (let row = 0; row < h; row++) {
    const sy0 = y + row;
    if (sy0 < 0 || sy0 >= p.height) continue;
    for (let col = 0; col < w; col++) {
      const sx0 = x + col;
      if (sx0 < 0 || sx0 >= p.width) continue;
      const s = (sy0 * p.width + sx0) * 4;
      out.data.set(p.data.subarray(s, s + 4), (row * w + col) * 4);
    }
  }
  return out;
}

/** Draws `src` onto `dst` at (x, y), blending like Java2D's default SrcOver. */
function draw(dst: Pixels, src: Pixels, x: number, y: number) {
  for (let row = 0; row < src.height; row++) {
    const ty = y + row;
    if (ty < 0 || ty >= dst.height) continue;
    for (let col = 0; col < src.width; col++) {
      const tx = x + col;
      if (tx < 0 || tx >= dst.width) continue;
      const s = (row * src.width + col) * 4;
      const d = (ty * dst.width + tx) * 4;
      const sa = src.data[s + 3] / 255;
      if (sa === 0) continue;
      const da = dst.data[d + 3] / 255;
      const a = sa + da * (1 - sa);
      for (let c = 0; c < 3; c++) dst.data[d + c] = Math.round((src.data[s + c] * sa + dst.data[d + c] * da * (1 - sa)) / a);
      dst.data[d + 3] = Math.round(a * 255);
    }
  }
}

/** A new image where pixel (x, y) of `p` lands at `to(x, y)`. */
function remap(p: Pixels, w: number, h: number, to: (x: number, y: number) => [number, number]): Pixels {
  const out = blankPixels(w, h);
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const [tx, ty] = to(x, y);
      const s = (y * p.width + x) * 4;
      out.data.set(p.data.subarray(s, s + 4), (ty * w + tx) * 4);
    }
  }
  return out;
}

export function applySliceOp(p: Pixels, [name, ...a]: SliceOp): Pixels {
  const { width: w, height: h } = p;
  switch (name) {
    case 'rotate90': // clockwise
      return remap(p, h, w, (x, y) => [h - 1 - y, x]);
    case 'rotate180':
      return remap(p, w, h, (x, y) => [w - 1 - x, h - 1 - y]);
    case 'rotate270':
      return remap(p, h, w, (x, y) => [y, w - 1 - x]);
    case 'mirrorVertically':
      return remap(p, w, h, (x, y) => [x, h - 1 - y]);
    case 'mirrorHorizontally':
      return remap(p, w, h, (x, y) => [w - 1 - x, y]);
    case 'square': {
      const dim = Math.max(w, h);
      const out = blankPixels(dim, dim);
      draw(out, p, Math.floor((dim - w) / 2), Math.floor((dim - h) / 2));
      return out;
    }
    case 'flipFrameAxis': {
      // frames side by side → frames on top of each other
      const n = a[0];
      const fw = Math.floor(w / n);
      const out = blankPixels(fw, h * n);
      for (let f = 0; f < n; f++) draw(out, crop(p, f * fw, 0, fw, h), 0, f * h);
      return out;
    }
    case 'extend': {
      const [srcW, srcH, tx, ty, tw, th] = a;
      const out = blankPixels(Math.floor((tw * w) / srcW), Math.floor((th * h) / srcH));
      draw(out, p, Math.floor((tx * w) / srcW), Math.floor((ty * h) / srcH));
      return out;
    }
    case 'clip': {
      // keeps only the box, the rest becomes transparent
      const box = a as unknown as SliceBox;
      const out = blankPixels(w, h);
      const x = sx(box, w);
      const y = sy(box, h);
      draw(out, crop(p, x, y, sw(box, w), sh(box, h)), x, y);
      return out;
    }
  }
  throw new Error(`Unknown slicer operation ${name}`);
}

/** The image the slicer writes for `out`, cut from the input image. */
export function sliceImage(input: Pixels, out: SliceOutput): Pixels {
  const { width: w, height: h } = input;
  let img: Pixels;
  if (out.box) {
    img = crop(input, sx(out.box, w), sy(out.box, h), sw(out.box, w), sh(out.box, h));
  } else {
    const first = out.parts![0].box;
    img = blankPixels(Math.floor((out.size![0] * w) / first[4]), Math.floor((out.size![1] * h) / first[5]));
    for (const part of out.parts!) {
      let piece = crop(input, sx(part.box, w), sy(part.box, h), sw(part.box, w), sh(part.box, h));
      for (const op of part.ops) piece = applySliceOp(piece, op);
      draw(img, piece, Math.floor((part.at[0] * w) / part.box[4]), Math.floor((part.at[1] * h) / part.box[5]));
    }
  }
  for (const op of out.ops) img = applySliceOp(img, op);
  return img;
}
