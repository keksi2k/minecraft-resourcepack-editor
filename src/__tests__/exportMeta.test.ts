import { describe, expect, it } from 'vitest';
import { AssetStore, animationMetaFor } from '../assets/AssetStore';

/** Just enough of a PNG for the IHDR size to be read. */
function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(24);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
}
const json = (o: unknown) => new TextEncoder().encode(JSON.stringify(o));
const read = (b: Uint8Array | undefined) => b && JSON.parse(new TextDecoder().decode(b));
const TEX = 'assets/minecraft/textures/block/sea_lantern.png';

describe('animated textures on export', () => {
  it('adds the vanilla .mcmeta to a replaced animated texture', () => {
    const meta = json({ animation: { frametime: 5 } });
    const s = new AssetStore(new Map([[TEX, png(16, 80)], [`${TEX}.mcmeta`, meta]]), new Map());
    s.setEdit(TEX, png(16, 80));
    expect(s.exportFiles().get(`${TEX}.mcmeta`)).toBe(meta);
  });

  it("keeps the pack's own .mcmeta and leaves untouched textures alone", () => {
    const own = json({ animation: { frametime: 2 } });
    const vanilla = new Map([[TEX, png(16, 80)], [`${TEX}.mcmeta`, json({ animation: {} })]]);
    expect(new AssetStore(vanilla, new Map([[TEX, png(16, 32)], [`${TEX}.mcmeta`, own]])).exportFiles().get(`${TEX}.mcmeta`)).toBe(own);
    expect(new AssetStore(vanilla, new Map()).exportFiles().size).toBe(0);
  });

  it('adds the vanilla texture when only its .mcmeta was changed', () => {
    const tex = png(16, 80);
    const s = new AssetStore(new Map([[TEX, tex], [`${TEX}.mcmeta`, json({ animation: {} })]]), new Map());
    s.setEdit(`${TEX}.mcmeta`, json({ animation: { frametime: 2 } }));
    expect(s.exportFiles().get(TEX)).toBe(tex);
  });

  it('drops frames the new image does not have', () => {
    const meta = json({ animation: { frametime: 1, frames: [0, 1, { index: 3, time: 4 }, 2] } });
    expect(read(animationMetaFor(png(16, 48), meta)).animation.frames).toEqual([0, 1, 2]);
    expect(read(animationMetaFor(png(16, 16), json({ animation: { frames: [3, 4] } }))).animation).toEqual({});
  });

  it('skips images Minecraft could not cut into frames', () => {
    expect(animationMetaFor(png(16, 40), json({ animation: {} }))).toBeUndefined();
    expect(animationMetaFor(png(32, 48), json({ animation: { height: 16 } }))).toBeDefined();
  });
});
