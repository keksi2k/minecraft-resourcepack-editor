import { describe, expect, it } from 'vitest';
import { blankPixels } from '../render/frames';
import {
  clearRect,
  constrain,
  copyRect,
  countColor,
  drawRect,
  flatten,
  intersect,
  mergeInto,
  paste,
  rectBetween,
  replaceColor,
  restoreRect,
  type PaintLayer,
} from '../render/paintTools';
import { lospecSlug, nearest, paletteFromImage, parsePalette, snapToPalette } from '../render/palettes';
import { drawLine, floodFill, getPixel, setPixel, type RGBA } from '../render/pixelEdit';
import { replaceCandidates } from '../ui/texture/ReplaceColorPanel';

const RED: RGBA = [255, 0, 0, 255];
const BLUE: RGBA = [0, 0, 255, 255];
const layer = (id: number, w: number, h: number, extra: Partial<PaintLayer> = {}): PaintLayer => ({ id, name: `L${id}`, px: blankPixels(w, h), visible: true, opacity: 100, ...extra });

describe('texture editor layers', () => {
  it('passes a lone layer through untouched and stacks others bottom first', () => {
    const a = layer(1, 2, 1);
    expect(flatten([a], 2, 1)).toBe(a.px);
    setPixel(a.px, 0, 0, RED);
    setPixel(a.px, 1, 0, RED);
    const b = layer(2, 2, 1);
    setPixel(b.px, 1, 0, BLUE);
    const flat = flatten([a, b], 2, 1);
    expect(getPixel(flat, 0, 0)).toEqual(RED);
    expect(getPixel(flat, 1, 0)).toEqual(BLUE);
    // hidden layers don't count
    expect(getPixel(flatten([a, { ...b, visible: false }], 2, 1), 1, 0)).toEqual(RED);
  });

  it('blends a half transparent layer over the one below', () => {
    const a = layer(1, 1, 1);
    setPixel(a.px, 0, 0, RED);
    const b = layer(2, 1, 1, { opacity: 50 });
    setPixel(b.px, 0, 0, BLUE);
    const [r, g, bl, al] = getPixel(flatten([a, b], 1, 1), 0, 0);
    expect([Math.round(r / 10), g, Math.round(bl / 10), al]).toEqual([13, 0, 13, 255]);
    mergeInto(a.px, b.px, 50);
    expect(getPixel(a.px, 0, 0)).toEqual([r, g, bl, al]);
  });
});

describe('texture editor shapes and selections', () => {
  it('draws rectangle outlines and filled ones, kept inside a clip', () => {
    const p = blankPixels(4, 4);
    drawRect(p, [0, 0], [3, 3], RED);
    expect(countColor(p, RED)).toBe(12);
    expect(getPixel(p, 1, 1)[3]).toBe(0);
    const q = blankPixels(4, 4);
    drawRect(q, [3, 3], [0, 0], RED, true, 1, { x: 0, y: 0, w: 2, h: 4 });
    expect(countColor(q, RED)).toBe(8);
    const l = blankPixels(4, 4);
    drawLine(l, 0, 0, 3, 0, BLUE, 1, { x: 1, y: 0, w: 2, h: 1 });
    expect(countColor(l, BLUE)).toBe(2);
  });

  it('snaps lines to 45° and rectangles to squares', () => {
    expect(constrain([0, 0], [5, 1])).toEqual([5, 0]);
    expect(constrain([0, 0], [4, 5])).toEqual([5, 5]);
    expect(constrain([2, 2], [0, 7], true)).toEqual([-3, 7]);
  });

  it('spans, clips and intersects rectangles', () => {
    expect(rectBetween([3, 1], [1, 2])).toEqual({ x: 1, y: 1, w: 3, h: 2 });
    expect(rectBetween([-2, -2], [1, 1], { x: 0, y: 0, w: 4, h: 4 })).toEqual({ x: 0, y: 0, w: 2, h: 2 });
    expect(rectBetween([5, 5], [6, 6], { x: 0, y: 0, w: 4, h: 4 })).toBeUndefined();
    expect(intersect({ x: 0, y: 0, w: 4, h: 4 }, { x: 2, y: 3, w: 4, h: 4 })).toEqual({ x: 2, y: 3, w: 2, h: 1 });
  });

  it('lifts, moves and drops pixels; transparent ones let the picture show through', () => {
    const p = blankPixels(4, 1);
    setPixel(p, 0, 0, RED);
    setPixel(p, 3, 0, BLUE);
    const piece = copyRect(p, { x: 0, y: 0, w: 2, h: 1 });
    clearRect(p, { x: 0, y: 0, w: 2, h: 1 });
    const base = p.data.slice();
    paste(p, piece, 2, 0);
    // the transparent half of the piece leaves the blue pixel
    expect(getPixel(p, 2, 0)).toEqual(RED);
    expect(getPixel(p, 3, 0)).toEqual(BLUE);
    restoreRect(p, base, { x: 2, y: 0, w: 2, h: 1 });
    expect(getPixel(p, 2, 0)[3]).toBe(0);
    // a clip keeps the piece inside the frame
    paste(p, piece, 3, 0, { x: 0, y: 0, w: 3, h: 1 });
    expect(getPixel(p, 3, 0)).toEqual(BLUE);
  });

  it('fills only inside the given bounds, contiguous or not', () => {
    const p = blankPixels(4, 2);
    expect(floodFill(p, 1, 0, RED, true, 0, { x0: 1, x1: 3, y0: 0, y1: 2 })).toBe(4);
    expect(floodFill(p, 0, 0, BLUE, false, 0, { x0: 0, x1: 4, y0: 1, y1: 2 })).toBe(0);
    expect(floodFill(p, 0, 1, BLUE, false, 0, { x0: 0, x1: 4, y0: 1, y1: 2 })).toBe(2);
    expect(countColor(p, BLUE)).toBe(2);
  });
});

describe('replacing colours', () => {
  it('moves shading along with the colour, inside the tolerance only', () => {
    const p = blankPixels(3, 1);
    setPixel(p, 0, 0, [100, 100, 100, 255]);
    setPixel(p, 1, 0, [110, 100, 90, 255]);
    setPixel(p, 2, 0, [200, 200, 200, 255]);
    expect(replaceColor(p, [100, 100, 100, 255], [50, 0, 0, 255], 10)).toBe(2);
    expect(getPixel(p, 0, 0)).toEqual([50, 0, 0, 255]);
    expect(getPixel(p, 1, 0)).toEqual([60, 0, 0, 255]);
    expect(getPixel(p, 2, 0)).toEqual([200, 200, 200, 255]);
  });

  it('looks in the texture’s folder or in the pack’s own textures', () => {
    const all = [
      'assets/minecraft/textures/block/stone.png',
      'assets/minecraft/textures/block/dirt.png',
      'assets/minecraft/textures/block/sub/x.png',
      'assets/minecraft/textures/item/apple.png',
      'assets/minecraft/textures/block/dirt.png.mcmeta',
    ];
    const open = 'assets/minecraft/textures/block/stone.png';
    expect(replaceCandidates(all, open, 'here', () => true)).toEqual([]);
    expect(replaceCandidates(all, open, 'folder', () => false)).toEqual(['assets/minecraft/textures/block/dirt.png']);
    expect(replaceCandidates(all, open, 'pack', (p) => p.includes('item'))).toEqual(['assets/minecraft/textures/item/apple.png']);
  });
});

describe('palettes', () => {
  it('reads the common palette file formats', () => {
    expect(parsePalette('000000\nFF004D\n\n29adff')).toEqual(['#000000', '#ff004d', '#29adff']);
    expect(parsePalette('; paint.net\nFFFF0000\nFF00FF00')).toEqual(['#ff0000', '#00ff00']);
    expect(parsePalette('GIMP Palette\nName: x\n#\n255   0   0\tRed\n  0 255   0')).toEqual(['#ff0000', '#00ff00']);
    expect(parsePalette('JASC-PAL\n0100\n2\n0 0 255\n255 255 255')).toEqual(['#0000ff', '#ffffff']);
    expect(parsePalette('{"name":"x","colors":["1D2B53","7e2553","1d2b53"]}')).toEqual(['#1d2b53', '#7e2553']);
    expect(parsePalette('not a palette')).toEqual([]);
  });

  it('reads palette images in reading order and Lospec names from links', () => {
    const p = blankPixels(3, 1);
    setPixel(p, 0, 0, RED);
    setPixel(p, 2, 0, BLUE);
    expect(paletteFromImage(p)).toEqual(['#ff0000', '#0000ff']);
    expect(lospecSlug('https://lospec.com/palette-list/pico-8')).toBe('pico-8');
    expect(lospecSlug('lospec.com/palette-list/endesga-32.hex')).toBe('endesga-32');
    expect(lospecSlug('Sweetie 16')).toBe('sweetie-16');
    expect(lospecSlug('../etc')).toBeUndefined();
  });

  it('snaps colours to the nearest palette colour and keeps alpha', () => {
    expect(nearest([[0, 0, 0], [255, 255, 255]], 200, 190, 210)).toEqual([255, 255, 255]);
    const p = blankPixels(2, 1);
    setPixel(p, 0, 0, [250, 10, 10, 128]);
    setPixel(p, 1, 0, [10, 10, 240, 255]);
    expect(snapToPalette(p, ['#ff0000', '#0000ff'])).toBe(2);
    expect(getPixel(p, 0, 0)).toEqual([255, 0, 0, 128]);
    expect(getPixel(p, 1, 0)).toEqual([0, 0, 255, 255]);
  });
});
