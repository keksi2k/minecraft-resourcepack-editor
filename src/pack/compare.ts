/**
 * Comparing the open pack with another one: which files the other pack has that this one lacks
 * or has differently, so single files (or whole folders) can be taken over.
 */

export type DiffStatus = 'new' | 'changed';
export type DiffKind = 'texture' | 'sound' | 'model' | 'text' | 'misc';

export interface DiffEntry {
  path: string;
  status: DiffStatus;
  kind: DiffKind;
  /** Folder for grouping, e.g. `minecraft/textures/block`. */
  folder: string;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function kindOf(path: string): DiffKind {
  if (/\/textures\/.+\.png(\.mcmeta)?$/.test(path) || path === 'pack.png') return 'texture';
  if (/\/sounds\/.+\.ogg$|\/sounds\.json$/.test(path)) return 'sound';
  if (/\/(models|items|blockstates)\/.+\.json$/.test(path)) return 'model';
  if (/\/(lang|texts|font)\//.test(path) || path === 'pack.mcmeta') return 'text';
  return 'misc';
}

export const folderOf = (path: string) => {
  const m = /^assets\/(.+)\/[^/]+$/.exec(path);
  return m ? m[1] : path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.';
};

/**
 * Files of `other` that differ from what the open pack shows (`current`, vanilla included): new
 * ones the open pack doesn't have at all, and changed ones. Files equal to what's shown are left out.
 */
export function comparePacks(current: (path: string) => Uint8Array | undefined, other: Map<string, Uint8Array>): DiffEntry[] {
  const out: DiffEntry[] = [];
  for (const [path, bytes] of other) {
    const mine = current(path);
    if (mine && bytesEqual(mine, bytes)) continue;
    out.push({ path, status: mine ? 'changed' : 'new', kind: kindOf(path), folder: folderOf(path) });
  }
  return out.sort((a, b) => a.folder.localeCompare(b.folder) || a.path.localeCompare(b.path));
}
