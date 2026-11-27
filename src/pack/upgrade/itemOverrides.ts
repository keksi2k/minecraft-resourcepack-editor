import { normalizeRL } from '../../models/resourceLocation';

/**
 * Before 1.21.4, item models chose other models with `overrides`: a list of predicates (all must be
 * at least the given value) and the model to use, where the last matching entry wins. 1.21.4 reads
 * item definitions (`assets/<ns>/items/<id>.json`) instead and ignores `overrides`. This turns the
 * old list into the equivalent definition: each entry wraps everything before it, so the last one
 * is checked first, like the game did.
 */

type Json = Record<string, any>;

/** Trim materials by the `trim_type` value the game gave them (1.19.4–1.21.3). */
const TRIM_VALUES: [string, number][] = [
  ['minecraft:quartz', 0.1],
  ['minecraft:iron', 0.2],
  ['minecraft:netherite', 0.3],
  ['minecraft:redstone', 0.4],
  ['minecraft:copper', 0.5],
  ['minecraft:gold', 0.6],
  ['minecraft:emerald', 0.7],
  ['minecraft:diamond', 0.8],
  ['minecraft:lapis', 0.9],
  ['minecraft:amethyst', 1.0],
];

const model = (id: string): Json => ({ type: 'minecraft:model', model: normalizeRL(id) });
const condition = (property: string, onTrue: Json, onFalse: Json, extra: Json = {}): Json => ({ type: 'minecraft:condition', property, ...extra, on_true: onTrue, on_false: onFalse });
const range = (property: string, threshold: number, m: Json, fallback: Json, extra: Json = {}): Json => ({
  type: 'minecraft:range_dispatch',
  property,
  ...extra,
  entries: [{ threshold, model: m }],
  fallback,
});
const select = (property: string, when: string[], m: Json, fallback: Json, extra: Json = {}): Json =>
  when.length ? { type: 'minecraft:select', property, ...extra, cases: [{ when: when.length === 1 ? when[0] : when, model: m }], fallback } : fallback;

/** A range property of the new format with its settings, for predicates compared as numbers. */
function rangeProperty(name: string, item: string): [string, Json] | undefined {
  switch (name) {
    case 'custom_model_data':
      return ['minecraft:custom_model_data', {}];
    case 'damage':
      return ['minecraft:damage', {}];
    case 'pull':
      return item === 'crossbow' ? ['minecraft:crossbow/pull', {}] : ['minecraft:use_duration', { scale: 0.05 }];
    case 'time':
      return ['minecraft:time', { source: 'daytime' }];
    case 'angle':
      return ['minecraft:compass', { target: item === 'recovery_compass' ? 'recovery' : 'spawn' }];
    case 'cooldown':
      return ['minecraft:cooldown', {}];
    case 'brushing':
      return ['minecraft:use_cycle', { period: 10, scale: 0.1 }];
    case 'filled':
      return ['minecraft:bundle/fullness', {}];
  }
  return undefined;
}

/** Wraps `m` so it is used only where the predicate holds; `fallback` elsewhere. Undefined if unknown. */
function guard(name: string, value: number, item: string, m: Json, fallback: Json): Json | undefined {
  const r = rangeProperty(name, item);
  if (r) return range(r[0], value, m, fallback, r[1]);
  // flags: the predicate is 0 or 1; at most 0 it always holds
  if (value <= 0 && ['pulling', 'blocking', 'throwing', 'tooting', 'cast', 'broken', 'damaged', 'charged', 'firework', 'lefthanded'].includes(name)) return m;
  switch (name) {
    case 'pulling':
    case 'blocking':
    case 'throwing':
    case 'tooting':
      return condition('minecraft:using_item', m, fallback);
    case 'cast':
      return condition('minecraft:fishing_rod/cast', m, fallback);
    case 'broken':
      return condition('minecraft:broken', m, fallback);
    case 'damaged':
      return condition('minecraft:damaged', m, fallback);
    case 'charged':
      return select('minecraft:charge_type', ['arrow', 'rocket'], m, fallback);
    case 'firework':
      return select('minecraft:charge_type', ['rocket'], m, fallback);
    case 'lefthanded':
      return select('minecraft:main_hand', ['left'], m, fallback);
    case 'trim_type':
      return select('minecraft:trim_material', TRIM_VALUES.filter(([, v]) => v >= value - 1e-6).map(([k]) => k), m, fallback);
    case 'level': {
      // light blocks: level/16
      const levels = Array.from({ length: 16 }, (_, i) => i).filter((l) => l / 16 >= value - 1e-6).map(String);
      return select('minecraft:block_state', levels, m, fallback, { block_state_property: 'level' });
    }
  }
  return undefined;
}

export interface ConvertedOverrides {
  /** The `model` of the new item definition. */
  model: Json;
  /** Predicates the new format has no equivalent for (their entries are left out). */
  unknown: string[];
}

/**
 * The item definition model for an old item model's `overrides`. `base` is what is shown when no
 * override applies (usually the game's own item definition model, so tints and special rendering
 * stay); `item` is the item's id without namespace (bow and crossbow pull differently).
 */
export function convertOverrides(overrides: unknown, base: Json, item: string): ConvertedOverrides {
  const unknown = new Set<string>();
  let result = base;
  for (const o of Array.isArray(overrides) ? overrides : []) {
    if (!o || typeof o.model !== 'string') continue;
    const predicates = Object.entries<number>(o.predicate && typeof o.predicate === 'object' ? o.predicate : {}).filter(([, v]) => typeof v === 'number');
    const target = model(o.model);
    // several entries in a row on the same number (custom_model_data 1, 2, 3 …) become one list
    if (predicates.length === 1) {
      const [[name, value]] = predicates;
      const r = rangeProperty(name, item);
      const last = result.entries?.[result.entries.length - 1];
      if (r && result !== base && result.type === 'minecraft:range_dispatch' && result.property === r[0] && last && value > last.threshold) {
        result = { ...result, entries: [...result.entries, { threshold: value, model: target }] };
        continue;
      }
    }
    // innermost first: the model, wrapped in one check per predicate, each falling back to the rest
    let wrapped: Json | undefined = target;
    for (const [name, value] of [...predicates].reverse()) {
      wrapped = wrapped && guard(name, value, item, wrapped, result);
      if (!wrapped) unknown.add(name);
    }
    if (wrapped) result = wrapped;
  }
  return { model: result, unknown: [...unknown] };
}
