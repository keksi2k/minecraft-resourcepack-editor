import { describe, expect, it } from 'vitest';
import {
  changeSpeed,
  distort,
  fitLength,
  pitchShift,
  splice,
  timeStretch,
  clipLength,
  crop,
  cut,
  echo,
  encodeOgg,
  fadeIn,
  gain,
  insertSilence,
  normalize,
  peaks,
  range,
  reverse,
  toMono,
  trimSilence,
  type Clip,
} from '../sounds/audioEdit';
import { inspectOgg } from '../sounds/editSounds';
import { drawLine, flip, floodFill, getPixel, rotate, shift, usedColors, type Pixels, type RGBA } from '../render/pixelEdit';

const clip = (...chs: number[][]): Clip => ({ sampleRate: 10, channels: chs.map((c) => Float32Array.from(c)) });
const arr = (c: Clip, i = 0) => [...c.channels[i]].map((v) => Math.round(v * 1000) / 1000);

describe('audio editing', () => {
  const c = clip([0, 0.1, 0.2, 0.3, 0.4, 0.5], [1, 1, 1, 1, 1, 1]);

  it('crops and cuts ranges on every channel', () => {
    expect(arr(crop(c, 1, 3))).toEqual([0.1, 0.2]);
    expect(arr(crop(c, 3, 1), 1)).toEqual([1, 1]);
    expect(arr(cut(c, 1, 3))).toEqual([0, 0.3, 0.4, 0.5]);
    expect(clipLength(cut(c, 1, 3))).toBe(4);
  });

  it('treats an empty range as the whole clip', () => {
    expect(range(c, 2, 2)).toEqual([0, 6]);
    expect(arr(reverse(c))).toEqual([0.5, 0.4, 0.3, 0.2, 0.1, 0]);
  });

  it('leaves the input untouched', () => {
    gain(c, 2);
    expect(arr(c)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
  });

  it('changes loudness with clipping, fades and normalises', () => {
    expect(arr(gain(c, 3, 4, 6))).toEqual([0, 0.1, 0.2, 0.3, 1, 1]);
    expect(arr(fadeIn(clip([1, 1, 1])))).toEqual([0, 0.5, 1]);
    expect(Math.max(...arr(normalize(clip([0.1, -0.25]))))).toBeCloseTo(0.392, 2);
  });

  it('mixes to mono, changes speed, inserts and trims silence', () => {
    expect(arr(toMono(clip([1, 0], [0, 0])))).toEqual([0.5, 0]);
    expect(clipLength(changeSpeed(c, 2))).toBe(3);
    expect(clipLength(changeSpeed(c, 0.5))).toBe(12);
    expect(arr(insertSilence(clip([1, 1]), 1, 0.2))).toEqual([1, 0, 0, 1]);
    expect(arr(trimSilence(clip([0, 0, 0.5, 0.2, 0, 0])))).toEqual([0.5, 0.2]);
  });

  it('adds echoes after the sound', () => {
    const e = echo(clip([1, 0, 0, 0]), 0.1, 0.5, 2);
    expect(arr(e)).toEqual([1, 0.5, 0.25, 0, 0, 0]);
  });

  it('computes waveform peaks', () => {
    expect(peaks(Float32Array.from([0.5, -0.5, 0.2, 0.1]), 0, 4, 2)).toEqual([
      [-0.5, 0.5],
      [0, expect.closeTo(0.2, 5)],
    ]);
  });

  it('encodes Ogg Vorbis that passes the format check', async () => {
    const pcm = Float32Array.from({ length: 22050 }, (_, i) => Math.sin(i / 8) * 0.4);
    const ogg = await encodeOgg({ sampleRate: 22050, channels: [pcm] }, 4);
    expect(inspectOgg(ogg)).toEqual({ channels: 1, sampleRate: 22050 });
  });
});


describe('pitch and tempo', () => {
  const rate = 8000;
  const sine = (hz: number, seconds: number) => ({
    sampleRate: rate,
    channels: [Float32Array.from({ length: rate * seconds }, (_, i) => Math.sin((2 * Math.PI * hz * i) / rate) * 0.5)],
  });
  /** Frequency from zero crossings in the middle of the clip (away from the edges). */
  const freq = (c: Clip) => {
    const ch = c.channels[0];
    const a = Math.floor(ch.length * 0.25);
    const b = Math.floor(ch.length * 0.75);
    let n = 0;
    for (let i = a + 1; i < b; i++) if (ch[i - 1] < 0 && ch[i] >= 0) n++;
    return n / ((b - a) / rate);
  };

  it('stretches time without changing the pitch', () => {
    const s = timeStretch(sine(200, 1), 1.5);
    expect(clipLength(s)).toBe(rate * 1.5);
    expect(freq(s)).toBeGreaterThan(185);
    expect(freq(s)).toBeLessThan(215);
  });

  it('shifts the pitch without changing the length', () => {
    const up = pitchShift(sine(200, 1), 12);
    expect(clipLength(up)).toBe(rate);
    expect(freq(up)).toBeGreaterThan(370);
    expect(freq(up)).toBeLessThan(430);
    const down = pitchShift(sine(200, 1), -12);
    expect(freq(down)).toBeGreaterThan(90);
    expect(freq(down)).toBeLessThan(110);
  });

  it('splices, fits and distorts', () => {
    const c = clip([1, 2, 3, 4]);
    expect(arr(splice(c, 1, 3, clip([9])))).toEqual([1, 9, 4]);
    expect(arr(fitLength(c, 2))).toEqual([1, 2]);
    expect(arr(fitLength(c, 5))).toEqual([1, 2, 3, 4, 0]);
    const d = distort(clip([0.1, 1, -1]), 10);
    expect(arr(d)[1]).toBe(1);
    expect(arr(d)[0]).toBeGreaterThan(0.7); // quiet parts get much louder
  });
});

const img = (w: number, h: number, fill: RGBA = [0, 0, 0, 0]): Pixels => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set(fill, i);
  return { width: w, height: h, data };
};
const RED: RGBA = [255, 0, 0, 255];
const BLUE: RGBA = [0, 0, 255, 255];

describe('pixel editing', () => {
  it('draws lines with a brush size', () => {
    const p = img(4, 4);
    drawLine(p, 0, 0, 3, 3, RED);
    expect([0, 1, 2, 3].map((i) => getPixel(p, i, i))).toEqual([RED, RED, RED, RED]);
    expect(getPixel(p, 1, 0)[3]).toBe(0);
    const q = img(4, 4);
    drawLine(q, 1, 1, 1, 1, BLUE, 2);
    expect(usedColors(q)).toEqual([BLUE]);
    expect(q.data.filter((_, i) => i % 4 === 3 && q.data[i] === 255).length).toBe(4);
  });

  it('fills contiguous areas, all matching pixels, or within a frame', () => {
    const p = img(3, 3, RED);
    drawLine(p, 1, 0, 1, 2, BLUE); // wall in the middle
    expect(floodFill(p, 0, 0, [0, 255, 0, 255])).toBe(3);
    expect(getPixel(p, 2, 0)).toEqual(RED);
    expect(floodFill(p, 2, 0, [0, 255, 0, 255], false)).toBe(3);

    const sheet = img(2, 4, RED); // two 2×2 frames
    expect(floodFill(sheet, 0, 0, BLUE, true, 0, { y0: 0, y1: 2 })).toBe(4);
    expect(getPixel(sheet, 0, 2)).toEqual(RED);
  });

  it('flips, rotates and shifts per frame', () => {
    const p = img(2, 4);
    p.data.set(RED, 0); // (0,0) of frame 1
    p.data.set(BLUE, (2 * 2 + 0) * 4); // (0,2) = (0,0) of frame 2
    const f = { ...p, data: p.data.slice() };
    flip(f, 'v', 2);
    expect(getPixel(f, 0, 1)).toEqual(RED);
    expect(getPixel(f, 0, 3)).toEqual(BLUE);

    const r = { ...p, data: p.data.slice() };
    expect(rotate(r, true, 2)).toBe(true);
    expect(getPixel(r, 1, 0)).toEqual(RED);
    expect(getPixel(r, 1, 2)).toEqual(BLUE);
    expect(rotate(img(2, 3), true)).toBe(false);

    const s = { ...p, data: p.data.slice() };
    shift(s, -1, -1, 2); // wraps to the far corner of each frame
    expect(getPixel(s, 1, 1)).toEqual(RED);
    expect(getPixel(s, 1, 3)).toEqual(BLUE);
  });
});
