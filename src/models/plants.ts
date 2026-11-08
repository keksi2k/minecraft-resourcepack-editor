import type { AssetStore, Source } from '../assets/AssetStore';
import { FOLIAGE, GRASS, type TransformationJson } from './itemDefinition';
import { gameNames, strongestSource, type ResolvedItemModel } from './items';
import { modelTextures, resolveModel, type ResolvedModel } from './modelResolver';
import { modelPath, normalizeRL, parseRL, texturePath } from './resourceLocation';

/** One look of a plant: several values often share it (carrots have 8 ages, 4 looks). */
export interface PlantStage {
  key: string;
  /** The values of the plant's growth property with this look; empty for a plant that doesn't grow. */
  values: string[];
  models: ResolvedItemModel[];
  textures: string[];
}

export interface PlantEntry {
  id: string;
  name: string;
  /** The block state file. */
  defPath: string;
  /** The block state property it grows by (`age`, `berries`, `flower_amount` …), if its look changes. */
  property?: string;
  /** In order of growth; a single one for plants that don't grow. */
  stages: PlantStage[];
  /** Every texture the block state can show, also those of states no stage shows (bamboo's large leaves, a dead sea pickle). */
  textures: string[];
  /** Blocks the tallest stage reaches (2 for sunflowers and pitcher plants). */
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

type When = Record<string, unknown> & { OR?: When[]; AND?: When[] };

interface BlockState {
  variants?: Record<string, Variant | Variant[]>;
  multipart?: { when?: When; apply: Variant | Variant[] }[];
}

type Props = Record<string, string>;

/** One half of a plant (most plants are a single part). */
interface Part {
  variant: Variant;
  up: number;
}

/** A block state without `half`, with the parts of both halves. */
interface State {
  props: Props;
  parts: Part[];
}

const BLOCK_STATE = /^assets\/([^/]+)\/blockstates\/(.+)\.json$/;

/** Properties a plant grows by, in order of preference when several change its look. */
const GROWTH = ['leaves', 'age', 'berries', 'flower_amount', 'segment_amount', 'pickles', 'stage'];

/** Of the placements beside the growth property, these are picked first: how the plant usually stands. */
const PREFERRED: Props = { waterlogged: 'true', tilt: 'none', facing: 'north', north: 'true' };

/** Plants built from these models: flowers, saplings, grass, mushrooms, crops, seagrass, azaleas … */
const PLANT_MODEL = /^minecraft:block\/(cross|cross_emissive|tinted_cross|crop|stem_growth\d+|stem_fruit|template_seagrass|template_azalea)$/;

/** Plants with models of their own. */
const PLANT_BLOCKS = new Set(
  [
    'bamboo', 'big_dripleaf', 'big_dripleaf_stem', 'cactus', 'cactus_flower', 'chorus_flower', 'chorus_plant', 'glow_lichen',
    'leaf_litter', 'lily_pad', 'pale_hanging_moss', 'pink_petals', 'pitcher_plant', 'sea_pickle', 'small_dripleaf',
    'spore_blossom', 'sunflower', 'vine', 'wildflowers',
  ].map((p) => `minecraft:${p}`),
);

/** Blocks with an `age`, or drawn like a plant, that aren't plants. */
const NOT_PLANTS = /^minecraft:(frosted_ice|fire|cobweb|potted_.*|.*coral.*|.*amethyst.*)$/;

const STEMS = new Set(['minecraft:melon_stem', 'minecraft:pumpkin_stem']);

/** Stems turn from green to yellow as they grow; the game sets this colour in code. */
export const stemTint = (age: number) => (age * 32 << 16) | ((255 - age * 8) << 8) | (age * 4);

const WHITE = 0xffffff;

/** Block colours the game sets in code, by tint index. */
const BLOCK_TINTS: Record<string, number[]> = {
  ...Object.fromEntries(['short_grass', 'grass', 'tall_grass', 'fern', 'large_fern', 'sugar_cane', 'bush'].map((p) => [`minecraft:${p}`, [GRASS]])),
  ...Object.fromEntries(['pink_petals', 'wildflowers'].map((p) => [`minecraft:${p}`, [WHITE, GRASS]])),
  'minecraft:vine': [FOLIAGE],
  'minecraft:lily_pad': [0x208030],
  'minecraft:attached_melon_stem': [stemTint(7)],
  'minecraft:attached_pumpkin_stem': [stemTint(7)],
};

function plantTints(id: string, props: Props): number[] {
  if (STEMS.has(id)) return [stemTint(Number(props.age) || 0)];
  return BLOCK_TINTS[id] ?? [];
}

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

const propsKey = (props: Props, without?: string) =>
  Object.keys(props).filter((k) => k !== without).sort().map((k) => `${k}=${props[k]}`).join();

// of random variants, the first stands for all
const first = (v: Variant | Variant[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** The states of a `variants` block state; both halves of a tall plant make one state. */
function variantStates(variants: Record<string, Variant | Variant[]>): State[] {
  const states = new Map<string, State>();
  for (const [key, value] of Object.entries(variants)) {
    const variant = first(value);
    if (!variant?.model) continue;
    const props: Props = Object.fromEntries(key.split(',').filter(Boolean).map((p) => p.split('=') as [string, string]));
    const up = props.half === 'upper' ? 1 : 0;
    delete props.half;
    const k = propsKey(props);
    const state = states.get(k) ?? { props, parts: [] };
    states.set(k, state);
    state.parts.push({ variant, up });
  }
  return [...states.values()];
}

function matches(when: When | undefined, props: Props): boolean {
  if (!when) return true;
  if (Array.isArray(when.OR)) return when.OR.some((w) => matches(w, props));
  if (Array.isArray(when.AND)) return when.AND.every((w) => matches(w, props));
  return Object.entries(when).every(([k, v]) => String(v).split('|').includes(props[k]));
}

function collectValues(when: When | undefined, out: Map<string, string[]>) {
  if (!when) return;
  for (const [k, v] of Object.entries(when)) {
    if (k === 'OR' || k === 'AND') {
      for (const w of v as When[]) collectValues(w, out);
      continue;
    }
    const values = out.get(k) ?? [];
    out.set(k, values);
    for (const s of String(v).split('|')) if (!values.includes(s)) values.push(s);
  }
}

/**
 * Some states of a `multipart` block state: every value of each growth property, the others at a
 * usual value (a vine on one side, petals facing north).
 */
function multipartStates(multipart: NonNullable<BlockState['multipart']>): State[] {
  const domain = new Map<string, string[]>();
  for (const part of multipart) collectValues(part.when, domain);
  // counts start at 1; one no condition names is what the parts that always apply draw (one pink petal)
  for (const g of GROWTH) {
    const values = domain.get(g)?.map(Number);
    if (values?.length && values.every((v) => Number.isInteger(v)) && Math.min(...values) > 1) domain.get(g)!.unshift(String(Math.min(...values) - 1));
  }
  const base: Props = {};
  for (const [k, values] of domain) {
    // a side often only appears as `true`: it's off unless preferred
    if (values.every((v) => v === 'true' || v === 'false')) base[k] = PREFERRED[k] ?? 'false';
    else base[k] = PREFERRED[k] && values.includes(PREFERRED[k]) ? PREFERRED[k] : values[0];
  }
  const combos = [base, ...GROWTH.flatMap((g) => (domain.get(g) ?? []).map((v) => ({ ...base, [g]: v })))];
  const states = new Map<string, State>();
  for (const props of combos) {
    const k = propsKey(props);
    if (states.has(k)) continue;
    const parts = multipart
      .filter((p) => matches(p.when, props))
      .map((p) => first(p.apply))
      .filter((v): v is Variant => !!v?.model)
      .map((variant) => ({ variant, up: 0 }));
    states.set(k, { props, parts });
  }
  return [...states.values()];
}

const byValue = (a: string, b: string) => {
  const [x, y] = [Number(a), Number(b)];
  if (!Number.isNaN(x) && !Number.isNaN(y)) return x - y;
  // false before true, otherwise in file order
  return a === 'false' && b === 'true' ? -1 : a === 'true' && b === 'false' ? 1 : 0;
};

const preference = (props: Props) => Object.entries(PREFERRED).filter(([k, v]) => props[k] === v).length;

/** The stages of states that differ only in `property` (or the one state of a plant that doesn't grow). */
function stagesOf(store: AssetStore, id: string, states: State[], property: string | undefined): PlantStage[] {
  const stages = new Map<string, PlantStage>();
  for (const { props, parts } of states) {
    const tints = plantTints(id, props);
    const models = [...parts]
      .sort((a, b) => a.up - b.up)
      .map(({ variant, up }): ResolvedItemModel => ({
        ref: { model: normalizeRL(variant.model!), tints, transforms: placement(variant, up) },
        model: resolveModel(store, variant.model!),
      }))
      // a young pitcher plant's upper half is a model without geometry
      .filter((m) => m.model.elements.length > 0 || m.model.layers.length > 0);
    if (models.length === 0) continue;
    const key = JSON.stringify(models.map((m) => [m.ref.model, m.ref.tints, m.ref.transforms]));
    const value = property ? [props[property]] : [];
    const known = stages.get(key);
    if (known) known.values.push(...value);
    else stages.set(key, { key, values: value, models, textures: [...new Set(models.flatMap((m) => modelTextures(m.model)))] });
  }
  return [...stages.values()];
}

/**
 * The stages of a block state, and the property it grows by. Of the growth properties, the one with
 * the most looks wins (cave vines grow by `berries`, not `age`). Properties beside it pick the
 * placement that changes most as it grows: a mangrove propagule only changes while hanging, and of a
 * cocoa pod's four sides any will do. `half` isn't a choice, both halves together make the plant.
 */
export function plantStages(store: AssetStore, id: string, def: BlockState): { property?: string; stages: PlantStage[] } {
  const states = def.variants ? variantStates(def.variants) : def.multipart ? multipartStates(def.multipart) : [];
  let best: { property?: string; stages: PlantStage[]; pref: number } = { stages: [], pref: -1 };
  for (const property of GROWTH) {
    const groups = new Map<string, State[]>();
    for (const s of states) {
      if (s.props[property] === undefined) continue;
      const k = propsKey(s.props, property);
      groups.set(k, [...(groups.get(k) ?? []), s]);
    }
    for (const group of groups.values()) {
      group.sort((a, b) => byValue(a.props[property], b.props[property]));
      const stages = stagesOf(store, id, group, property);
      const pref = preference(group[0].props);
      if (stages.length > best.stages.length || (stages.length === best.stages.length && stages.length > 1 && pref > best.pref)) {
        best = { property, stages, pref };
      }
    }
  }
  if (best.stages.length > 1) return { property: best.property, stages: best.stages };
  // doesn't grow: one look, standing as usual
  const usual = [...states].sort((a, b) => preference(b.props) - preference(a.props))[0];
  return { stages: usual ? stagesOf(store, id, [usual], undefined) : [] };
}

/** Every model a block state can show. */
function allModels(store: AssetStore, def: BlockState): ResolvedModel[] {
  const refs = new Set<string>();
  const add = (v: Variant | Variant[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).forEach((x) => x.model && refs.add(normalizeRL(x.model)));
  Object.values(def.variants ?? {}).forEach(add);
  def.multipart?.forEach((p) => add(p.apply));
  return [...refs].map((r) => resolveModel(store, r));
}

function buildPlant(store: AssetStore, id: string, defPath: string, def: BlockState, grown: ReturnType<typeof plantStages>, lang: Record<string, string>): PlantEntry {
  const { stages, property } = grown;
  const all = allModels(store, def);
  const textures = [...new Set([...stages.flatMap((s) => s.textures), ...all.flatMap(modelTextures)])];
  const deps = [defPath, ...new Set(all.flatMap((m) => m.chain.map(modelPath)))];
  for (const t of textures) deps.push(texturePath(t), `${texturePath(t)}.mcmeta`);
  const { ns, path } = parseRL(id);
  return {
    id,
    name: lang[`block.${ns}.${path}`] ?? path.replace(/_/g, ' '),
    defPath,
    property,
    stages,
    textures,
    height: stages.some((s) => s.models.some((m) => m.ref.transforms?.some((t) => !Array.isArray(t) && t.translation?.[1] === 1))) ? 2 : 1,
    deps,
    source: strongestSource(store, deps),
    depsKey: deps.map((d) => store.rev(d)).join('.'),
  };
}

const isPlantLike = (store: AssetStore, id: string, def: BlockState) =>
  PLANT_BLOCKS.has(id) || allModels(store, def).some((m) => m.chain.some((c) => PLANT_MODEL.test(c)));

/**
 * Every plant: blocks whose look changes as they grow (crops, stems, berry bushes, bamboo, also those
 * a pack adds), and the ones that don't grow (flowers, saplings, grass, mushrooms, vines, cacti …).
 */
export function listPlants(store: AssetStore, lang: Record<string, string> = gameNames(store)): PlantEntry[] {
  const out: PlantEntry[] = [];
  for (const p of store.list('assets/')) {
    const m = BLOCK_STATE.exec(p);
    if (!m) continue;
    const id = `${m[1]}:${m[2]}`;
    const def = store.json<BlockState>(p);
    if (!def || NOT_PLANTS.test(id)) continue;
    const grown = plantStages(store, id, def);
    if (grown.stages.length > 1 || (grown.stages.length === 1 && isPlantLike(store, id, def))) out.push(buildPlant(store, id, p, def, grown, lang));
  }
  return out;
}
