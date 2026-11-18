import { frameAt, type TextureAnimation } from './animation';
import type { Pixels } from './pixelEdit';

/**
 * Frame helpers for animated textures (vertical strips of frames), on raw RGBA so they run in tests:
 * building a strip from single images, timing from GIF delays, rendering an animation for export,
 * and keeping a `.mcmeta` frame order valid when frames are moved around.
 */

export const blankPixels = (width: number, height: number): Pixels => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });

/** Nearest-neighbour resize (keeps hard pixel edges). */
export function scaleNearest(p: Pixels, width: number, height: number): Pixels {
  if (p.width === width && p.height === height) return { width, height, data: p.data.slice() };
  const out = blankPixels(width, height);
  for (let y = 0; y < height; y++) {
    const sy = Math.min(p.height - 1, Math.floor((y * p.height) / height));
    for (let x = 0; x < width; x++) {
      const sx = Math.min(p.width - 1, Math.floor((x * p.width) / width));
      out.data.set(p.data.subarray((sy * p.width + sx) * 4, (sy * p.width + sx) * 4 + 4), (y * width + x) * 4);
    }
  }
  return out;
}

/** The frames of a vertical strip, each `fh` rows high. */
export function splitFrames(p: Pixels, fh: number): Pixels[] {
  const n = Math.max(1, Math.floor(p.height / fh));
  const row = p.width * 4;
  return Array.from({ length: n }, (_, i) => ({ width: p.width, height: fh, data: p.data.slice(i * fh * row, (i + 1) * fh * row) }));
}

/** Stacks frames top to bottom, each scaled to `fw`×`fh`. */
export function stackFrames(frames: Pixels[], fw: number, fh: number): Pixels {
  const out = blankPixels(fw, fh * frames.length);
  frames.forEach((f, i) => out.data.set(scaleNearest(f, fw, fh).data, i * fw * fh * 4));
  return out;
}

/**
 * The frame size for imported images: their own size when they all match and have the texture's
 * aspect ratio (so higher-resolution frames stay sharp), else the texture's frame size.
 */
export function importFrameSize(frames: { width: number; height: number }[], current?: [number, number]): [number, number] {
  const [first] = frames;
  const same = frames.every((f) => f.width === first.width && f.height === first.height);
  if (!current) return same ? [first.width, first.height] : [first.width, first.width];
  const aspect = (w: number, h: number) => w / h;
  return same && Math.abs(aspect(first.width, first.height) - aspect(...current)) < 1e-6 ? [first.width, first.height] : current;
}

/** Minecraft ticks (1/20 s) for a GIF delay; browsers treat delays under 20 ms as 100 ms. */
export const delayToTicks = (ms: number) => Math.max(1, Math.round((ms < 20 ? 100 : ms) / 50));

/** `.mcmeta` animation timing from per-frame delays: one `frametime`, plus a frame list if they differ. */
export function animationFromDelays(delaysMs: number[]): { frametime: number; frames?: (number | { index: number; time: number })[] } {
  const ticks = delaysMs.map(delayToTicks);
  const counts = new Map<number, number>();
  for (const t of ticks) counts.set(t, (counts.get(t) ?? 0) + 1);
  const frametime = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 1;
  if (ticks.every((t) => t === frametime)) return { frametime };
  return { frametime, frames: ticks.map((time, index) => (time === frametime ? index : { index, time })) };
}

/**
 * The animation as a list of pictures with durations (hundredths of a second), the way the game
 * plays it: one per step, or one per tick while an interpolating animation blends.
 */
export function renderAnimation(sheet: Pixels, anim: TextureAnimation): { pixels: Uint8ClampedArray; delayCs: number }[] {
  const { fw, fh, columns } = anim;
  const frame = (i: number) => {
    const out = new Uint8ClampedArray(fw * fh * 4);
    const x0 = (i % columns) * fw;
    const y0 = Math.floor(i / columns) * fh;
    for (let y = 0; y < fh; y++) out.set(sheet.data.subarray(((y0 + y) * sheet.width + x0) * 4, ((y0 + y) * sheet.width + x0 + fw) * 4), y * fw * 4);
    return out;
  };
  const cache = new Map<number, Uint8ClampedArray>();
  const get = (i: number) => cache.get(i) ?? (cache.set(i, frame(i)), cache.get(i)!);
  const out: { pixels: Uint8ClampedArray; delayCs: number }[] = [];
  if (!anim.interpolate) {
    for (const f of anim.frames) {
      const last = out.at(-1);
      if (last && last.pixels === get(f.index)) last.delayCs += f.time * 5;
      else out.push({ pixels: get(f.index), delayCs: f.time * 5 });
    }
    return out;
  }
  for (let tick = 0; tick < anim.total; tick++) {
    const { current, next, progress } = frameAt(anim, tick);
    const a = get(current);
    if (progress === 0 || next === current) {
      out.push({ pixels: a, delayCs: 5 });
      continue;
    }
    // Minecraft blends colour and alpha linearly between the two frames
    const b = get(next);
    const mix = new Uint8ClampedArray(a.length);
    for (let k = 0; k < a.length; k++) mix[k] = a[k] + (b[k] - a[k]) * progress;
    out.push({ pixels: mix, delayCs: 5 });
  }
  return out;
}

/** Scales every picture by a whole factor (for a GIF that is big enough to look at). */
export function upscaleFrames(frames: { pixels: Uint8ClampedArray; delayCs: number }[], w: number, h: number, factor: number) {
  if (factor <= 1) return frames;
  return frames.map((f) => ({ ...f, pixels: scaleNearest({ width: w, height: h, data: f.pixels }, w * factor, h * factor).data }));
}

type Frame = number | { index: number; time?: number };
const indexOf = (f: Frame) => (typeof f === 'number' ? f : f.index);

/**
 * A `.mcmeta` frame order after the frames of the strip were rearranged. `origin[i]` is the old
 * index of new frame i, or -1 for a frame that was added. Steps of deleted frames are dropped;
 * added frames (and copies) are appended so they play at all.
 */
export function remapFrameOrder(frames: Frame[], origin: number[]): Frame[] {
  const moved = new Map<number, number>();
  const extra: number[] = [];
  origin.forEach((o, i) => {
    if (o >= 0 && !moved.has(o)) moved.set(o, i);
    else extra.push(i);
  });
  const out: Frame[] = frames
    .filter((f) => moved.has(indexOf(f)))
    .map((f) => (typeof f === 'number' ? moved.get(f)! : { ...f, index: moved.get(f.index)! }));
  return [...out, ...extra];
}

export const isIdentity = (origin: number[], count: number) => origin.length === count && origin.every((o, i) => o === i);
