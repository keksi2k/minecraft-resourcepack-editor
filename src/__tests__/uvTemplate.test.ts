import { describe, expect, it } from 'vitest';
import { AssetStore } from '../assets/AssetStore';
import type { ResolvedModel } from '../models/modelResolver';
import { entityTemplate } from '../render/entityMesh';
import { defaultScale, faceColor, modelTemplates } from '../render/uvTemplate';

/** Just enough of a PNG for its size to be read. */
function pngOf(w: number, h: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
}

describe('UV templates', () => {
  it('maps the faces of block model elements onto each texture, at the texture’s size', () => {
    const store = new AssetStore(
      new Map([
        ['assets/minecraft/textures/block/lamp.png', pngOf(32, 32)],
        ['assets/minecraft/textures/block/side.png', pngOf(16, 64)],
        ['assets/minecraft/textures/block/side.png.mcmeta', new TextEncoder().encode('{"animation":{}}')],
      ]),
      new Map(),
    );
    const model = {
      kind: 'elements',
      textures: { top: 'minecraft:block/lamp', side: 'minecraft:block/side' },
      elements: [
        {
          from: [0, 0, 0],
          to: [16, 8, 16],
          faces: { up: { texture: '#top' }, north: { texture: '#side', uv: [16, 0, 0, 8] }, down: { texture: '#missing' } },
        },
      ],
    } as unknown as ResolvedModel;
    const t = modelTemplates(store, [model]);
    expect([...t.keys()]).toEqual(['minecraft:block/lamp', 'minecraft:block/side']);
    // the top covers the whole 32×32 texture
    expect(t.get('minecraft:block/lamp')).toEqual({ size: [32, 32], faces: [{ part: '0', face: 'up', x0: 0, y0: 0, x1: 32, y1: 32 }] });
    // an animated texture counts one frame; mirrored UVs still give a box
    expect(t.get('minecraft:block/side')).toEqual({ size: [16, 16], faces: [{ part: '0', face: 'north', x0: 0, y0: 0, x1: 16, y1: 8 }] });
  });

  it('knows which way the faces of a mob look', () => {
    const cow = entityTemplate('minecraft:cow#main')!;
    expect(cow.size).toEqual([64, 64]);
    // six faces per box, every one of them on the texture
    expect(new Set(cow.faces.map((f) => f.face))).toEqual(new Set(['up', 'down', 'north', 'south', 'east', 'west']));
    expect(cow.faces.every((f) => f.x0 >= 0 && f.x1 <= 64 && f.y0 >= 0 && f.y1 <= 64)).toBe(true);
    // box UV puts a box's top face left of its bottom face, in the first row: up and down aren't swapped
    const face = (dir: string) => cow.faces.find((f) => f.part === 'head' && f.face === dir)!;
    expect(face('up').x0).toBeLessThan(face('down').x0);
    expect(face('up').y0).toBeLessThan(face('north').y0);
    expect(entityTemplate('minecraft:nothing#main')).toBeUndefined();
  });

  it('picks a picture size of about 512 pixels and shades faces like the game', () => {
    expect(defaultScale([16, 16])).toBe(32);
    expect(defaultScale([64, 32])).toBe(8);
    expect(defaultScale([1024, 1024])).toBe(1);
    expect(faceColor(0, 'up')).not.toBe(faceColor(0, 'down'));
    expect(faceColor(0, 'up')).not.toBe(faceColor(1, 'up'));
  });
});
