import type { DisplayContext } from './modelResolver';
import { normalizeRL } from './resourceLocation';

/** One model to draw for an item, with the tint colour per `tintindex`. */
export interface ModelRef {
  model: string;
  tints: number[];
  /** Set for `minecraft:special` models (chests, banners, heads …) that are rendered by code in-game. */
  special?: string;
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

const stripNs = (t: unknown) => (typeof t === 'string' ? t.replace(/^minecraft:/, '') : '');

/**
 * Picks the models to show for an item definition (assets/<ns>/items/<id>.json, 1.21.4+).
 * Dynamic switches (conditions, selects, ranges) fall back to their resting state;
 * `display_context` selects honour the requested context so e.g. the trident shows its GUI icon.
 */
export function resolveItemModel(node: Json | undefined, context: DisplayContext = 'gui'): ModelRef[] {
  if (!node || typeof node !== 'object') return [];
  switch (stripNs(node.type)) {
    case 'model':
      return typeof node.model === 'string'
        ? [{ model: normalizeRL(node.model), tints: (node.tints ?? []).map(tintColor) }]
        : [];
    case 'composite':
      return (node.models ?? []).flatMap((m: Json) => resolveItemModel(m, context));
    case 'condition':
      return resolveItemModel(node.on_false ?? node.on_true, context);
    case 'select': {
      const cases: Json[] = node.cases ?? [];
      if (stripNs(node.property) === 'display_context') {
        const hit = cases.find((c) => [c.when].flat().includes(context));
        if (hit) return resolveItemModel(hit.model, context);
      }
      return resolveItemModel(node.fallback ?? cases[0]?.model, context);
    }
    case 'range_dispatch':
      return resolveItemModel(node.fallback ?? node.entries?.[0]?.model, context);
    case 'special':
      return typeof node.base === 'string'
        ? [{ model: normalizeRL(node.base), tints: [], special: stripNs(node.model?.type) || 'special' }]
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
