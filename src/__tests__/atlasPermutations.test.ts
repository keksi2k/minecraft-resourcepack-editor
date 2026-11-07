import { describe, expect, it } from 'vitest';
import { AssetStore } from '../assets/AssetStore';
import { permutationFiles, recolor, texturePermutation } from '../models/atlasPermutations';

const enc = (v: unknown) => new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v));
const files = (o: Record<string, unknown>) => new Map(Object.entries(o).map(([k, v]) => [k, enc(v)]));

const atlas = (suffix: string, palette: string, extra: object = {}) => ({
  sources: [
    { type: 'minecraft:directory', prefix: 'item/', source: 'item' },
    {
      type: 'minecraft:paletted_permutations',
      palette_key: 'minecraft:trim_base',
      permutations: { [suffix]: palette },
      textures: ['minecraft:trims/items/helmet_trim'],
      ...extra,
    },
  ],
});

const vanilla = files({
  'assets/minecraft/atlases/items.json': atlas('iron', 'minecraft:trim/iron'),
  'assets/minecraft/textures/trims/items/helmet_trim.png': 'png',
  'assets/minecraft/textures/palettes/trim_base.png': 'png',
  'assets/minecraft/textures/palettes/trim/iron.png': 'png',
  'assets/minecraft/textures/palettes/trim/ruby.png': 'png',
});

const IRON = {
  template: 'assets/minecraft/textures/trims/items/helmet_trim.png',
  key: 'assets/minecraft/textures/palettes/trim_base.png',
  palette: 'assets/minecraft/textures/palettes/trim/iron.png',
};

describe('texturePermutation', () => {
  it('finds a generated texture and its files', () => {
    const store = new AssetStore(vanilla, new Map());
    expect(texturePermutation(store, 'minecraft:trims/items/helmet_trim_iron')).toEqual(IRON);
    expect(texturePermutation(store, 'trims/items/helmet_trim_iron')).toEqual(IRON);
    expect(permutationFiles(IRON)).toContain(`${IRON.template}.mcmeta`);
  });

  it('ignores textures no atlas generates', () => {
    const store = new AssetStore(vanilla, new Map());
    expect(texturePermutation(store, 'minecraft:trims/items/helmet_trim_gold')).toBeUndefined();
    expect(texturePermutation(store, 'minecraft:item/diamond')).toBeUndefined();
  });

  it("adds a pack's atlas sources to vanilla's", () => {
    const pack = files({ 'assets/minecraft/atlases/items.json': atlas('ruby', 'minecraft:trim/ruby') });
    const store = new AssetStore(vanilla, pack);
    expect(texturePermutation(store, 'minecraft:trims/items/helmet_trim_iron')?.palette).toBe(IRON.palette);
    expect(texturePermutation(store, 'minecraft:trims/items/helmet_trim_ruby')?.palette).toBe('assets/minecraft/textures/palettes/trim/ruby.png');
  });

  it('honours the separator and old palette locations', () => {
    const old = files({
      'assets/minecraft/atlases/armor_trims.json': atlas('iron', 'minecraft:trims/color_palettes/iron', { palette_key: 'trims/color_palettes/trim_palette', separator: '-' }),
      'assets/minecraft/textures/trims/items/helmet_trim.png': 'png',
      'assets/minecraft/textures/trims/color_palettes/trim_palette.png': 'png',
      'assets/minecraft/textures/trims/color_palettes/iron.png': 'png',
    });
    expect(texturePermutation(new AssetStore(old, new Map()), 'minecraft:trims/items/helmet_trim-iron')?.palette).toBe('assets/minecraft/textures/trims/color_palettes/iron.png');
  });

  it('notices atlases added later and skips broken ones', () => {
    const store = new AssetStore(vanilla, files({ 'assets/minecraft/atlases/broken.json': '{ nope' }));
    expect(texturePermutation(store, 'minecraft:trims/items/helmet_trim_ruby')).toBeUndefined();
    store.setEdit('assets/minecraft/atlases/items.json', enc(atlas('ruby', 'minecraft:trim/ruby')));
    expect(texturePermutation(store, 'minecraft:trims/items/helmet_trim_ruby')).toBeDefined();
  });
});

describe('recolor', () => {
  const key = [10, 10, 10, 255, 20, 20, 20, 255, 30, 30, 30, 0];
  const palette = [200, 0, 0, 255, 0, 200, 0, 128, 0, 0, 200, 255];

  it('swaps key colours for the palette colour at the same position', () => {
    expect([...recolor([10, 10, 10, 255], key, palette)!]).toEqual([200, 0, 0, 255]);
  });

  it("keeps the template's alpha, multiplied with the palette's", () => {
    expect([...recolor([10, 10, 10, 128], key, palette)!]).toEqual([200, 0, 0, 128]);
    expect([...recolor([20, 20, 20, 255], key, palette)!]).toEqual([0, 200, 0, 128]);
  });

  it('leaves other colours and transparent pixels alone', () => {
    expect([...recolor([1, 2, 3, 255], key, palette)!]).toEqual([1, 2, 3, 255]);
    expect([...recolor([10, 10, 10, 0], key, palette)!]).toEqual([10, 10, 10, 0]);
  });

  it('ignores transparent key entries', () => {
    expect([...recolor([30, 30, 30, 255], key, palette)!]).toEqual([30, 30, 30, 255]);
  });

  it('rejects palettes of different sizes', () => {
    expect(recolor([10, 10, 10, 255], key, palette.slice(4))).toBeUndefined();
  });
});
