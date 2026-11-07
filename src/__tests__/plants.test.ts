import { describe, expect, it } from 'vitest';
import { AssetStore } from '../assets/AssetStore';
import { listPlants, stemTint } from '../models/plants';

const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const files = (o: Record<string, unknown>) => new Map(Object.entries(o).map(([k, v]) => [k, enc(v)]));

const cross = { elements: [{ from: [0, 0, 8], to: [16, 16, 8], faces: { north: { texture: '#crop' } } }] };
const stage = (n: number | string) => ({ parent: 'block/crop', textures: { crop: `block/crop_stage${n}` } });
const variants = (o: Record<string, string>) => ({
  variants: Object.fromEntries(Object.entries(o).map(([k, model]) => [k, { model }])),
});

const vanilla = files({
  'assets/minecraft/lang/en_us.json': { 'block.minecraft.carrots': 'Carrots' },
  'assets/minecraft/models/block/crop.json': cross,
  'assets/minecraft/models/block/s0.json': stage(0),
  'assets/minecraft/models/block/s1.json': stage(1),
  'assets/minecraft/models/block/empty.json': { textures: { particle: 'block/crop_stage0' } },
  'assets/minecraft/textures/block/crop_stage0.png': 'png',
  'assets/minecraft/textures/block/crop_stage1.png': 'png',
  'assets/minecraft/blockstates/carrots.json': variants({ 'age=0': 'block/s0', 'age=1': 'block/s0', 'age=2': 'block/s1', 'age=10': 'block/s1' }),
  'assets/minecraft/blockstates/stone.json': variants({ '': 'block/s0' }),
  'assets/minecraft/blockstates/sapling.json': variants({ 'age=0': 'block/s0', 'age=1': 'block/s0' }),
  'assets/minecraft/blockstates/frosted_ice.json': variants({ 'age=0': 'block/s0', 'age=1': 'block/s1' }),
  'assets/minecraft/blockstates/tall.json': variants({
    'age=0,half=lower': 'block/s0',
    'age=0,half=upper': 'block/empty',
    'age=1,half=upper': 'block/s1',
    'age=1,half=lower': 'block/s0',
  }),
  'assets/minecraft/blockstates/propagule.json': variants({
    'age=0,hanging=false': 'block/s0',
    'age=1,hanging=false': 'block/s0',
    'age=0,hanging=true': 'block/s0',
    'age=1,hanging=true': 'block/s1',
  }),
  'assets/minecraft/blockstates/pod.json': {
    variants: {
      'age=0,facing=east': { model: 'block/s0', y: 90 },
      'age=1,facing=east': { model: 'block/s1', y: 90 },
      'age=0,facing=west': { model: 'block/s0', y: 270 },
      'age=1,facing=west': { model: 'block/s1', y: 270 },
    },
  },
  'assets/minecraft/blockstates/melon_stem.json': variants({ 'age=0': 'block/s0', 'age=7': 'block/s1' }),
});

const find = (store: AssetStore, id: string) => listPlants(store).find((p) => p.id === `minecraft:${id}`);

describe('plants', () => {
  it('finds blocks with more than one look over their age', () => {
    const store = new AssetStore(vanilla, new Map());
    expect(listPlants(store).map((p) => p.id.split(':')[1]).sort()).toEqual(['carrots', 'melon_stem', 'pod', 'propagule', 'tall']);
  });

  it('merges ages that share a look, in order of growth', () => {
    const carrots = find(new AssetStore(vanilla, new Map()), 'carrots')!;
    expect(carrots.name).toBe('Carrots');
    expect(carrots.stages.map((s) => s.ages)).toEqual([[0, 1], [2, 10]]);
    expect(carrots.stages.map((s) => s.textures)).toEqual([['minecraft:block/crop_stage0'], ['minecraft:block/crop_stage1']]);
  });

  it('stacks both halves and drops the ones without geometry', () => {
    const tall = find(new AssetStore(vanilla, new Map()), 'tall')!;
    expect(tall.height).toBe(2);
    expect(tall.stages[0].models.map((m) => m.ref.model)).toEqual(['minecraft:block/s0']);
    expect(tall.stages[1].models.map((m) => m.ref.model)).toEqual(['minecraft:block/s0', 'minecraft:block/s1']);
    expect(tall.stages[1].models[1].ref.transforms).toEqual([{ translation: [0, 1, 0] }]);
    expect(find(new AssetStore(vanilla, new Map()), 'carrots')!.height).toBe(1);
  });

  it('picks the placement that changes as it grows', () => {
    expect(find(new AssetStore(vanilla, new Map()), 'propagule')!.stages.map((s) => s.ages)).toEqual([[0], [1]]);
  });

  it('keeps a variant\'s rotation', () => {
    const pod = find(new AssetStore(vanilla, new Map()), 'pod')!;
    expect(pod.stages).toHaveLength(2);
    expect(pod.stages[0].models[0].ref.transforms).toContainEqual({ left_rotation: { axis: [0, 1, 0], angle: (-90 * Math.PI) / 180 } });
  });

  it('colours stems by age', () => {
    expect(stemTint(0)).toBe(0x00ff00);
    expect(stemTint(7)).toBe(0xe0c71c);
    expect(find(new AssetStore(vanilla, new Map()), 'melon_stem')!.stages[1].models[0].ref.tints).toEqual([0xe0c71c]);
  });

  it('notices edited stage textures', () => {
    const store = new AssetStore(vanilla, new Map());
    const before = find(store, 'carrots')!;
    expect(before.source).toBe('vanilla');
    store.setEdit('assets/minecraft/textures/block/crop_stage0.png', enc('new'));
    const after = find(store, 'carrots')!;
    expect(after.source).toBe('edited');
    expect(after.depsKey).not.toBe(before.depsKey);
  });

  it('reads plants a pack adds', () => {
    const pack = files({
      'assets/mymod/blockstates/rice.json': variants({ 'age=0': 'minecraft:block/s0', 'age=1': 'minecraft:block/s1' }),
    });
    const rice = listPlants(new AssetStore(vanilla, pack)).find((p) => p.id === 'mymod:rice')!;
    expect(rice.stages).toHaveLength(2);
    expect(rice.source).toBe('pack');
  });
});
