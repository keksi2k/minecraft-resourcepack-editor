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
