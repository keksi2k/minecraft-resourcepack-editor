// Runs the resolvers over a real client jar: MC_JAR=path/to/client.jar npx vitest run vanilla
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { AssetStore } from '../assets/AssetStore';
import { MOBS } from '../entities/catalog';
import { availablePatterns, availableSherds, specialLayers } from '../entities/specials';
import { ENTITY_MODELS } from '../render/entityMesh';
import type { ItemState } from '../models/itemDefinition';
import { itemStateSwitches, listItems, resolveItemModels } from '../models/items';
import { texturePath } from '../models/resourceLocation';

const jarPath = process.env.MC_JAR;

describe.skipIf(!jarPath)('vanilla client jar', () => {
  it('resolves every item to a drawable model', async () => {
    const zip = await JSZip.loadAsync(readFileSync(jarPath!));
    const files = new Map<string, Uint8Array>();
    for (const f of Object.values(zip.files)) {
      if (!f.dir && /^assets\/[^/]+\/(textures|models|items)\/|^assets\/minecraft\/lang\/en_us\.json$/.test(f.name)) {
        files.set(f.name, await f.async('uint8array'));
      }
    }
    const store = new AssetStore(files, new Map());
    const t0 = performance.now();
    const items = listItems(store);
    const ms = performance.now() - t0;

    const kinds: Record<string, number> = {};
    for (const i of items) for (const m of i.models) kinds[m.model.kind] = (kinds[m.model.kind] ?? 0) + 1;
    const noModels = items.filter((i) => i.models.length === 0).map((i) => i.id);
    const missingTex = items.filter((i) => i.id !== 'minecraft:air').flatMap((i) => i.textures.filter((t) => !store.has(texturePath(t))).map((t) => `${i.id} -> ${t}`));
    const special = [...new Set(items.flatMap((i) => i.models.filter((m) => m.ref.special).map((m) => m.ref.special)))];
    console.log({ items: items.length, ms: Math.round(ms), kinds, noModels, missingTex: missingTex.slice(0, 20), special });

    expect(items.length).toBeGreaterThan(1000);
    expect(items.filter((i) => i.models.some((m) => m.model.kind === 'missing'))).toEqual([]);
    expect(missingTex).toEqual([]);

    const mobTextures = MOBS.flatMap((m) => m.layers.map((l) => l.texture)).filter((t) => !store.has(texturePath(t)));
    expect(mobTextures).toEqual([]);

    // supported special models must reference existing layers and textures
    const specials = items.flatMap((i) => i.models.filter((m) => m.ref.special && specialLayers(m.ref.special)).map((m) => ({ id: i.id, layers: specialLayers(m.ref.special!)! })));
    console.log({ supportedSpecials: specials.length });
    expect(specials.length).toBeGreaterThan(30);
    const broken = specials.flatMap(({ id, layers }) =>
      layers.filter((l) => !ENTITY_MODELS[l.model] || !store.has(texturePath(l.texture))).map((l) => `${id}: ${l.model} ${l.texture}`),
    );
    expect(broken).toEqual([]);

    // every special model in vanilla is drawn, in every display context
    const unsupported = new Set<string>();
    for (const item of items) {
      for (const context of ['gui', 'thirdperson_righthand', 'ground'] as const) {
        for (const m of resolveItemModels(store, item.id, context)) {
          if (m.ref.special && !specialLayers(m.ref.special)) unsupported.add(m.ref.special.type);
        }
      }
    }
    expect([...unsupported]).toEqual([]);

    // every state of every item shows existing models and textures
    let states = 0;
    const badStates: string[] = [];
    for (const item of items) {
      const seen = new Set<string>();
      const todo: ItemState[] = [{}];
      while (todo.length && seen.size < 300) {
        const state = todo.pop()!;
        const key = JSON.stringify(state);
        if (seen.has(key)) continue;
        seen.add(key);
        for (const m of resolveItemModels(store, item.id, 'gui', state)) {
          const layers = m.ref.special && specialLayers(m.ref.special);
          if (m.model.kind === 'missing' || (m.ref.special && !layers)) badStates.push(`${item.id} ${key} ${m.ref.model}`);
        }
        for (const s of itemStateSwitches(store, item.id, state)) for (const o of s.options) todo.push({ ...state, [s.key]: o.value });
      }
      states += seen.size;
    }
    console.log({ states });
    expect(badStates).toEqual([]);
    expect(states).toBeGreaterThan(items.length + 500);

    const bowSwitches = itemStateSwitches(store, 'minecraft:bow', {});
    const bowInUse = { [bowSwitches[0].key]: 'true' };
    const pull = itemStateSwitches(store, 'minecraft:bow', bowInUse)[1];
    expect(resolveItemModels(store, 'minecraft:bow', 'gui', { ...bowInUse, [pull.key]: pull.options.at(-1)!.value })[0].ref.model).toBe('minecraft:item/bow_pulling_2');
    expect(itemStateSwitches(store, 'minecraft:compass', {}).map((s) => s.property)).toEqual(['has_component', 'compass']);

    // every pattern exists for banners and shields
    const paths = store.list('assets/minecraft/textures/entity/');
    const bannerPatterns = availablePatterns(paths, 'banner');
    expect(bannerPatterns.length).toBeGreaterThan(30);
    expect(availablePatterns(paths, 'shield')).toEqual(bannerPatterns);
    expect(availableSherds(paths).length).toBeGreaterThan(15);

    const bed = items.find((i) => i.id === 'minecraft:red_bed')!;
    expect(bed.models.map((m) => m.ref.transforms?.length ?? 0)).toEqual([0, 1]);
  }, 120_000);
});
