import { describe, expect, it } from 'vitest';
import { AssetStore } from '../assets/AssetStore';
import { blankPixels } from '../render/frames';
import type { Pixels } from '../render/pixelEdit';
import { convertOverrides } from '../pack/upgrade/itemOverrides';
import { applySliceOp, sliceImage, type SliceFile } from '../pack/upgrade/slices';
import { compareVersions, parseLang, planUpgrade, type UpgradeData } from '../pack/upgrade/upgrade';
import renames from '../pack/upgrade/renames.json';
import slices from '../pack/upgrade/slices.json';

const enc = (v: unknown) => new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v));
const dec = (b: Uint8Array | null | undefined) => (b ? JSON.parse(new TextDecoder().decode(b)) : b);
const files = (o: Record<string, unknown>) => new Map(Object.entries(o).map(([k, v]) => [k, v instanceof Uint8Array ? v : enc(v)]));

/** Images as raw bytes (width, height, RGBA) instead of PNG, so no canvas is needed. */
const codec = {
  async decode(b: Uint8Array): Promise<Pixels> {
    const v = new DataView(b.buffer, b.byteOffset);
    if (b[0] !== 0x52) throw new Error('not an image');
    const width = v.getUint16(1);
    const height = v.getUint16(3);
    return { width, height, data: new Uint8ClampedArray(b.slice(5)) };
  },
  async encode(p: Pixels): Promise<Uint8Array> {
    const out = new Uint8Array(5 + p.data.length);
    out[0] = 0x52;
    new DataView(out.buffer).setUint16(1, p.width);
    new DataView(out.buffer).setUint16(3, p.height);
    out.set(p.data, 5);
    return out;
  },
};

/** An image where every pixel says where it is: red = x, green = y. */
function coords(w: number, h: number): Pixels {
  const p = blankPixels(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p.data.set([x, y, 0, 255], (y * w + x) * 4);
  return p;
}
const at = (p: Pixels, x: number, y: number) => [...p.data.subarray((y * p.width + x) * 4, (y * p.width + x) * 4 + 4)];
const pngLike = async (w: number, h: number) => codec.encode(coords(w, h));

const data: UpgradeData = { renames: renames.steps as UpgradeData['renames'], slices: slices as unknown as SliceFile, langKeys: renames.langKeys };
const T = 'assets/minecraft/textures/';
const meta = (format?: number) => ({ pack: { ...(format !== undefined && { pack_format: format }), description: 'Old pack' } });

describe('upgrade data', () => {
  it('knows the flattening and later renames', () => {
    const all = new Map(data.renames.flatMap((s) => s.renames));
    expect(all.get('blocks/wool_colored_white')).toBe('block/white_wool');
    expect(all.get('blocks/stone_granite')).toBe('block/granite');
    expect(all.get('models/armor/diamond_layer_1')).toBe('entity/equipment/humanoid/diamond');
    expect(all.get('block/grass_path_top')).toBe('block/dirt_path_top');
    expect(data.langKeys!['tile.stone.stone.name']).toBe('block.minecraft.stone');
    expect(Object.keys(data.slices.stages)).toEqual(['1.14', '1.20.2', '1.20.5', '26.2']);
  });

  it('orders game versions', () => {
    expect(['26.2', '1.14.4', '1.13.3', '1.14', '1.9.4'].sort(compareVersions)).toEqual(['1.9.4', '1.13.3', '1.14', '1.14.4', '26.2']);
  });

  it('reads .lang files', () => {
    expect(parseLang('﻿# comment\ntile.stone.name=Stone\n\nitem.x.name=a=b\r\n')).toEqual({ 'tile.stone.name': 'Stone', 'item.x.name': 'a=b' });
  });
});

describe('slicer operations', () => {
  it('rotates and mirrors like Java2D', () => {
    const p = coords(3, 2);
    // clockwise: the bottom-left pixel becomes the top-left one
    expect(at(applySliceOp(p, ['rotate90']), 0, 0)).toEqual([0, 1, 0, 255]);
    expect(applySliceOp(p, ['rotate90']).width).toBe(2);
    expect(at(applySliceOp(p, ['rotate270']), 0, 0)).toEqual([2, 0, 0, 255]);
    expect(at(applySliceOp(p, ['rotate180']), 0, 0)).toEqual([2, 1, 0, 255]);
    expect(at(applySliceOp(p, ['mirrorVertically']), 0, 0)).toEqual([0, 1, 0, 255]);
    expect(at(applySliceOp(p, ['flipFrameAxis', 3]), 0, 2)).toEqual([1, 0, 0, 255]);
    const sq = applySliceOp(coords(4, 2), ['square']);
    expect([sq.width, sq.height, at(sq, 0, 1)]).toEqual([4, 4, [0, 0, 0, 255]]);
  });

  it('cuts boxes scaled to the image size', () => {
    const out = { path: 'x', box: [0, 66, 200, 20, 256, 256] as [number, number, number, number, number, number], ops: [] };
    const img = sliceImage(coords(512, 512), out);
    expect([img.width, img.height]).toEqual([400, 40]);
    expect(at(img, 0, 0)).toEqual([0, 132 & 255, 0, 255]);
  });

  it('puts multipart images together', () => {
    const out = { path: 'x', size: [4, 4] as [number, number], ops: [], parts: [{ box: [1, 1, 2, 1, 8, 8] as [number, number, number, number, number, number], ops: [], at: [2, 3] as [number, number] }] };
    const img = sliceImage(coords(8, 8), out);
    expect([img.width, at(img, 2, 3), at(img, 3, 3), at(img, 0, 0)[3]]).toEqual([4, [1, 1, 0, 255], [2, 1, 0, 255], 0]);
  });
});

describe('item overrides', () => {
  const base = { type: 'minecraft:model', model: 'minecraft:item/stick' };

  it('turns custom_model_data lists into one range_dispatch', () => {
    const { model, unknown } = convertOverrides(
      [
        { predicate: { custom_model_data: 1 }, model: 'item/wand' },
        { predicate: { custom_model_data: 2 }, model: 'custom:item/staff' },
      ],
      base,
      'stick',
    );
    expect(unknown).toEqual([]);
    expect(model).toEqual({
      type: 'minecraft:range_dispatch',
      property: 'minecraft:custom_model_data',
      entries: [
        { threshold: 1, model: { type: 'minecraft:model', model: 'minecraft:item/wand' } },
        { threshold: 2, model: { type: 'minecraft:model', model: 'custom:item/staff' } },
      ],
      fallback: base,
    });
  });

  it('lets the last matching entry win, like the game did', () => {
    const { model } = convertOverrides(
      [
        { predicate: { pulling: 1 }, model: 'item/bow_pulling_0' },
        { predicate: { pulling: 1, pull: 0.65 }, model: 'item/bow_pulling_1' },
      ],
      base,
      'bow',
    );
    // outermost: the second entry (pulling and pull ≥ 0.65), falling back to the first
    expect(model.type).toBe('minecraft:condition');
    expect(model.property).toBe('minecraft:using_item');
    expect(model.on_true).toMatchObject({ property: 'minecraft:use_duration', scale: 0.05, entries: [{ threshold: 0.65 }] });
    expect(model.on_true.fallback).toMatchObject({ property: 'minecraft:using_item', on_true: { model: 'minecraft:item/bow_pulling_0' } });
    expect(model.on_false).toEqual(model.on_true.fallback);
  });

  it('reports predicates it cannot convert and maps trims', () => {
    const { model, unknown } = convertOverrides([{ predicate: { mystery: 1 }, model: 'a' }, { predicate: { trim_type: 0.85 }, model: 'b' }], base, 'iron_helmet');
    expect(unknown).toEqual(['mystery']);
    expect(model).toMatchObject({ property: 'minecraft:trim_material', cases: [{ when: ['minecraft:lapis', 'minecraft:amethyst'] }], fallback: base });
  });
});

describe('planUpgrade', () => {
  const vanillaFiles = async () =>
    new Map([
      [`${T}block/white_wool.png`, await pngLike(16, 16)],
      [`${T}block/stone.png`, await pngLike(16, 16)],
      [`${T}gui/sprites/widget/button.png`, await pngLike(200, 20)],
      [`${T}gui/sprites/hud/hotbar.png`, await pngLike(182, 22)],
      [`${T}block/light_gray_bed_head_up.png`, await pngLike(16, 16)],
      ['assets/minecraft/items/stick.json', enc({ model: { type: 'minecraft:model', model: 'minecraft:item/stick' } })],
    ]);

  it('moves renamed textures, their .mcmeta and model references', async () => {
    const store = new AssetStore(
      await vanillaFiles(),
      files({
        'pack.mcmeta': meta(3),
        [`${T}blocks/wool_colored_white.png`]: await pngLike(16, 16),
        [`${T}blocks/wool_colored_white.png.mcmeta`]: { animation: {} },
        [`${T}blocks/my_block.png`]: await pngLike(16, 16),
        'assets/minecraft/models/block/thing.json': { parent: 'block/cube_all', textures: { all: 'blocks/wool_colored_white', side: 'minecraft:blocks/stone', top: 'blocks/my_block', x: '#all', o: 'mod:blocks/a' } },
      }),
    );
    const plan = await planUpgrade(store, 97, data, codec);
    expect(plan.changes.get(`${T}blocks/wool_colored_white.png`)).toBeNull();
    expect(plan.changes.has(`${T}block/white_wool.png`)).toBe(true);
    expect(plan.changes.has(`${T}block/white_wool.png.mcmeta`)).toBe(true);
    expect(plan.changes.has(`${T}block/my_block.png`)).toBe(true);
    expect(dec(plan.changes.get('assets/minecraft/models/block/thing.json')).textures).toEqual({ all: 'block/white_wool', side: 'minecraft:block/stone', top: 'block/my_block', x: '#all', o: 'mod:blocks/a' });
    expect(dec(plan.changes.get('pack.mcmeta')).pack).toEqual({ pack_format: 97, min_format: 97, max_format: 97, description: 'Old pack' });
  });

  it('follows a texture through several versions', async () => {
    // 1.12 silver bed → 1.13 light_gray bed → 26.2 block textures cut from it
    const store = new AssetStore(await vanillaFiles(), files({ 'pack.mcmeta': meta(3), [`${T}entity/bed/silver.png`]: await pngLike(64, 64) }));
    const plan = await planUpgrade(store, 97, data, codec);
    const head = await codec.decode(plan.changes.get(`${T}block/light_gray_bed_head_up.png`)!);
    expect([head.width, at(head, 0, 0)]).toEqual([16, [6, 6, 0, 255]]);
    // the bed texture itself isn't read any more and goes
    expect(plan.changes.get(`${T}entity/bed/silver.png`)).toBeNull();
    expect(plan.changes.has(`${T}entity/bed/light_gray.png`)).toBe(false);
  });

  it('cuts widgets.png into sprites, with their GUI scaling', async () => {
    const store = new AssetStore(await vanillaFiles(), files({ 'pack.mcmeta': meta(15), [`${T}gui/widgets.png`]: await pngLike(256, 256) }));
    const plan = await planUpgrade(store, 97, data, codec);
    const button = await codec.decode(plan.changes.get(`${T}gui/sprites/widget/button.png`)!);
    expect([button.width, button.height, at(button, 0, 0)]).toEqual([200, 20, [0, 66, 0, 255]]);
    expect(dec(plan.changes.get(`${T}gui/sprites/widget/button.png.mcmeta`)).gui.scaling.type).toBe('nine_slice');
    expect(plan.changes.has(`${T}gui/sprites/hud/hotbar.png`)).toBe(true);
    // only sprites the loaded game reads
    expect(plan.changes.has(`${T}gui/sprites/widget/locked_button.png`)).toBe(false);
    expect(plan.groups.slices[0].from).toBe(`${T}gui/widgets.png`);
  });

  it('leaves newer packs and new sprites alone', async () => {
    const store = new AssetStore(
      await vanillaFiles(),
      files({ 'pack.mcmeta': meta(97), [`${T}gui/widgets.png`]: await pngLike(256, 256), [`${T}blocks/wool_colored_white.png`]: await pngLike(16, 16) }),
    );
    const plan = await planUpgrade(store, 97, data, codec);
    expect(plan.changes.size).toBe(0);
  });

  it('without a format, only treats files the game no longer reads as old', async () => {
    const store = new AssetStore(
      await vanillaFiles(),
      files({ [`${T}gui/widgets.png`]: await pngLike(256, 256), [`${T}gui/sprites/widget/button.png`]: await pngLike(200, 20), [`${T}block/stone.png`]: await pngLike(16, 16) }),
    );
    const plan = await planUpgrade(store, 97, data, codec);
    // the pack has new sprites already: widgets.png is a leftover, not converted
    expect(plan.groups.slices).toEqual([]);
    expect([...plan.changes.keys()]).toEqual(['pack.mcmeta']);
  });

  it('converts .lang files with the new keys', async () => {
    const store = new AssetStore(await vanillaFiles(), files({ 'pack.mcmeta': meta(3), 'assets/minecraft/lang/en_US.lang': 'tile.stone.stone.name=Rock\nmy.key=Mine' }));
    const plan = await planUpgrade(store, 97, data, codec);
    expect(dec(plan.changes.get('assets/minecraft/lang/en_us.json'))).toEqual({ 'block.minecraft.stone': 'Rock', 'my.key': 'Mine' });
    expect(plan.changes.get('assets/minecraft/lang/en_US.lang')).toBeNull();
  });

  it('writes item definitions for old overrides on top of the game definition', async () => {
    const store = new AssetStore(
      await vanillaFiles(),
      files({ 'pack.mcmeta': meta(34), 'assets/minecraft/models/item/stick.json': { parent: 'item/handheld', overrides: [{ predicate: { custom_model_data: 7 }, model: 'item/wand' }] } }),
    );
    const plan = await planUpgrade(store, 97, data, codec);
    const def = dec(plan.changes.get('assets/minecraft/items/stick.json'));
    expect(def.model).toMatchObject({ property: 'minecraft:custom_model_data', entries: [{ threshold: 7 }], fallback: { model: 'minecraft:item/stick' } });
  });

  it('can leave parts out and lists textures that need redrawing', async () => {
    const store = new AssetStore(
      await vanillaFiles(),
      files({ 'pack.mcmeta': meta(4), [`${T}entity/chest/normal_double.png`]: await pngLike(128, 64), [`${T}gui/widgets.png`]: await pngLike(256, 256) }),
    );
    const plan = await planUpgrade(store, 97, data, codec, new Set(['renames', 'format']));
    expect(plan.groups.slices).toEqual([]);
    expect(plan.redraw.map((r) => r.path)).toContain(`${T}entity/chest/normal_double.png`);
    expect(plan.redraw.find((r) => r.path.endsWith('widgets.png'))?.version).toBe('1.20.2');
  });
});
