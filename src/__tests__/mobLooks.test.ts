import { describe, expect, it } from 'vitest';
import { AssetStore } from '../assets/AssetStore';
import { MOBS } from '../entities/catalog';
import { equipmentFor, mobCapabilities, mobLayers } from '../entities/equipment';
import { mergePoses, motionPose } from '../entities/motion';
import { ENTITY_MODELS } from '../render/entityMesh';

const enc = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
const store = new AssetStore(
  new Map([
    ['assets/minecraft/equipment/iron.json', enc({ layers: { humanoid: [{ texture: 'minecraft:iron' }], humanoid_leggings: [{ texture: 'minecraft:iron' }], horse_body: [{ texture: 'minecraft:iron' }] } })],
    ['assets/minecraft/equipment/leather.json', enc({ layers: { humanoid: [{ texture: 'minecraft:leather', dyeable: { color_when_undyed: -6265536 } }, { texture: 'minecraft:leather_overlay' }] } })],
    ['assets/minecraft/equipment/saddle.json', enc({ layers: { pig_saddle: [{ texture: 'minecraft:saddle' }], horse_saddle: [{ texture: 'minecraft:saddle' }] } })],
    ['assets/minecraft/equipment/red_carpet.json', enc({ layers: { llama_body: [{ texture: 'minecraft:red' }] } })],
    ['assets/minecraft/textures/entity/villager/profession/farmer.png.mcmeta', enc({ villager: { hat: 'full' } })],
  ]),
  new Map(),
);
const mob = (id: string) => MOBS.find((m) => m.id === id)!;
const textures = (id: string, o: Parameters<typeof mobLayers>[2]) => mobLayers(store, mob(id), o).map((l) => `${l.model} ${l.texture}${l.tint !== undefined ? ` #${l.tint.toString(16)}` : ''}`);

describe('mob equipment', () => {
  it('knows what each mob can wear', () => {
    expect(mobCapabilities(mob('zombie')).armor).toEqual(['helmet', 'chestplate', 'leggings', 'boots']);
    expect(mobCapabilities(mob('creeper'))).toMatchObject({ armor: [], charged: true, saddle: false });
    expect(mobCapabilities(mob('pig'))).toMatchObject({ saddle: true });
    expect(mobCapabilities(mob('pig_baby'))).toMatchObject({ saddle: false });
    expect(mobCapabilities(mob('horse'))).toMatchObject({ body: 'horse_body', saddle: true, markings: true });
    expect(mobCapabilities(mob('villager_baby'))).toMatchObject({ villager: true, profession: false });
    expect(equipmentFor(store, 'humanoid')).toEqual(['minecraft:iron', 'minecraft:leather']);
  });

  it('adds armour, saddles and carpets from the equipment assets', () => {
    expect(textures('zombie', { armor: { helmet: 'minecraft:leather', leggings: 'minecraft:iron' } }).slice(1)).toEqual([
      'minecraft:zombie#helmet minecraft:entity/equipment/humanoid/leather #a06540',
      'minecraft:zombie#helmet minecraft:entity/equipment/humanoid/leather_overlay',
      'minecraft:zombie#leggings minecraft:entity/equipment/humanoid_leggings/iron',
    ]);
    expect(textures('pig', { saddle: true }).slice(1)).toEqual(['minecraft:pig#saddle minecraft:entity/equipment/pig_saddle/saddle']);
    expect(textures('horse', { body: 'minecraft:iron', markings: 'whitedots' }).slice(1)).toEqual([
      'minecraft:horse#main minecraft:entity/horse/horse_markings_whitedots',
      'minecraft:horse_armor#main minecraft:entity/equipment/horse_body/iron',
    ]);
    // a trader llama's decor gives way to the carpet
    expect(textures('trader_llama', { body: 'minecraft:red_carpet' }).slice(1)).toEqual(['minecraft:llama#decor minecraft:entity/equipment/llama_body/red']);
    expect(textures('wolf', { collar: 'blue' }).at(-1)).toBe('minecraft:wolf#main minecraft:entity/wolf/wolf_collar #3c44aa');
    expect(textures('creeper', { charged: true }).at(-1)).toBe('minecraft:creeper#armor minecraft:entity/creeper/creeper_armor #808080');
  });

  it('dresses villagers like the game, hiding the biome hat under a full profession hat', () => {
    expect(textures('villager', { villagerType: 'desert', profession: 'librarian', level: 'gold' })).toEqual([
      'minecraft:villager#main minecraft:entity/villager/villager',
      'minecraft:villager#main minecraft:entity/villager/type/desert',
      'minecraft:villager#main minecraft:entity/villager/profession/librarian',
      'minecraft:villager#main minecraft:entity/villager/profession_level/gold',
    ]);
    expect(textures('villager', { profession: 'farmer' })[1]).toBe('minecraft:villager_no_hat#main minecraft:entity/villager/type/plains');
    expect(textures('villager', { profession: 'nitwit' })).toHaveLength(3);
    expect(textures('villager_baby', { villagerType: 'snow', profession: 'farmer' })).toEqual([
      'minecraft:villager_baby#main minecraft:entity/villager/villager_baby',
      'minecraft:villager_baby#main minecraft:entity/villager/baby/snow',
    ]);
  });

  it('only uses model layers that exist', () => {
    const all = { saddle: true, body: 'minecraft:iron', collar: 'red', charged: true, armor: { helmet: 'minecraft:iron', chestplate: 'minecraft:iron', leggings: 'minecraft:iron', boots: 'minecraft:iron' } };
    const missing = MOBS.flatMap((m) => mobLayers(store, m, all).filter((l) => !ENTITY_MODELS[l.model]).map((l) => `${m.id}: ${l.model}`));
    expect(missing).toEqual([]);
  });
});

describe('mob motion', () => {
  it('stands still, looks around and walks with diagonal leg pairs', () => {
    expect(motionPose(['head', 'right_leg'], 10, 'still')).toEqual({});
    const look = motionPose(['head', 'right_leg', 'left_wing'], 10, 'look');
    expect(Object.keys(look).sort()).toEqual(['head', 'left_wing']);
    const walk = motionPose(['right_hind_leg', 'left_front_leg', 'left_hind_leg', 'right_front_leg', 'right_arm', 'left_leg'], 3, 'walk');
    expect(walk.right_hind_leg[0]).toBeCloseTo(walk.left_front_leg[0]);
    expect(walk.left_hind_leg[0]).toBeCloseTo(-walk.right_hind_leg[0]);
    expect(walk.right_front_leg[0]).toBeCloseTo(walk.left_hind_leg[0]);
    // arms swing against the leg on the same side
    expect(walk.right_arm[0]).toBeCloseTo(walk.left_leg[0] / 1.4);
  });

  it('adds animation on top of a fixed pose', () => {
    expect(mergePoses({ right_arm: [-1, 0, 0] }, { right_arm: [0.5, 0, 0], head: [0, 1, 0] })).toEqual({ right_arm: [-0.5, 0, 0], head: [0, 1, 0] });
  });
});
