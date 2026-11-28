import { parseLenientJson } from '../assets/AssetStore';
import { bytesEqual } from './compare';

/**
 * Stacking several packs into one, the way Minecraft layers the packs selected in its pack list:
 * for most files the pack higher up wins, but some files are combined from every pack that has
 * them, as the game reads them all —
 * - `lang/*.json`: key by key, the higher pack's text winning,
 * - `sounds.json`: event by event; a pack's event adds its sounds to those below, unless it says
 *   `replace`; the highest subtitle wins,
 * - `atlases/*.json` and `font/*.json`: their `sources` / `providers` lists one after another,
 *   from the lowest pack up (the order the game reads them in).
 * Only files under `assets/` are stacked; pack.mcmeta, pack.png and overlay folders stay the open pack's.
 */

export interface StackLayer {
  name: string;
  files: Map<string, Uint8Array>;
}

export type MergeKind = 'lang' | 'sounds' | 'atlas' | 'font';

export function mergeKindOf(path: string): MergeKind | undefined {
  if (/^assets\/[^/]+\/lang\/[^/]+\.json$/.test(path)) return 'lang';
  if (/^assets\/[^/]+\/sounds\.json$/.test(path)) return 'sounds';
  if (/^assets\/[^/]+\/atlases\/.+\.json$/.test(path)) return 'atlas';
  if (/^assets\/[^/]+\/font\/[^/]+\.json$/.test(path)) return 'font';
  return undefined;
}

export interface StackResult {
  files: Map<string, Uint8Array>;
  /** For every file: the index of the layer it comes from, or `merged` when several were combined. */
  origin: Map<string, number | 'merged'>;
  /** Files combined from several packs, with the layers that took part. */
  merged: Map<string, number[]>;
  /** Files a lower pack had that a higher one replaced, per hidden layer. */
  hidden: number[];
  /** Files that couldn't be combined (broken JSON): the highest one was taken. */
  unreadable: string[];
}

const decoder = new TextDecoder();
const encode = (o: unknown) => new TextEncoder().encode(JSON.stringify(o, null, 2));
const readJson = (bytes: Uint8Array): any => parseLenientJson(decoder.decode(bytes));
const isObject = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Combines the versions of one file, given from the lowest pack up. */
function combine(kind: MergeKind, versions: Uint8Array[]): Uint8Array {
  const jsons = versions.map(readJson);
  if (!jsons.every(isObject)) throw new Error('not an object');
  switch (kind) {
    case 'lang':
      return encode(Object.assign({}, ...jsons));
    case 'sounds': {
      const out: Record<string, any> = {};
      for (const json of jsons)
        for (const [event, def] of Object.entries(json)) {
          if (!isObject(def)) continue;
          const sounds = Array.isArray(def.sounds) ? def.sounds : [];
          const prev = out[event];
          const next: Record<string, any> = def.replace || !prev ? { ...def, sounds: [...sounds] } : { ...prev, sounds: [...prev.sounds, ...sounds] };
          // the bottom of the stack (vanilla) is below every pack: a replace anywhere stays a replace
          if (def.replace || prev?.replace) next.replace = true;
          else delete next.replace;
          if (def.subtitle !== undefined) next.subtitle = def.subtitle;
          out[event] = next;
        }
      return encode(out);
    }
    case 'atlas':
      return encode({ ...Object.assign({}, ...jsons), sources: jsons.flatMap((j) => (Array.isArray(j.sources) ? j.sources : [])) });
    case 'font':
      return encode({ ...Object.assign({}, ...jsons), providers: jsons.flatMap((j) => (Array.isArray(j.providers) ? j.providers : [])) });
  }
}

/** Stacks `layers`, given top first (like Minecraft's list of selected packs). */
export function stackPacks(layers: StackLayer[]): StackResult {
  const files = new Map<string, Uint8Array>();
  const origin = new Map<string, number | 'merged'>();
  const merged = new Map<string, number[]>();
  const hidden = layers.map(() => 0);
  const unreadable: string[] = [];
  const paths = new Set(layers.flatMap((l) => [...l.files.keys()].filter((p) => p.startsWith('assets/'))));
  for (const path of [...paths].sort()) {
    const having = layers.map((_, i) => i).filter((i) => layers[i].files.has(path));
    const top = having[0];
    const kind = mergeKindOf(path);
    // the same bytes in several packs need no combining
    const distinct = having.filter((i) => !bytesEqual(layers[i].files.get(path)!, layers[top].files.get(path)!));
    if (kind && distinct.length) {
      try {
        files.set(path, combine(kind, [...having].reverse().map((i) => layers[i].files.get(path)!)));
        origin.set(path, 'merged');
        merged.set(path, having);
        continue;
      } catch {
        unreadable.push(path);
      }
    }
    files.set(path, layers[top].files.get(path)!);
    origin.set(path, top);
    for (const i of having.slice(1)) hidden[i]++;
  }
  return { files, origin, merged, hidden, unreadable };
}

/**
 * What stacking changes in the open pack: files whose stacked result differs from what the pack
 * shows now (`current`, vanilla included).
 */
export function stackChanges(result: StackResult, current: (path: string) => Uint8Array | undefined): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  for (const [path, bytes] of result.files) {
    const now = current(path);
    if (!now || !bytesEqual(now, bytes)) out.set(path, bytes);
  }
  return out;
}

/** Top-level folders of a pack other than assets/: overlay folders, which stacking leaves out. */
export function extraFolders(files: Map<string, Uint8Array>): string[] {
  return [...new Set([...files.keys()].filter((p) => p.includes('/') && !p.startsWith('assets/')).map((p) => p.split('/')[0]))].filter(
    (d) => d !== '__MACOSX',
  );
}
