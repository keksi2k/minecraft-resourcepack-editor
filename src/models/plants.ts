import type { AssetStore, Source } from '../assets/AssetStore';
import type { TransformationJson } from './itemDefinition';
import { gameNames, strongestSource, type ResolvedItemModel } from './items';
import { modelTextures, resolveModel } from './modelResolver';
import { modelPath, normalizeRL, parseRL, texturePath } from './resourceLocation';

/** One look of a growing block: several `age` values often share it (carrots have 8 ages, 4 looks). */
export interface PlantStage {
  key: string;
  ages: number[];
  models: ResolvedItemModel[];
  textures: string[];
}

export interface PlantEntry {
  id: string;
  name: string;
  /** The block state file. */
  defPath: string;
  /** In order of growth. */
  stages: PlantStage[];
  /** Blocks the tallest stage reaches (2 for pitcher plants). */
  height: number;
  deps: string[];
  source: Source;
  depsKey: string;
}

interface Variant {
  model?: string;
  x?: number;
  y?: number;
}

/** One half of a plant (most plants are a single part). */
interface Part {
  variant: Variant;
  up: number;
}

const BLOCK_STATE = /^assets\/([^/]+)\/blockstates\/(.+)\.json$/;

/** Blocks with an `age` that don't grow. */
const NOT_PLANTS = new Set(['minecraft:frosted_ice']);

const STEMS = new Set(['minecraft:melon_stem', 'minecraft:pumpkin_stem']);

/** Stems turn from green to yellow as they grow; the game sets this colour in code. */
export const stemTint = (age: number) => (age * 32 << 16) | ((255 - age * 8) << 8) | (age * 4);

/** Places a variant like the game does: rotated around the block's centre, `up` blocks higher. */
function placement({ x = 0, y = 0 }: Variant, up: number): TransformationJson[] {
  const deg = Math.PI / 180;
  const out: TransformationJson[] = [];
  if (up) out.push({ translation: [0, up, 0] });
  if (x || y) {
    out.push(
      { translation: [0.5, 0.5, 0.5] },
      { left_rotation: { axis: [0, 1, 0], angle: -y * deg } },
      { left_rotation: { axis: [1, 0, 0], angle: -x * deg } },
      { translation: [-0.5, -0.5, -0.5] },
    );
  }
  return out;
}

/**
 * The stages of a `variants` block state, or [] without an `age`. Properties beside `age` pick the
 * placement that changes most as it grows: a mangrove propagule only changes while hanging, and of a
 * cocoa pod's four sides any will do. `half` isn't a choice, both halves together make the plant.
 */
export function plantStages(store: AssetStore, id: string, variants: Record<string, Variant | Variant[]>): PlantStage[] {
  const placements = new Map<string, Map<number, Part[]>>();
  for (const [state, value] of Object.entries(variants)) {
    const props = Object.fromEntries(state.split(',').map((p) => p.split('=')));
    const age = Number(props.age);
    // of random variants, the first stands for all
    const variant = Array.isArray(value) ? value[0] : value;
    if (props.age === undefined || Number.isNaN(age) || !variant?.model) continue;
    const other = Object.keys(props).filter((k) => k !== 'age' && k !== 'half').sort().map((k) => `${k}=${props[k]}`).join();
    const ages = placements.get(other) ?? new Map<number, Part[]>();
    placements.set(other, ages);
    ages.set(age, [...(ages.get(age) ?? []), { variant, up: props.half === 'upper' ? 1 : 0 }]);
  }

  let best: PlantStage[] = [];
  for (const ages of placements.values()) {
    const stages = new Map<string, PlantStage>();
    for (const age of [...ages.keys()].sort((a, b) => a - b)) {
      const tints = STEMS.has(id) ? [stemTint(age)] : [];
      const models = ages.get(age)!
        .sort((a, b) => a.up - b.up)
        .map(({ variant, up }): ResolvedItemModel => ({
          ref: { model: normalizeRL(variant.model!), tints, transforms: placement(variant, up) },
          model: resolveModel(store, variant.model!),
        }))
        // a young pitcher plant's upper half is a model without geometry
        .filter((m) => m.model.elements.length > 0);
      const key = JSON.stringify(models.map((m) => [m.ref.model, m.ref.tints, m.ref.transforms]));
      const known = stages.get(key);
      if (known) known.ages.push(age);
      else stages.set(key, { key, ages: [age], models, textures: [...new Set(models.flatMap((m) => modelTextures(m.model)))] });
    }
    if (stages.size > best.length) best = [...stages.values()];
  }
  return best;
}

function buildPlant(store: AssetStore, id: string, defPath: string, stages: PlantStage[], lang: Record<string, string>): PlantEntry {
  const models = stages.flatMap((s) => s.models);
  const deps = [defPath, ...models.flatMap((m) => m.model.chain.map(modelPath))];
  for (const t of new Set(stages.flatMap((s) => s.textures))) deps.push(texturePath(t), `${texturePath(t)}.mcmeta`);
  const { ns, path } = parseRL(id);
  return {
    id,
    name: lang[`block.${ns}.${path}`] ?? path.replace(/_/g, ' '),
    defPath,
    stages,
    height: models.some((m) => m.ref.transforms?.some((t) => !Array.isArray(t) && t.translation?.[1] === 1)) ? 2 : 1,
    deps,
    source: strongestSource(store, deps),
    depsKey: deps.map((d) => store.rev(d)).join('.'),
  };
}

/**
 * Every block whose block state shows its growth: an `age` with more than one look. Plants that grow
 * by stacking (sugar cane, kelp) look the same at every age, and `multipart` blocks (bamboo) aren't read.
 */
export function listPlants(store: AssetStore, lang: Record<string, string> = gameNames(store)): PlantEntry[] {
  const out: PlantEntry[] = [];
  for (const p of store.list('assets/')) {
    const m = BLOCK_STATE.exec(p);
    if (!m) continue;
    const id = `${m[1]}:${m[2]}`;
    const variants = store.json<{ variants?: Record<string, Variant | Variant[]> }>(p)?.variants;
    if (!variants || NOT_PLANTS.has(id)) continue;
    const stages = plantStages(store, id, variants);
    if (stages.length > 1) out.push(buildPlant(store, id, p, stages, lang));
  }
  return out;
}
