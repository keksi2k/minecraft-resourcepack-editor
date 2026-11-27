import type { AssetStore } from '../assets/AssetStore';
import { FOLIAGE, GRASS } from '../models/itemDefinition';
import type { ResolvedItemModel } from '../models/items';
import { resolveFaceTexture, resolveModel, type FaceDir } from '../models/modelResolver';
import { ctmTile, emissiveOf, ruleFor, SHOWN_METHODS, type CtmRule, type CtmWorld } from '../optifine/optifine';
import { placement } from '../models/plants';
import { normalizeRL, parseRL } from '../models/resourceLocation';

/**
 * The block sandbox: blocks placed on a small grid, each shown in its usual state. Where the
 * block state lists random variants, every position gets one by weight, the same one each time
 * (the game also picks by position), so tiling shows the way it would in a world.
 */

export interface BlockVariant {
  model: string;
  x?: number;
  y?: number;
  weight?: number;
}

type When = Record<string, unknown> & { OR?: When[]; AND?: When[] };

interface BlockStateJson {
  variants?: Record<string, BlockVariant | BlockVariant[]>;
  multipart?: { when?: When; apply: BlockVariant | BlockVariant[] }[];
}

/** How a block usually stands: upright, facing north, closed, unlit, on the ground. */
const USUAL: Record<string, string> = {
  axis: 'y',
  facing: 'north',
  half: 'bottom',
  type: 'bottom',
  face: 'floor',
  shape: 'straight',
  open: 'false',
  powered: 'false',
  lit: 'false',
  snowy: 'false',
  waterlogged: 'false',
  part: 'foot',
  hinge: 'left',
  attachment: 'floor',
  hanging: 'false',
  age: '0',
  level: '0',
  power: '0',
  rotation: '0',
  north: 'false',
  south: 'false',
  east: 'false',
  west: 'false',
  up: 'false',
  down: 'false',
};

const parseKey = (key: string) =>
  Object.fromEntries(
    key
      .split(',')
      .filter(Boolean)
      .map((p) => p.split('=') as [string, string]),
  );

/** The `variants` entry closest to the usual state. */
export function usualVariantKey(keys: string[]): string | undefined {
  if (keys.includes('')) return '';
  let best: string | undefined;
  let score = -1;
  for (const key of keys) {
    const props = parseKey(key);
    const s = Object.entries(props).filter(([k, v]) => USUAL[k] === v).length * 2 - Object.keys(props).length;
    if (s > score) {
      score = s;
      best = key;
    }
  }
  return best;
}

function matches(when: When | undefined, props: Record<string, string>): boolean {
  if (!when) return true;
  if (Array.isArray(when.OR)) return when.OR.some((w) => matches(w, props));
  if (Array.isArray(when.AND)) return when.AND.every((w) => matches(w, props));
  return Object.entries(when).every(([k, v]) =>
    String(v)
      .split('|')
      .includes(props[k] ?? USUAL[k] ?? ''),
  );
}

const list = (v: BlockVariant | BlockVariant[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).filter((x) => typeof x?.model === 'string');

/** The parts of a block in its usual state; each part lists its random variants. */
export function blockParts(def: BlockStateJson | undefined): BlockVariant[][] {
  if (!def) return [];
  if (def.variants) {
    const key = usualVariantKey(Object.keys(def.variants));
    const parts = key === undefined ? [] : [list(def.variants[key])];
    return parts.filter((p) => p.length);
  }
  if (Array.isArray(def.multipart))
    return def.multipart
      .filter((p) => matches(p.when, {}))
      .map((p) => list(p.apply))
      .filter((p) => p.length);
  return [];
}

/** A number from a position that looks random but is always the same for it. */
export function positionSeed(x: number, y: number, z: number): number {
  let h = (Math.imul(x, 3129871) ^ Math.imul(z, 116129781) ^ y) | 0;
  h = Math.imul(h, Math.imul(h, 42317861) + 11);
  return (h >>> 16) & 0xffff;
}

/** Picks one of several variants by weight. */
export function pickVariant(variants: BlockVariant[], seed: number): number {
  if (variants.length <= 1) return 0;
  const total = variants.reduce((s, v) => s + Math.max(1, v.weight ?? 1), 0);
  let r = seed % total;
  for (let i = 0; i < variants.length; i++) {
    r -= Math.max(1, variants[i].weight ?? 1);
    if (r < 0) return i;
  }
  return variants.length - 1;
}

export interface Tints {
  grass: number;
  foliage: number;
  water: number;
}

export const DEFAULT_TINTS: Tints = { grass: GRASS, foliage: FOLIAGE, water: 0x3f76e4 };

/** Block colours the game sets in code (tint index 0), by block. */
export function blockTint(id: string, tints: Tints): number | undefined {
  const name = parseRL(id).path;
  if (/^(grass_block|short_grass|tall_grass|fern|large_fern|sugar_cane|bush|potted_fern)$/.test(name)) return tints.grass;
  if (name === 'birch_leaves') return 0x80a755;
  if (name === 'spruce_leaves') return 0x619961;
  if (/^(oak|jungle|acacia|dark_oak|mangrove)_leaves$|^vine$/.test(name)) return tints.foliage;
  if (/^(water|water_cauldron|bubble_column)$/.test(name)) return tints.water;
  if (name === 'lily_pad') return 0x208030;
  return undefined;
}

/** The models of one variant choice of each part, placed like the game does. */
export function blockModels(store: AssetStore, id: string, parts: BlockVariant[][], choice: number[], tints: Tints): ResolvedItemModel[] {
  const tint = blockTint(id, tints);
  return parts.map((variants, i) => {
    const v = variants[choice[i] ?? 0] ?? variants[0];
    return {
      ref: { model: normalizeRL(v.model), tints: tint === undefined ? [] : [tint, tint], transforms: placement(v, 0) },
      model: resolveModel(store, v.model),
    };
  });
}

/** Blocks a pack can show here: every block state with a model. */
export function listBlocks(store: AssetStore): string[] {
  const out: string[] = [];
  for (const p of store.list('assets/')) {
    const m = /^assets\/([^/]+)\/blockstates\/(.+)\.json$/.exec(p);
    if (!m) continue;
    // blocks drawn in code only (air, signs, banners …) have models without geometry
    const parts = blockParts(store.json<BlockStateJson>(p));
    if (parts.some((variants) => variants.some((v) => resolveModel(store, v.model).elements.length > 0))) out.push(`${m[1]}:${m[2]}`);
  }
  return out;
}

export const blockStatePath = (id: string) => {
  const { ns, path } = parseRL(id);
  return `assets/${ns}/blockstates/${path}.json`;
};

/** A placed block: grid cell → block id. */
export type Cells = Map<string, string>;
export const cellKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
export const parseCell = (key: string) => key.split(',').map(Number) as [number, number, number];

/** A square floor of one block, centred on the origin. */
export function floor(block: string, size: number): Cells {
  const cells: Cells = new Map();
  const h = Math.floor(size / 2);
  for (let x = -h; x < size - h; x++) for (let z = -h; z < size - h; z++) cells.set(cellKey(x, 0, z), block);
  return cells;
}

/** The scene saved as text: rows of `x,y,z block`. */
export const serializeCells = (cells: Cells) => [...cells].map(([k, b]) => `${k} ${b}`).join('\n');
export function parseCells(text: string): Cells {
  const cells: Cells = new Map();
  for (const line of text.split('\n')) {
    const m = /^(-?\d+),(-?\d+),(-?\d+) (\S+)$/.exec(line.trim());
    if (m) cells.set(cellKey(+m[1], +m[2], +m[3]), m[4]);
  }
  return cells;
}

/* OptiFine: connected textures and emissive overlays ------------------------------------------- */

/**
 * The block's models with each face's texture swapped for the CTM tile its neighbours call for.
 * Rotated variants keep their textures (their model faces don't point where they are drawn).
 * `key` names the chosen tiles, so blocks that look the same can share one built object.
 */
export function ctmModels(
  models: ResolvedItemModel[],
  parts: BlockVariant[][],
  choice: number[],
  rules: CtmRule[],
  world: CtmWorld,
  pos: [number, number, number],
  block: string,
): { models: ResolvedItemModel[]; key: string } {
  if (!rules.length) return { models, key: '' };
  const keys: string[] = [];
  const out = models.map((m, i) => {
    const v = parts[i]?.[choice[i] ?? 0];
    if (!v || v.x || v.y || m.model.kind !== 'elements') return m;
    const textures = { ...m.model.textures };
    let n = 0;
    const elements = m.model.elements.map((el) => {
      const faces = { ...el.faces };
      for (const dir of Object.keys(faces) as FaceDir[]) {
        const face = faces[dir];
        const tex = face && resolveFaceTexture(m.model.textures, face.texture);
        const rule = tex ? ruleFor(rules, block, tex, dir) : undefined;
        const tile = rule && SHOWN_METHODS.has(rule.method) ? ctmTile(rule, world, pos, dir, block, tex!) : undefined;
        if (!tile) continue;
        const name = `ctm_${n++}`;
        textures[name] = tile;
        faces[dir] = { ...face!, texture: `#${name}` };
        keys.push(`${dir}:${tile}`);
      }
      return { ...el, faces };
    });
    return n ? { ...m, model: { ...m.model, textures, elements } } : m;
  });
  return { models: out, key: keys.join(',') };
}

/** Only the faces that have an emissive overlay, showing that overlay; undefined if there are none. */
export function emissiveModels(store: AssetStore, models: ResolvedItemModel[], suffix: string | undefined): ResolvedItemModel[] | undefined {
  if (!suffix) return undefined;
  let any = false;
  const out = models.map((m) => {
    if (m.model.kind !== 'elements') return { ...m, model: { ...m.model, elements: [] } };
    const textures = { ...m.model.textures };
    let n = 0;
    const elements = m.model.elements
      .map((el) => {
        const faces: typeof el.faces = {};
        for (const [dir, face] of Object.entries(el.faces) as [FaceDir, NonNullable<(typeof el.faces)[FaceDir]>][]) {
          const tex = face && resolveFaceTexture(m.model.textures, face.texture);
          const glow = tex && emissiveOf(store, tex, suffix);
          if (!glow) continue;
          const name = `glow_${n++}`;
          textures[name] = glow;
          faces[dir] = { ...face, texture: `#${name}`, tintindex: undefined };
        }
        return { ...el, faces };
      })
      .filter((el) => Object.keys(el.faces).length);
    if (elements.length) any = true;
    return { ...m, model: { ...m.model, textures, elements } };
  });
  return any ? out : undefined;
}
