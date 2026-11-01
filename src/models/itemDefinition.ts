import type { DisplayContext } from './modelResolver';
import { normalizeRL } from './resourceLocation';

/**
 * Minecraft's `transformation` on item model nodes: either a 4×4 matrix (16 numbers, row-major)
 * or translation · left_rotation · scale · right_rotation, rotations as quaternions [x, y, z, w]
 * or axis-angle objects.
 */
export type TransformationJson =
  | number[]
  | {
      translation?: number[];
      left_rotation?: number[] | { axis: number[]; angle: number };
      scale?: number[];
      right_rotation?: number[] | { axis: number[]; angle: number };
    };

/** A `minecraft:special` model: rendered by code in-game (chests, banners, heads, shields …). */
export interface SpecialModel {
  /** e.g. `chest`, `head`, `banner`, `shield` (namespace stripped). */
  type: string;
  [key: string]: unknown;
}

/** One model to draw for an item, with the tint colour per `tintindex`. */
export interface ModelRef {
  model: string;
  tints: number[];
  special?: SpecialModel;
  /** Transformations of the enclosing nodes, outermost first. */
  transforms?: TransformationJson[];
}

type Json = Record<string, any>;

/** A choice of a `condition`, `select` or `range_dispatch` node. */
export interface StateOption {
  /** `true`/`false` for conditions, the case or entry index for selects and ranges, or `fallback`. */
  value: string;
  /** The `when` values of a select case. */
  when?: string[];
  /** The threshold of a range entry. */
  threshold?: number;
}

/** A dynamic switch in an item definition (in use, pull, compass angle, trim …) that the preview can set. */
export interface StateSwitch {
  key: string;
  kind: 'condition' | 'select' | 'range_dispatch';
  /** Property without namespace, e.g. `using_item`, `crossbow/pull`. */
  property: string;
  /** Further settings of the switch, e.g. `component`, `target`, `block_state_property`. */
  params: Record<string, string>;
  /** In the order they should be offered (ranges by threshold). */
  options: StateOption[];
  /** The resting state shown when nothing is chosen. */
  default: string;
}

/** Chosen option value per switch key. */
export type ItemState = Record<string, string>;

const CHILD_FIELDS = new Set(['type', 'property', 'on_true', 'on_false', 'cases', 'fallback', 'entries', 'model', 'transformation']);
const label = (v: unknown) => (typeof v === 'string' ? v.replace(/^minecraft:/, '') : JSON.stringify(v));

function stateSwitch(node: Json, kind: StateSwitch['kind']): StateSwitch {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(node)) if (!CHILD_FIELDS.has(k) && v !== undefined) params[k] = label(v);
  let options: StateOption[];
  let def: string;
  if (kind === 'condition') {
    options = [];
    if (node.on_false) options.push({ value: 'false' });
    if (node.on_true) options.push({ value: 'true' });
    def = node.on_false ? 'false' : 'true';
  } else if (kind === 'select') {
    const cases: Json[] = node.cases ?? [];
    options = cases.map((c, i) => ({ value: String(i), when: [c.when].flat().map(label) }));
    if (node.fallback) options.push({ value: 'fallback' });
    def = node.fallback ? 'fallback' : '0';
  } else {
    const entries: Json[] = node.entries ?? [];
    options = entries
      .map((e, i) => ({ value: String(i), threshold: Number(e.threshold ?? 0) }))
      .sort((a, b) => a.threshold - b.threshold);
    if (node.fallback) options.unshift({ value: 'fallback' });
    def = node.fallback ? 'fallback' : (options[0]?.value ?? '0');
  }
  const property = stripNs(node.property);
  const shape = options.map((o) => o.when?.join('|') ?? o.threshold ?? o.value).join(',');
  return { key: `${kind}:${property}:${JSON.stringify(params)}:${shape}`, kind, property, params, options, default: def };
}

const GRASS = 0x91bd59;
const FOLIAGE = 0x77ab2f;
const WHITE = 0xffffff;

/** Accepts the forms Minecraft uses for colours: signed ARGB ints, or [r, g, b] floats. */
export function colorValue(v: unknown, fallback = WHITE): number {
  if (typeof v === 'number') return v & 0xffffff;
  if (Array.isArray(v) && v.length >= 3) {
    return v
      .slice(0, 3)
      .reduce((acc, c) => (acc << 8) | Math.round(Math.max(0, Math.min(1, Number(c))) * 255), 0);
  }
  return fallback;
}

export function tintColor(tint: Json): number {
  const type = stripNs(tint?.type);
  switch (type) {
    case 'constant':
      return colorValue(tint.value);
    case 'grass':
      return GRASS;
    case 'foliage':
      return FOLIAGE;
    default:
      // dye, firework, potion, map_color, team, custom_model_data all carry a `default`
      return colorValue(tint.default);
  }
}

export const stripNs = (t: unknown) => (typeof t === 'string' ? t.replace(/^minecraft:/, '') : '');

/**
 * Picks the models to show for an item definition (assets/<ns>/items/<id>.json, 1.21.4+).
 * Dynamic switches (conditions, selects, ranges) take the branch chosen in `state`, else their
 * resting state; the switches passed on the way are added to `found`. `display_context` selects
 * honour the requested context so e.g. the trident shows its GUI icon.
 */
export function resolveItemModel(
  node: Json | undefined,
  context: DisplayContext = 'gui',
  state: ItemState = {},
  found?: StateSwitch[],
  inherited: TransformationJson[] = [],
): ModelRef[] {
  if (!node || typeof node !== 'object') return [];
  const transforms = node.transformation ? [...inherited, node.transformation as TransformationJson] : inherited;
  const withTransforms = (ref: ModelRef): ModelRef => (transforms.length ? { ...ref, transforms } : ref);
  const child = (n: Json | undefined) => resolveItemModel(n, context, state, found, transforms);
  /** The chosen option of this switch node (registering the switch in `found`). */
  const choice = (kind: StateSwitch['kind']) => {
    const s = stateSwitch(node, kind);
    if (found && !found.some((f) => f.key === s.key)) found.push(s);
    const v = state[s.key];
    return v !== undefined && s.options.some((o) => o.value === v) ? v : s.default;
  };
  const pick = (v: string, list: Json[] | undefined) => (v === 'fallback' ? node.fallback : list?.[Number(v)]?.model);

  switch (stripNs(node.type)) {
    case 'model':
      return typeof node.model === 'string'
        ? [withTransforms({ model: normalizeRL(node.model), tints: (node.tints ?? []).map(tintColor) })]
        : [];
    case 'composite':
      return (node.models ?? []).flatMap((m: Json) => child(m));
    case 'condition':
      return child(choice('condition') === 'true' ? node.on_true : node.on_false);
    case 'select': {
      const cases: Json[] = node.cases ?? [];
      if (stripNs(node.property) === 'display_context') {
        const hit = cases.find((c) => [c.when].flat().includes(context));
        return child(hit ? hit.model : (node.fallback ?? cases[0]?.model));
      }
      return child(pick(choice('select'), cases));
    }
    case 'range_dispatch':
      return child(pick(choice('range_dispatch'), node.entries));
    case 'special':
      return typeof node.base === 'string'
        ? [
            withTransforms({
              model: normalizeRL(node.base),
              tints: [],
              special: { ...(node.model ?? {}), type: stripNs(node.model?.type) || 'special' },
            }),
          ]
        : [];
    default:
      // empty, bundle/selected_item, unknown
      return [];
  }
}

/** Every model an item definition can show, in any state or display context. */
export function allItemModels(node: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(node)) for (const n of node) allItemModels(n, out);
  else if (node && typeof node === 'object') {
    const n = node as Json;
    const type = stripNs(n.type);
    if (type === 'model' && typeof n.model === 'string') out.add(normalizeRL(n.model));
    else if (type === 'special' && typeof n.base === 'string') out.add(normalizeRL(n.base));
    for (const [k, v] of Object.entries(n)) if (typeof v === 'object' && !(type === 'special' && k === 'model')) allItemModels(v, out);
  }
  return out;
}

/** Pre-1.21.4 versions hard-code item tints in Java; cover the common ones. */
export function legacyTints(itemPath: string): number[] {
  if (/^(grass_block|grass|short_grass|tall_grass|fern|large_fern|vine|lily_pad)$/.test(itemPath)) return [GRASS];
  if (/^(oak|jungle|acacia|dark_oak|mangrove)_leaves$/.test(itemPath)) return [FOLIAGE];
  if (itemPath === 'spruce_leaves') return [0x619961];
  if (itemPath === 'birch_leaves') return [0x80a755];
  return [];
}

/**
 * One state per path through an item definition's switches to a model, in file order (at most
 * `limit`): the choices made on the way, so `resolveItemModel` with it shows that model. Switches
 * off the path stay at rest; `display_context` selects follow `context` as when resolving.
 */
export function itemStatePaths(node: Json | undefined, context: DisplayContext = 'gui', limit = 512, state: ItemState = {}): ItemState[] {
  if (!node || typeof node !== 'object') return [];
  const out: ItemState[] = [];
  const walk = (n: Json | undefined, s: ItemState) => {
    if (out.length < limit) out.push(...itemStatePaths(n, context, limit - out.length, s));
  };
  const branch = (kind: StateSwitch['kind'], childOf: (value: string) => Json | undefined) => {
    const sw = stateSwitch(node, kind);
    for (const o of sw.options) walk(childOf(o.value), { ...state, [sw.key]: o.value });
    return out;
  };
  const pick = (list: Json[] | undefined) => (v: string) => (v === 'fallback' ? node.fallback : list?.[Number(v)]?.model);

  switch (stripNs(node.type)) {
    case 'model':
    case 'special':
      return [state];
    case 'composite':
      for (const m of node.models ?? []) walk(m, state);
      return out.length ? out : [state];
    case 'condition':
      return branch('condition', (v) => (v === 'true' ? node.on_true : node.on_false));
    case 'select': {
      const cases: Json[] = node.cases ?? [];
      if (stripNs(node.property) === 'display_context') {
        const hit = cases.find((c) => [c.when].flat().includes(context));
        walk(hit ? hit.model : (node.fallback ?? cases[0]?.model), state);
        return out;
      }
      return branch('select', pick(cases));
    }
    case 'range_dispatch':
      return branch('range_dispatch', pick(node.entries));
    default:
      return [];
  }
}
