import { describe, expect, it } from 'vitest';
import { parseAnimation } from '../render/animation';
import {
  animationFromDelays,
  delayToTicks,
  importFrameSize,
  remapFrameOrder,
  renderAnimation,
  scaleNearest,
  splitFrames,
  stackFrames,
} from '../render/frames';
import { decodeGif, encodeGif } from '../render/gif';
import type { Pixels } from '../render/pixelEdit';

const solid = (w: number, h: number, rgba: number[]): Pixels => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set(rgba, i);
  return { width: w, height: h, data };
};

describe('GIF codec', () => {
  it('round-trips frames with timing and transparency', () => {
    const a = solid(4, 3, [255, 0, 0, 255]);
    a.data.set([0, 0, 0, 0], 0); // one transparent pixel
    const b = solid(4, 3, [0, 128, 255, 255]);
    const gif = decodeGif(encodeGif(4, 3, [{ pixels: a.data, delayCs: 25 }, { pixels: b.data, delayCs: 10 }]));
    expect(gif.width).toBe(4);
    expect(gif.frames.map((f) => f.delayMs)).toEqual([250, 100]);
    expect([...gif.frames[0].pixels.slice(0, 8)]).toEqual([0, 0, 0, 0, 255, 0, 0, 255]);
    expect([...gif.frames[1].pixels.slice(0, 4)]).toEqual([0, 128, 255, 255]);
  });

  it('round-trips many colours and large images through the LZW code size changes', () => {
    const w = 64;
    const h = 64;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) data.set([(i * 7) % 256, (i * 3) % 256, (i * 11) % 256, 255], i * 4);
    const gif = decodeGif(encodeGif(w, h, [{ pixels: data, delayCs: 5 }]));
    const px = gif.frames[0].pixels;
    // more than 256 colours: precision drops, but every pixel stays close
    let maxDiff = 0;
    for (let i = 0; i < data.length; i++) if (i % 4 !== 3) maxDiff = Math.max(maxDiff, Math.abs(px[i] - data[i]));
    expect(maxDiff).toBeLessThan(64);
    // an image with few colours comes back exactly
    const few = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) few.set([(i % 5) * 50, 0, (i % 3) * 100, 255], i * 4);
    expect([...decodeGif(encodeGif(w, h, [{ pixels: few, delayCs: 5 }])).frames[0].pixels]).toEqual([...few]);
  });

  it('survives a full LZW table (clear codes mid-image)', () => {
    const w = 300;
    const h = 200;
    const data = new Uint8ClampedArray(w * h * 4);
    let seed = 1;
    for (let i = 0; i < w * h; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      data.set([(seed >> 8) % 200, 10, 20, 255], i * 4);
    }
    expect([...decodeGif(encodeGif(w, h, [{ pixels: data, delayCs: 5 }])).frames[0].pixels]).toEqual([...data]);
  });
});

describe('frames', () => {
  it('scales with nearest neighbour', () => {
    const p: Pixels = { width: 2, height: 1, data: new Uint8ClampedArray([1, 1, 1, 255, 2, 2, 2, 255]) };
    expect([...scaleNearest(p, 4, 2).data].filter((_, i) => i % 4 === 0)).toEqual([1, 1, 2, 2, 1, 1, 2, 2]);
  });

  it('stacks and splits strips', () => {
    const strip = stackFrames([solid(2, 2, [1, 0, 0, 255]), solid(4, 4, [2, 0, 0, 255])], 2, 2);
    expect(strip.height).toBe(4);
    expect(splitFrames(strip, 2).map((f) => f.data[0])).toEqual([1, 2]);
  });

  it('keeps the size of imported frames only when it fits the texture', () => {
    expect(importFrameSize([{ width: 32, height: 32 }], [16, 16])).toEqual([32, 32]);
    expect(importFrameSize([{ width: 32, height: 20 }], [16, 16])).toEqual([16, 16]);
    expect(importFrameSize([{ width: 32, height: 32 }, { width: 16, height: 16 }], [16, 16])).toEqual([16, 16]);
    expect(importFrameSize([{ width: 24, height: 24 }])).toEqual([24, 24]);
  });

  it('turns GIF delays into ticks', () => {
    expect(delayToTicks(100)).toBe(2);
    expect(delayToTicks(0)).toBe(2); // browsers play 0 ms as 100 ms
    expect(animationFromDelays([250, 250, 250])).toEqual({ frametime: 5 });
    expect(animationFromDelays([250, 250, 500])).toEqual({ frametime: 5, frames: [0, 1, { index: 2, time: 10 }] });
  });

  it('renders an animation the way the game plays it', () => {
    const sheet = stackFrames([solid(1, 1, [0, 0, 0, 255]), solid(1, 1, [200, 0, 0, 255])], 1, 1);
    const plain = renderAnimation(sheet, parseAnimation({ frametime: 4, frames: [0, 0, 1] }, 1, 2)!);
    expect(plain.map((f) => [f.pixels[0], f.delayCs])).toEqual([[0, 40], [200, 20]]);
    const smooth = renderAnimation(sheet, parseAnimation({ frametime: 2, interpolate: true }, 1, 2)!);
    expect(smooth.map((f) => f.pixels[0])).toEqual([0, 100, 200, 100]);
  });

  it('keeps a custom frame order valid after frames moved', () => {
    // frames 0 and 1 swapped, frame 2 deleted, a new one added at the end
    expect(remapFrameOrder([0, 1, { index: 2, time: 3 }, 1], [1, 0, -1])).toEqual([1, 0, 0, 2]);
    // a copy of frame 0 counts as new
    expect(remapFrameOrder([0, 1], [0, 0, 1])).toEqual([0, 2, 1]);
  });
});
