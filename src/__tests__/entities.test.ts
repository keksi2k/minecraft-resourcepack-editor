import { describe, expect, it } from 'vitest';
import { MOBS, mobsForTexture } from '../entities/catalog';
import { ENTITY_MODELS, layerUVRects } from '../render/entityMesh';

describe('entity catalog', () => {
  it('only references generated model layers', () => {
    const missing = MOBS.flatMap((m) => m.layers.filter((l) => !ENTITY_MODELS[l.model]).map((l) => `${m.id}: ${l.model}`));
    expect(missing).toEqual([]);
  });

  it('has unique ids', () => {
    expect(new Set(MOBS.map((m) => m.id)).size).toBe(MOBS.length);
  });

  it('finds mobs by texture', () => {
    expect(mobsForTexture('minecraft:entity/spider/spider_eyes').map((m) => m.mob.id)).toEqual(['spider', 'cave_spider']);
  });
});

describe('UV rects', () => {
  it('matches the classic creeper layout', () => {
    const { tex, rects } = layerUVRects('minecraft:creeper#main')!;
    expect(tex).toEqual([64, 32]);
    const head = rects.filter((r) => r.part === 'head');
    expect(head).toHaveLength(6);
    // face (north) at u+d, v+d = (8, 8), 8×8
    expect(head).toContainEqual({ part: 'head', x0: 8, y0: 8, x1: 16, y1: 16 });
    // top at (8, 0)
    expect(head).toContainEqual({ part: 'head', x0: 8, y0: 0, x1: 16, y1: 8 });
    expect(rects.filter((r) => r.part === 'body')).toContainEqual({ part: 'body', x0: 20, y0: 20, x1: 28, y1: 32 });
  });

  it('keeps every rect inside the texture', () => {
    for (const key of Object.keys(ENTITY_MODELS)) {
      const { tex, rects } = layerUVRects(key)!;
      for (const r of rects) {
        expect(r.x0, key).toBeGreaterThanOrEqual(0);
        expect(r.y0, key).toBeGreaterThanOrEqual(0);
        expect(r.x1, key).toBeLessThanOrEqual(tex[0]);
        expect(r.y1, key).toBeLessThanOrEqual(tex[1]);
      }
    }
  });
});

describe('special models', () => {
  it('maps special item models to layers and textures', async () => {
    const { specialLayers } = await import('../entities/specials');
    expect(specialLayers({ type: 'chest', texture: 'minecraft:trapped' })).toEqual([
      { model: 'minecraft:chest#main', texture: 'minecraft:entity/chest/trapped' },
    ]);
    expect(specialLayers({ type: 'head', kind: 'piglin' })?.[0]).toEqual({ model: 'minecraft:piglin_head#main', texture: 'minecraft:entity/piglin/piglin' });
    expect(specialLayers({ type: 'banner', color: 'red' })?.[2]).toMatchObject({ texture: 'minecraft:entity/banner/base', tint: 0xb02e26 });
    expect(specialLayers({ type: 'shulker_box', texture: 'minecraft:shulker_red' })?.[0].texture).toBe('minecraft:entity/shulker/shulker_red');
    expect(specialLayers({ type: 'copper_golem_statue', pose: 'star', texture: 'minecraft:textures/entity/copper_golem/copper_golem_oxidized.png' })).toEqual([
      { model: 'minecraft:copper_golem_star#main', texture: 'minecraft:entity/copper_golem/copper_golem_oxidized', rootPose: { y: 0, zRot: Math.PI } },
    ]);
    expect(specialLayers({ type: 'bell' })).toBeUndefined();
    const all = [
      { type: 'chest' }, { type: 'shield' }, { type: 'banner' }, { type: 'player_head' }, { type: 'head', kind: 'dragon' },
      { type: 'shulker_box' }, { type: 'decorated_pot' }, { type: 'conduit' }, { type: 'trident' },
      ...['standing', 'sitting', 'running', 'star'].map((pose) => ({ type: 'copper_golem_statue', pose, texture: 'minecraft:textures/entity/copper_golem/copper_golem.png' })),
    ];
    for (const s of all) {
      for (const l of specialLayers(s)!) expect(ENTITY_MODELS[l.model], l.model).toBeDefined();
    }
  });

  it('adds banner and shield pattern layers on top of the base colour', async () => {
    const { specialLayers, availablePatterns } = await import('../entities/specials');
    const patterns = [{ pattern: 'creeper', color: 'black' }, { pattern: 'border', color: 'red' }];
    const banner = specialLayers({ type: 'banner', color: 'blue' }, { patterns })!;
    expect(banner.slice(2).map((l) => [l.texture, l.tint])).toEqual([
      ['minecraft:entity/banner/base', 0x3c44aa],
      ['minecraft:entity/banner/creeper', 0x1d1d21],
      ['minecraft:entity/banner/border', 0xb02e26],
    ]);
    // plain shield, then patterned shield: base plate texture changes and patterns only cover the plate
    expect(specialLayers({ type: 'shield' })!.map((l) => l.texture)).toEqual(['minecraft:entity/shield/shield_base_nopattern']);
    const shield = specialLayers({ type: 'shield' }, { patterns })!;
    expect(shield[0].texture).toBe('minecraft:entity/shield/shield_base');
    expect(shield.slice(1).map((l) => [l.texture, l.part])).toEqual([
      ['minecraft:entity/shield/base', 'plate'],
      ['minecraft:entity/shield/creeper', 'plate'],
      ['minecraft:entity/shield/border', 'plate'],
    ]);
    expect(specialLayers({ type: 'shield' }, { baseColor: 'lime' })![1]).toMatchObject({ tint: 0x80c71f });
    const files = ['base', 'banner_base', 'creeper', 'border', 'flow'].map((p) => `assets/minecraft/textures/entity/banner/${p}.png`);
    expect(availablePatterns([...files, 'assets/minecraft/textures/entity/banner/x.png.mcmeta'], 'banner')).toEqual(['border', 'creeper', 'flow']);
  });

  it('puts pottery sherds on the matching pot sides', async () => {
    const { specialLayers } = await import('../entities/specials');
    const pot = specialLayers({ type: 'decorated_pot' }, { sherds: { back: 'skull_pottery_pattern' } })!;
    expect(pot.slice(1).map((l) => [l.part, l.texture])).toEqual([
      ['front', 'minecraft:entity/decorated_pot/decorated_pot_side'],
      ['back', 'minecraft:entity/decorated_pot/skull_pottery_pattern'],
      ['left', 'minecraft:entity/decorated_pot/decorated_pot_side'],
      ['right', 'minecraft:entity/decorated_pot/decorated_pot_side'],
    ]);
  });

  it('turns a transformation into a matrix (head: 180° about X, then moved to the block centre)', async () => {
    const THREE = await import('three');
    const { transformationMatrix } = await import('../render/transformation');
    const m = transformationMatrix({ left_rotation: [1, 0, 0, 0], translation: [0.5, 0, 0.5] });
    const p = new THREE.Vector3(0, -1, 0).applyMatrix4(m);
    expect([p.x, p.y, p.z].map((v) => Math.round(v * 1000) / 1000)).toEqual([0.5, 1, 0.5]);
  });
});
