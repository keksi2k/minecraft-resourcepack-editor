import type { AssetStore } from '../assets/AssetStore';
import { parseRL } from '../models/resourceLocation';
import type { MobDef, MobLayer } from './catalog';
import models from './entityModels.json';
import { DYE } from './specials';
import { isPlayer, playerLayers, type PlayerOptions } from './player';

/**
 * What a mob wears or carries in the preview: armour, body armour, saddle, collar, horse markings,
 * villager biome and profession, the charged glow, mooshroom mushrooms. In game this comes from
 * the entity's data, not the pack; the textures (and `equipment/*.json` assets) do come from the
 * pack, so the preview shows the pack's own versions.
 */

export const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'] as const;
export type ArmorSlot = (typeof ARMOR_SLOTS)[number];

export const HORSE_MARKINGS = ['white', 'whitefield', 'whitedots', 'blackdots'] as const;
export const VILLAGER_TYPES = ['plains', 'desert', 'jungle', 'savanna', 'snow', 'swamp', 'taiga'] as const;
export const PROFESSIONS = [
  'none', 'armorer', 'butcher', 'cartographer', 'cleric', 'farmer', 'fisherman', 'fletcher',
  'leatherworker', 'librarian', 'mason', 'nitwit', 'shepherd', 'toolsmith', 'weaponsmith',
] as const;
export const PROFESSION_LEVELS = ['stone', 'iron', 'gold', 'emerald', 'diamond'] as const;

export interface MobOptions extends PlayerOptions {
  /** Equipment asset id (e.g. `minecraft:iron`) per armour slot. */
  armor?: Partial<Record<ArmorSlot, string>>;
  /** Equipment asset id for body armour, a llama's carpet or a happy ghast's harness. */
  body?: string;
  saddle?: boolean;
  /** Dye colour name of a wolf's or cat's collar. */
  collar?: string;
  markings?: (typeof HORSE_MARKINGS)[number];
  villagerType?: (typeof VILLAGER_TYPES)[number];
  profession?: (typeof PROFESSIONS)[number];
  level?: (typeof PROFESSION_LEVELS)[number];
  /** Charged creeper / wither below half health. */
  charged?: boolean;
  /** A mooshroom's mushrooms; shown unless this is false (sheared). */
  mushrooms?: boolean;
}

const MODELS = models as unknown as Record<string, unknown>;
const has = (key: string) => key in MODELS;
const modelBase = (mob: MobDef) => mob.layers[0]?.model.split('#')[0] ?? '';

/** Body equipment: model layer and equipment layer type, per entity. */
function bodySlot(mob: MobDef): { model: string; type: string } | undefined {
  const baby = !!mob.babyOf;
  switch (mob.entity) {
    case 'horse':
      return baby ? undefined : { model: 'minecraft:horse_armor#main', type: 'horse_body' };
    case 'zombie_horse':
    case 'skeleton_horse':
      return baby ? undefined : { model: 'minecraft:undead_horse_armor#main', type: 'horse_body' };
    case 'wolf':
      return baby ? undefined : { model: 'minecraft:wolf_armor#main', type: 'wolf_body' };
    case 'nautilus':
    case 'zombie_nautilus':
      return baby ? undefined : { model: 'minecraft:nautilus_armor#main', type: 'nautilus_body' };
    case 'llama':
    case 'trader_llama':
      return { model: baby ? 'minecraft:llama_baby#decor' : 'minecraft:llama#decor', type: 'llama_body' };
    case 'happy_ghast':
      return { model: baby ? 'minecraft:happy_ghast_baby_harness#main' : 'minecraft:happy_ghast_harness#main', type: 'happy_ghast_body' };
    default:
      return undefined;
  }
}

/** Saddle model layer and equipment layer type, per entity (adults only). */
function saddleSlot(mob: MobDef): { model: string; type: string } | undefined {
  if (mob.babyOf) return undefined;
  const entity = mob.entity === 'zombie_nautilus' ? 'nautilus' : mob.entity;
  const model = `minecraft:${entity}#saddle`;
  return has(model) ? { model, type: `${entity}_saddle` } : undefined;
}

/** Which options make sense for a mob, for the preview controls. */
export interface MobCapabilities {
  armor: ArmorSlot[];
  /** Equipment layer type of the body slot (`horse_body`, `llama_body` …). */
  body?: string;
  saddle: boolean;
  collar: boolean;
  markings: boolean;
  villager: boolean;
  /** Villager babies only show their biome. */
  profession: boolean;
  charged: boolean;
  mushrooms: boolean;
}

export function mobCapabilities(mob: MobDef): MobCapabilities {
  const base = modelBase(mob);
  return {
    armor: ARMOR_SLOTS.filter((s) => has(`${base}#${s}`)),
    body: bodySlot(mob)?.type,
    saddle: !!saddleSlot(mob),
    collar: mob.entity === 'wolf' || mob.entity === 'cat',
    markings: mob.entity === 'horse',
    villager: mob.entity === 'villager' || mob.entity === 'zombie_villager',
    profession: (mob.entity === 'villager' || mob.entity === 'zombie_villager') && !mob.babyOf,
    charged: mob.entity === 'creeper' || mob.entity === 'wither',
    mushrooms: mob.entity === 'mooshroom' && !mob.babyOf,
  };
}

interface EquipmentLayerJson {
  texture: string;
  dyeable?: { color_when_undyed?: number };
}

/** Equipment assets (`assets/<ns>/equipment/<id>.json`): their layers per layer type. */
export function equipmentAssets(store: AssetStore): Map<string, Record<string, EquipmentLayerJson[]>> {
  const out = new Map<string, Record<string, EquipmentLayerJson[]>>();
  for (const path of store.list('assets/')) {
    const m = /^assets\/([^/]+)\/equipment\/(.+)\.json$/.exec(path);
    const layers = m && store.json<{ layers?: Record<string, EquipmentLayerJson[]> }>(path)?.layers;
    if (m && layers && typeof layers === 'object') out.set(`${m[1]}:${m[2]}`, layers);
  }
  return out;
}

/** Equipment ids that have layers of `type`, e.g. every armour material for `humanoid`. */
export function equipmentFor(store: AssetStore, type: string): string[] {
  return [...equipmentAssets(store)].filter(([, layers]) => Array.isArray(layers[type]) && layers[type].length).map(([id]) => id);
}

/** Texture id of an equipment layer: `<ns>:entity/equipment/<type>/<path>`. */
export const equipmentTexture = (texture: string, type: string) => {
  const { ns, path } = parseRL(texture);
  return `${ns}:entity/equipment/${type}/${path}`;
};

function equipmentLayers(store: AssetStore, id: string | undefined, type: string, model: string): MobLayer[] {
  if (!id) return [];
  const layers = equipmentAssets(store).get(id)?.[type] ?? [];
  return layers
    .filter((l) => typeof l?.texture === 'string')
    .map((l) => {
      const undyed = l.dyeable?.color_when_undyed;
      return { model, texture: equipmentTexture(l.texture, type), ...(undyed !== undefined ? { tint: undyed & 0xffffff } : {}) };
    });
}

const tex = (path: string) => `minecraft:entity/${path}`;

/** The villager hat setting of a texture's .mcmeta (`none`, `partial` or `full`). */
function hatOf(store: AssetStore, texture: string): string {
  const { ns, path } = parseRL(texture);
  return store.json<{ villager?: { hat?: string } }>(`assets/${ns}/textures/${path}.png.mcmeta`)?.villager?.hat ?? 'none';
}

/** A villager's or zombie villager's layers: base skin, biome, profession and its level. */
function villagerLayers(store: AssetStore, mob: MobDef, o: MobOptions): MobLayer[] {
  const folder = mob.entity; // villager or zombie_villager
  const base = modelBase(mob);
  const type = o.villagerType ?? 'plains';
  const main = mob.layers[0];
  if (mob.babyOf) return [main, { model: main.model, texture: tex(`${folder}/baby/${type}`) }];
  const profession = o.profession ?? 'none';
  const typeTex = tex(`${folder}/type/${type}`);
  const out: MobLayer[] = [main];
  // The biome layer hides its hat when the profession's hat would be covered by it (see VillagerMetadataSection).
  const profHat = profession === 'none' ? 'none' : hatOf(store, tex(`${folder}/profession/${profession}`));
  const showTypeHat = profHat === 'none' || (profHat === 'partial' && hatOf(store, typeTex) !== 'full');
  out.push({ model: showTypeHat ? main.model : `${base}_no_hat#main`, texture: typeTex });
  if (profession !== 'none') {
    out.push({ model: main.model, texture: tex(`${folder}/profession/${profession}`) });
    if (profession !== 'nitwit') out.push({ model: main.model, texture: tex(`${folder}/profession_level/${o.level ?? 'stone'}`) });
  }
  return out;
}

/** The mob's layers with everything `options` adds (drawn after the mob's own layers). */
export function mobLayers(store: AssetStore, mob: MobDef, o: MobOptions | undefined): MobLayer[] {
  if (!o) return mob.layers;
  const caps = mobCapabilities(mob);
  const base = modelBase(mob);
  const baby = !!mob.babyOf;
  let layers: MobLayer[] = caps.villager ? villagerLayers(store, mob, o) : [...mob.layers];
  if (caps.markings && o.markings) layers.push({ model: mob.layers[0].model, texture: tex(`horse/horse_markings_${o.markings}${baby ? '_baby' : ''}`) });
  if (caps.collar && o.collar) {
    const collar = mob.entity === 'wolf' ? { model: mob.layers[0].model, texture: tex(`wolf/wolf_collar${baby ? '_baby' : ''}`) } : { model: `${base}#collar`, texture: tex(`cat/cat_collar${baby ? '_baby' : ''}`) };
    layers.push({ ...collar, tint: DYE[o.collar] ?? DYE.red });
  }
  const saddle = caps.saddle && o.saddle ? saddleSlot(mob) : undefined;
  if (saddle) layers.push(...equipmentLayers(store, 'minecraft:saddle', saddle.type, saddle.model));
  const body = bodySlot(mob);
  if (body && o.body) {
    const extra = equipmentLayers(store, o.body, body.type, body.model);
    // a trader llama's own decor is replaced by a carpet
    if (mob.entity === 'llama' || mob.entity === 'trader_llama') layers = layers.filter((l) => !l.model.endsWith('#decor'));
    layers.push(...extra);
  }
  for (const slot of caps.armor) {
    const id = o.armor?.[slot];
    const type = baby ? 'humanoid_baby' : slot === 'leggings' ? 'humanoid_leggings' : 'humanoid';
    layers.push(...equipmentLayers(store, id, type, `${base}#${slot}`));
  }
  if (isPlayer(mob)) layers = playerLayers(layers, o, equipmentLayers(store, 'minecraft:elytra', 'wings', 'minecraft:elytra#main')[0]?.texture);
  if (caps.charged && o.charged) layers.push({ model: `${base}#armor`, texture: tex(mob.entity === 'creeper' ? 'creeper/creeper_armor' : 'wither/wither_armor'), emissive: true, tint: 0x808080 }); // the game draws the energy swirl at half brightness
  return layers;
}
