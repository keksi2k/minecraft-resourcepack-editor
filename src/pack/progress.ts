import type { AssetStore } from '../assets/AssetStore';

/**
 * How far a pack is: per texture category, how many vanilla textures it replaces and which it
 * doesn't yet. Also which textures are new since an older game version (blocks and items added
 * by an update that a pack made for the old version can't have).
 */

export interface CategoryProgress {
  /** First folder below textures/, e.g. `block`, `item`, `entity`, `gui`. */
  category: string;
  total: number;
  changed: number;
  /** Vanilla textures the pack doesn't replace (paths). */
  untouched: string[];
}

const VANILLA_TEXTURE = /^assets\/minecraft\/textures\/([^/]+)\/.+\.png$/;

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Replaced = the pack (or an edit) has its own file that differs from vanilla. */
export function isReplaced(store: AssetStore, path: string): boolean {
  const src = store.source(path);
  if (src !== 'pack' && src !== 'edited') return false;
  const own = store.get(path);
  const vanilla = store.vanilla.get(path);
  return !!own && (!vanilla || !sameBytes(own, vanilla));
}

export function textureProgress(store: AssetStore): CategoryProgress[] {
  const by = new Map<string, CategoryProgress>();
  for (const path of store.vanilla.keys()) {
    const m = VANILLA_TEXTURE.exec(path);
    if (!m) continue;
    let c = by.get(m[1]);
    if (!c) by.set(m[1], (c = { category: m[1], total: 0, changed: 0, untouched: [] }));
    c.total++;
    if (isReplaced(store, path)) c.changed++;
    else c.untouched.push(path);
  }
  for (const c of by.values()) c.untouched.sort();
  return [...by.values()].sort((a, b) => b.total - a.total);
}

/** Share (0–1) of a category's textures the pack replaces. */
export const share = (c: { total: number; changed: number }) => (c.total ? c.changed / c.total : 0);

/** Categories the pack mostly covers: their untouched textures likely stick out in game. */
export const STYLE_THRESHOLD = 0.5;

/**
 * Textures in the current version that `older` didn't have and the pack doesn't replace, by category.
 * `older` holds the texture paths of the older version.
 */
export function newSince(store: AssetStore, older: Set<string>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const path of [...store.vanilla.keys()].sort()) {
    const m = VANILLA_TEXTURE.exec(path);
    if (!m || older.has(path) || isReplaced(store, path)) continue;
    out.set(m[1], [...(out.get(m[1]) ?? []), path]);
  }
  return out;
}
