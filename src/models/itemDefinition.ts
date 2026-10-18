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
 * Dynamic switches (conditions, selects, ranges) fall back to their resting state;
 * `display_context` selects honour the requested context so e.g. the trident shows its GUI icon.
 */
export function resolveItemModel(
  node: Json | undefined,
  context: DisplayContext = 'gui',
  inherited: TransformationJson[] = [],
): ModelRef[] {
  if (!node || typeof node !== 'object') return [];
  const transforms = node.transformation ? [...inherited, node.transformation as TransformationJson] : inherited;
  const withTransforms = (ref: ModelRef): ModelRef => (transforms.length ? { ...ref, transforms } : ref);
  const child = (n: Json | undefined) => resolveItemModel(n, context, transforms);

  switch (stripNs(node.type)) {
    case 'model':
      return typeof node.model === 'string'
        ? [withTransforms({ model: normalizeRL(node.model), tints: (node.tints ?? []).map(tintColor) })]
        : [];
    case 'composite':
      return (node.models ?? []).flatMap((m: Json) => child(m));
    case 'condition':
      return child(node.on_false ?? node.on_true);
    case 'select': {
      const cases: Json[] = node.cases ?? [];
      if (stripNs(node.property) === 'display_context') {
        const hit = cases.find((c) => [c.when].flat().includes(context));
        if (hit) return child(hit.model);
      }
      return child(node.fallback ?? cases[0]?.model);
    }
    case 'range_dispatch':
      return child(node.fallback ?? node.entries?.[0]?.model);
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

/** Pre-1.21.4 versions hard-code item tints in Java; cover the common ones. */
export function legacyTints(itemPath: string): number[] {
  if (/^(grass_block|grass|short_grass|tall_grass|fern|large_fern|vine|lily_pad)$/.test(itemPath)) return [GRASS];
  if (/^(oak|jungle|acacia|dark_oak|mangrove)_leaves$/.test(itemPath)) return [FOLIAGE];
  if (itemPath === 'spruce_leaves') return [0x619961];
  if (itemPath === 'birch_leaves') return [0x80a755];
  return [];
}
