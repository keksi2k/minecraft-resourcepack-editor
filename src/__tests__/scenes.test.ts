import { describe, expect, it } from 'vitest';
import { blockParts, blockTint, cellKey, DEFAULT_TINTS, floor, parseCells, pickVariant, positionSeed, serializeCells, usualVariantKey } from '../scenes/sandbox';
import { AssetStore } from '../assets/AssetStore';
import { biomeColors, colormapSpot, darkForestGrass, parseBiome, sampleColormap, SWAMP_GRASS } from '../scenes/colormap';
import { addGlyph, buildFont, codePointLabel, fontProviders, glyphWidth, layoutText, nextFreeChar, removeGlyph } from '../scenes/font';
import { containerSlots, CONTAINERS } from '../scenes/hud';
import { directionAngles, equirectToFaces, faceDirection, faceSizeFor, PANORAMA_FACES } from '../scenes/panorama';
import type { Pixels } from '../render/pixelEdit';

const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));

/** A sheet of 2×1 cells of 8×8; the first glyph is 3 px wide, the second 8. */
function sheet(): Pixels {
  const p: Pixels = { width: 16, height: 8, data: new Uint8ClampedArray(16 * 8 * 4) };
  const set = (x: number, y: number) => (p.data[(y * 16 + x) * 4 + 3] = 255);
  set(2, 0);
  set(15, 7);
  return p;
}

describe('fonts', () => {
  it('measures glyphs up to their rightmost opaque column', () => {
    expect(glyphWidth(sheet(), 0, 0, 8, 8)).toBe(3);
    expect(glyphWidth(sheet(), 8, 0, 8, 8)).toBe(8);
  });

  it('reads pack providers before vanilla ones and follows references', () => {
    const vanilla = new Map([
      ['assets/minecraft/font/default.json', enc({ providers: [{ type: 'reference', id: 'minecraft:include/space' }, { type: 'bitmap', file: 'minecraft:font/ascii.png', ascent: 7, chars: ['ab'] }, { type: 'bitmap', file: 'x.png', chars: ['c'], filter: { uniform: true } }] })],
      ['assets/minecraft/font/include/space.json', enc({ providers: [{ type: 'space', advances: { ' ': 4 } }] })],
    ]);
    const pack = new Map([['assets/minecraft/font/default.json', enc({ providers: [{ type: 'bitmap', file: 'minecraft:font/custom/heart.png', ascent: 8, height: 9, chars: [''] }] })]]);
    const providers = fontProviders(new AssetStore(vanilla, pack));
    expect(providers.map((p) => p.type)).toEqual(['bitmap', 'space', 'bitmap']);
    expect(providers[0]).toMatchObject({ from: 'pack', file: 'assets/minecraft/textures/font/custom/heart.png', height: 9 });
    expect(providers[2]).toMatchObject({ from: 'vanilla', file: 'assets/minecraft/textures/font/ascii.png', height: 8 });
  });

  it('lays text out with advances, spaces, bold and § codes', () => {
    const font = buildFont(
      'minecraft:default',
      [
        { type: 'space', advances: { ' ': 4 }, from: 'vanilla', defPath: '' },
        { type: 'bitmap', file: 's', ascent: 7, height: 8, chars: ['ab'], from: 'vanilla', defPath: '' },
      ],
      new Map([['s', sheet()]]),
    );
    expect(font.glyph(0x61)?.advance).toBe(4);
    expect(font.glyph(0x62)?.advance).toBe(9);
    expect(layoutText(font, 'a b').width).toBe(4 + 4 + 9);
    // bold adds a pixel per glyph; the colour code isn't drawn
    expect(layoutText(font, '§c§la').width).toBe(5);
    expect(layoutText(font, '§ea').runs[0].style.color).toBe('#ffff55');
  });

  it('scales glyphs to the provider height', () => {
    const font = buildFont('f', [{ type: 'bitmap', file: 's', ascent: 7, height: 16, chars: ['ab'], from: 'pack', defPath: '' }], new Map([['s', sheet()]]));
    expect(font.glyph(0x61)).toMatchObject({ scale: 2, advance: 7 });
  });
});

describe('panorama', () => {
  it('has faces whose right and up make a right-handed basis facing the centre', () => {
    for (const f of PANORAMA_FACES) {
      const [a, b] = [f.right, f.up];
      const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      expect(cross.map((v) => v + 0)).toEqual(f.forward.map((v) => -v + 0));
    }
  });

  it('turns right from face to face', () => {
    expect(directionAngles(faceDirection(PANORAMA_FACES[0], 0, 0))[0]).toBeCloseTo(0);
    expect(directionAngles(faceDirection(PANORAMA_FACES[1], 0, 0))[0]).toBeCloseTo(Math.PI / 2);
    expect(directionAngles(faceDirection(PANORAMA_FACES[3], 0, 0))[0]).toBeCloseTo(-Math.PI / 2);
    expect(directionAngles(faceDirection(PANORAMA_FACES[4], 0, 0))[1]).toBeCloseTo(Math.PI / 2);
    // the top of the up image lies behind the viewer
    expect(Math.abs(directionAngles(faceDirection(PANORAMA_FACES[4], 0, 0.9))[0])).toBeCloseTo(Math.PI);
  });

  it('cuts a 360° image into faces that look the right way', () => {
    // left half red, right half blue; top quarter white
    const w = 64;
    const h = 32;
    const src: Pixels = { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const c = y < 4 ? [255, 255, 255] : x < w / 2 ? [255, 0, 0] : [0, 0, 255];
        src.data.set([...c, 255], i);
      }
    const faces = equirectToFaces(src, 8);
    const px = (f: Pixels, x: number, y: number) => Array.from(f.data.slice((y * f.width + x) * 4, (y * f.width + x) * 4 + 3));
    // ahead: left side red, right side blue
    expect(px(faces[0], 0, 4)).toEqual([255, 0, 0]);
    expect(px(faces[0], 7, 4)).toEqual([0, 0, 255]);
    // turned right: all blue; turned left: all red
    expect(px(faces[1], 4, 4)).toEqual([0, 0, 255]);
    expect(px(faces[3], 4, 4)).toEqual([255, 0, 0]);
    // straight up is white
    expect(px(faces[4], 4, 4)).toEqual([255, 255, 255]);
  });

  it('picks a power-of-two face size', () => {
    expect(faceSizeFor(4096)).toBe(1024);
    expect(faceSizeFor(8192)).toBe(2048);
    expect(faceSizeFor(100000)).toBe(2048);
  });
});

describe('biome colours', () => {
  it('reads the colormap where the game does', () => {
    expect(colormapSpot(0.8, 0.4)).toEqual([50, 173]);
    expect(colormapSpot(2, 0)).toEqual([0, 255]);
    const map: Pixels = { width: 256, height: 256, data: new Uint8ClampedArray(256 * 256 * 4) };
    map.data.set([1, 2, 3, 255], (173 * 256 + 50) * 4);
    expect(sampleColormap(map, 0.8, 0.4, 0)).toBe(0x010203);
  });

  it('applies the biome’s own colours and modifiers', () => {
    const swamp = parseBiome('minecraft:swamp', { temperature: 0.8, downfall: 0.9, effects: { foliage_color: '#6a7039', grass_color_modifier: 'swamp' } })!;
    const c = biomeColors(swamp, {});
    expect(c.grass).toBe(SWAMP_GRASS);
    expect(c.foliage).toBe(0x6a7039);
    expect(c.fixed).toMatchObject({ grass: true, foliage: true, dryFoliage: false });
    expect(darkForestGrass(0x91bd59)).toBe(((0x91bd59 & 0xfefefe) + 0x28340a) >> 1);
    // older versions store colours as numbers
    expect(parseBiome('x', { temperature: 1, effects: { grass_color: 0x123456 } })?.grassColor).toBe(0x123456);
  });
});

describe('container screens', () => {
  it('lists every slot of a chest and the player inventory', () => {
    const chest = CONTAINERS.find((c) => c.id === 'chest')!;
    const slots = containerSlots(chest);
    expect(slots).toHaveLength(27 + 36);
    expect(slots[27]).toEqual([8, 85]);
    expect(slots[slots.length - 1]).toEqual([8 + 8 * 18, 143]);
  });
});

describe('own glyphs', () => {
  it('adds and removes single-glyph providers on the next free private use character', () => {
    const own = addGlyph(undefined, { file: 'minecraft:font/custom/a.png', char: '', height: 8, ascent: 7 });
    expect(own.providers).toHaveLength(1);
    const providers = [{ type: 'bitmap' as const, file: '', ascent: 7, height: 8, chars: [''], from: 'pack' as const, defPath: '' }];
    expect(nextFreeChar(providers)).toBe('');
    const both = addGlyph(own, { file: 'minecraft:font/custom/b.png', char: '', height: 9, ascent: 8 });
    expect(removeGlyph(both, '').providers.map((p: any) => p.chars[0])).toEqual(['']);
    expect(codePointLabel(0xe001)).toBe('U+E001');
  });
});

describe('block sandbox', () => {
  it('picks the usual state of a block', () => {
    expect(usualVariantKey(['', 'x=1'])).toBe('');
    expect(usualVariantKey(['axis=x', 'axis=y', 'axis=z'])).toBe('axis=y');
    expect(usualVariantKey(['facing=east,lit=true', 'facing=north,lit=false'])).toBe('facing=north,lit=false');
  });

  it('keeps the parts that always apply to a multipart block', () => {
    const parts = blockParts({ multipart: [{ apply: { model: 'post' } }, { when: { north: 'true' }, apply: { model: 'side' } }] });
    expect(parts.map((p) => p[0].model)).toEqual(['post']);
  });

  it('picks random variants by weight, the same for a position every time', () => {
    const variants = [{ model: 'a', weight: 3 }, { model: 'b' }];
    expect([0, 1, 2, 3].map((s) => pickVariant(variants, s))).toEqual([0, 0, 0, 1]);
    expect(positionSeed(4, 0, -7)).toBe(positionSeed(4, 0, -7));
    const seen = new Set(Array.from({ length: 64 }, (_, i) => pickVariant([{ model: 'a' }, { model: 'b' }, { model: 'c' }, { model: 'd' }], positionSeed(i % 8, 0, i >> 3))));
    expect(seen.size).toBe(4);
  });

  it('saves and reads a scene', () => {
    const cells = floor('minecraft:stone', 2);
    cells.set(cellKey(0, 1, 0), 'minecraft:oak_log');
    expect(parseCells(serializeCells(cells))).toEqual(cells);
    expect(blockTint('minecraft:spruce_leaves', DEFAULT_TINTS)).toBe(0x619961);
    expect(blockTint('minecraft:stone', DEFAULT_TINTS)).toBeUndefined();
  });
});
