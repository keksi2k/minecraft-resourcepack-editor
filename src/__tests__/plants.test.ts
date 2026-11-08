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
  'assets/minecraft/models/block/cube.json': { elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { north: { texture: '#all' } } }] },
  'assets/minecraft/models/block/rock.json': { parent: 'block/cube', textures: { all: 'block/rock' } },
  'assets/minecraft/models/block/cross.json': cross,
  'assets/minecraft/models/block/poppy.json': { parent: 'block/cross', textures: { crop: 'block/poppy' } },
  'assets/minecraft/models/block/web.json': { parent: 'block/cross', textures: { crop: 'block/web' } },
  'assets/minecraft/models/block/thin.json': { parent: 'block/cube', textures: { all: 'block/stalk' } },
  'assets/minecraft/models/block/thick.json': { parent: 'block/cube', textures: { all: 'block/stalk' } },
  'assets/minecraft/models/block/small_leaves.json': { parent: 'block/cross', textures: { crop: 'block/small_leaves' } },
  'assets/minecraft/models/block/large_leaves.json': { parent: 'block/cross', textures: { crop: 'block/large_leaves' } },
  'assets/minecraft/models/block/empty.json': { textures: { particle: 'block/crop_stage0' } },
  'assets/minecraft/textures/block/crop_stage0.png': 'png',
  'assets/minecraft/textures/block/crop_stage1.png': 'png',
  'assets/minecraft/blockstates/carrots.json': variants({ 'age=0': 'block/s0', 'age=1': 'block/s0', 'age=2': 'block/s1', 'age=10': 'block/s1' }),
  'assets/minecraft/blockstates/stone.json': variants({ '': 'block/rock' }),
  'assets/minecraft/blockstates/poppy.json': variants({ '': 'block/poppy' }),
  'assets/minecraft/blockstates/cobweb.json': variants({ '': 'block/web' }),
  'assets/minecraft/blockstates/cactus.json': variants({ '': 'block/rock' }),
  'assets/minecraft/blockstates/cave_vines.json': variants({ 'age=0,berries=false': 'block/s0', 'age=0,berries=true': 'block/s1', 'age=1,berries=false': 'block/s0', 'age=1,berries=true': 'block/s1' }),
  'assets/minecraft/blockstates/bamboo.json': {
    multipart: [
      { when: { age: '0' }, apply: [{ model: 'block/thin' }, { model: 'block/thin', y: 90 }] },
      { when: { age: '1' }, apply: { model: 'block/thick' } },
      { when: { leaves: 'small' }, apply: { model: 'block/small_leaves' } },
      { when: { leaves: 'large' }, apply: { model: 'block/large_leaves' } },
    ],
  },
  'assets/minecraft/blockstates/vine.json': {
    multipart: [
      { when: { north: 'true' }, apply: { model: 'block/s0' } },
      { when: { east: 'true' }, apply: { model: 'block/s0', y: 90 } },
    ],
  },
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
    const growing = listPlants(store).filter((p) => p.stages.length > 1);
    expect(growing.map((p) => p.id.split(':')[1]).sort()).toEqual(['bamboo', 'carrots', 'cave_vines', 'melon_stem', 'pod', 'propagule', 'tall']);
  });

  it("lists plants that don't grow, but not other blocks drawn like them", () => {
    const ids = listPlants(new AssetStore(vanilla, new Map())).map((p) => p.id.split(':')[1]);
    expect(ids).toEqual(expect.arrayContaining(['poppy', 'sapling', 'cactus', 'vine']));
    expect(ids).not.toContain('stone');
    expect(ids).not.toContain('cobweb');
    expect(ids).not.toContain('frosted_ice');
    const poppy = find(new AssetStore(vanilla, new Map()), 'poppy')!;
    expect(poppy.property).toBeUndefined();
    expect(poppy.stages).toHaveLength(1);
    expect(poppy.stages[0].textures).toEqual(['minecraft:block/poppy']);
  });

  it('grows by the property that changes its look', () => {
    const vines = find(new AssetStore(vanilla, new Map()), 'cave_vines')!;
    expect(vines.property).toBe('berries');
    expect(vines.stages.map((s) => s.values)).toEqual([['false'], ['true']]);
  });

  it('reads multipart block states', () => {
    const bamboo = find(new AssetStore(vanilla, new Map()), 'bamboo')!;
    expect(bamboo.stages).toHaveLength(2);
    expect(bamboo.textures).toEqual(expect.arrayContaining(['minecraft:block/stalk', 'minecraft:block/small_leaves', 'minecraft:block/large_leaves']));
    const vine = find(new AssetStore(vanilla, new Map()), 'vine')!;
    // on one side, as it usually hangs
    expect(vine.stages[0].models).toHaveLength(1);
  });

  it('merges ages that share a look, in order of growth', () => {
    const carrots = find(new AssetStore(vanilla, new Map()), 'carrots')!;
    expect(carrots.name).toBe('Carrots');
    expect(carrots.property).toBe('age');
    expect(carrots.stages.map((s) => s.values)).toEqual([['0', '1'], ['2', '10']]);
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
    expect(find(new AssetStore(vanilla, new Map()), 'propagule')!.stages.map((s) => s.values)).toEqual([['0'], ['1']]);
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
