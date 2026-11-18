import type { ResolvedModel } from './modelResolver';
import { parseRL } from './resourceLocation';

/**
 * Random block variants: a block state can list several models, and the game picks one per block
 * position (by `weight`), optionally rotated. Used for grass, stone, sand … to break up tiling.
 */

export interface BlockVariant {
  model: string;
  x?: number;
  y?: number;
  uvlock?: boolean;
  weight?: number;
}

type Json = Record<string, any>;

export const ROTATIONS = [0, 90, 180, 270] as const;

/** The state keys (`""`, `facing=north` …) of a `variants` blockstate; empty for multipart ones. */
export function variantKeys(blockstate: Json | undefined): string[] {
  return blockstate?.variants && typeof blockstate.variants === 'object' ? Object.keys(blockstate.variants) : [];
}

const clean = (v: any): BlockVariant | undefined => {
  if (!v || typeof v.model !== 'string') return undefined;
  const out: BlockVariant = { model: v.model };
  for (const k of ['x', 'y', 'weight'] as const) if (typeof v[k] === 'number' && (k === 'weight' ? v[k] !== 1 : v[k] !== 0)) out[k] = v[k];
  if (v.uvlock === true) out.uvlock = true;
  return out;
};

/** The models of one state, as a list (a single object counts as a list of one). */
export function variantList(blockstate: Json | undefined, key: string): BlockVariant[] {
  const v = blockstate?.variants?.[key];
  return [v]
    .flat()
    .map(clean)
    .filter((x): x is BlockVariant => !!x);
}

/** The blockstate with this list for `key`; one entry is written as a plain object, like vanilla does. */
export function setVariantList(blockstate: Json | undefined, key: string, list: BlockVariant[]): Json {
  const entries = list.map(clean).filter((x): x is BlockVariant => !!x);
  const value = entries.length === 1 ? (({ weight: _w, ...rest }) => rest)(entries[0]) : entries;
  return { ...blockstate, variants: { ...blockstate?.variants, [key]: value } };
}

/** Adds copies of `entry` turned by 90°, 180° and 270° around the vertical axis (those not there yet). */
export function withRotations(list: BlockVariant[], entry: BlockVariant): BlockVariant[] {
  const same = (a: BlockVariant, b: BlockVariant) => a.model === b.model && (a.x ?? 0) === (b.x ?? 0) && (a.y ?? 0) === (b.y ?? 0);
  const out = [...list];
  for (const y of ROTATIONS) {
    const next = clean({ ...entry, y: ((entry.y ?? 0) + y) % 360 })!;
    if (!out.some((e) => same(e, next))) out.push(next);
  }
  return out;
}

/** Share of the time each entry is picked (0–1). */
export function variantChances(list: BlockVariant[]): number[] {
  const total = list.reduce((s, v) => s + (v.weight ?? 1), 0);
  return list.map((v) => (total ? (v.weight ?? 1) / total : 0));
}

/** Texture variables of a model that show `texture` (e.g. `all`, or `top` and `side`). */
export function textureVarsOf(model: ResolvedModel, texture: string): string[] {
  return Object.entries(model.textures)
    .filter(([, v]) => v === texture)
    .map(([k]) => k);
}

/** A model that is `parent` with some textures swapped. */
export function variantModelJson(parent: string, textures: Record<string, string>): Json {
  return { parent, textures };
}

/** A free id like `minecraft:block/stone_variant_2` for a new variant model and texture. */
export function variantId(blockId: string, taken: (id: string) => boolean): string {
  const { ns, path } = parseRL(blockId);
  let i = 2;
  while (taken(`${ns}:block/${path}_variant_${i}`)) i++;
  return `${ns}:block/${path}_variant_${i}`;
}
