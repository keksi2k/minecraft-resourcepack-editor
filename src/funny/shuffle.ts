import type { AssetStore } from '../assets/AssetStore';
import { MOBS } from '../entities/catalog';
import { ENTITY_MODELS } from '../render/entityMesh';
import { parseRL } from '../models/resourceLocation';
import type { SoundsJsonFile } from '../sounds/editSounds';
import type { SoundEvent } from '../sounds/soundsJson';

/** Seeded random numbers in [0, 1), so a seed always gives the same mix. */
export function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pairs every item with another one of the list (none keeps its own), as target → donor. */
export function derange<T>(items: T[], random: () => number): Map<T, T> {
  const order = [...items];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const out = new Map<T, T>();
  if (order.length < 2) return out;
  order.forEach((t, i) => out.set(t, order[(i + 1) % order.length]));
  return out;
}

export const TEXTURE_SCOPES = ['item', 'block', 'entity', 'gui'] as const;
export type TextureScope = (typeof TEXTURE_SCOPES)[number];

const SCOPED = /^assets\/([^/]+)\/textures\/(item|block|entity|gui)\/(.+)\.png$/;

export function textureScope(path: string): TextureScope | undefined {
  return SCOPED.exec(path)?.[2] as TextureScope | undefined;
}

/** Width and height from a PNG header, without decoding the image. */
export function pngSize(bytes: Uint8Array | undefined): [number, number] | undefined {
  if (!bytes || bytes.length < 24 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
}

/** Fingerprint of a model layer's UV layout: textures of layers with the same one fit each other. */
function uvLayout(model: string): string | undefined {
  const layer = ENTITY_MODELS[model];
  if (!layer) return undefined;
  const faces: string[] = [];
  const walk = (part: (typeof layer)['root']) => {
    for (const cube of part.cubes) {
      for (const poly of cube) faces.push([3, 4, 8, 9, 13, 14, 18, 19].map((i) => Math.round(poly[i] * 4096)).join(','));
    }
    for (const child of Object.values(part.children)) walk(child);
  };
  walk(layer.root);
  let h = 0;
  for (const c of `${layer.tex.join('x')}|${faces.sort().join(';')}`) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}

let mobLayouts: Map<string, string> | undefined;

/** Texture id → UV layouts of the mob layers drawn with it. */
function mobTextureLayouts(): Map<string, string> {
  if (!mobLayouts) {
    const sets = new Map<string, Set<string>>();
    for (const mob of MOBS) {
      for (const l of mob.layers) {
        const uv = uvLayout(l.model);
        if (uv) (sets.get(l.texture) ?? sets.set(l.texture, new Set()).get(l.texture)!).add(uv);
      }
    }
    mobLayouts = new Map([...sets].map(([t, s]) => [t, [...s].sort().join('+')]));
  }
  return mobLayouts;
}

export interface TextureShuffleOptions {
  scopes: readonly TextureScope[];
  /** Mob textures swap with any of the same size, not only with mobs built the same way. */
  mobChaos?: boolean;
  /** Paths that must neither change nor be handed to others. */
  skip?: (path: string) => boolean;
}

/**
 * Texture paths that may be swapped with each other: same kind (item, block …), same size and both
 * animated or both not. Mob textures also need the same UV layout (zombie ↔ husk, but not pig ↔ cow);
 * other entity textures (chests, beds …) stay within their folder.
 */
export function textureGroups(store: AssetStore, opts: TextureShuffleOptions): string[][] {
  const layouts = mobTextureLayouts();
  const found: { path: string; key: string; layout?: string; folder?: string }[] = [];
  /** Layouts of known mob textures per folder and size. */
  const folderLayouts = new Map<string, Set<string>>();
  for (const path of store.list('assets/')) {
    const m = SCOPED.exec(path);
    const scope = m?.[2] as TextureScope | undefined;
    if (!m || !scope || !opts.scopes.includes(scope) || opts.skip?.(path)) continue;
    const size = pngSize(store.get(path));
    if (!size) continue;
    const key = `${scope}|${size.join('x')}|${store.has(`${path}.mcmeta`) ? 'meta' : ''}`;
    if (scope !== 'entity' || opts.mobChaos) {
      found.push({ path, key });
      continue;
    }
    const name = m[3].split('/').pop()!;
    // halves of double chests and the like have their own layout
    const side = /armor|crackiness/.test(name) ? 'overlay' : (/_(left|right|baby|overlay|outer_layer|eyes|collar)$/.exec(name)?.[1] ?? '');
    const folder = `${key}|${m[1]}/${m[3].split('/').slice(0, -1).join('/')}|${side}`;
    const layout = layouts.get(`${m[1]}:entity/${m[3]}`);
    if (layout) (folderLayouts.get(folder) ?? folderLayouts.set(folder, new Set()).get(folder)!).add(layout);
    found.push({ path, key, layout, folder });
  }

  const groups = new Map<string, string[]>();
  for (const { path, key, layout, folder } of found) {
    let group = key;
    if (folder) {
      // other textures in a mob's folder (e.g. more player skins) share its layout if it's the only one there
      const known = folderLayouts.get(folder);
      const inherited = known?.size === 1 ? [...known][0] : undefined;
      group = `${key}|${layout ?? inherited ?? folder}`;
    }
    (groups.get(group) ?? groups.set(group, []).get(group)!).push(path);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Which texture gets which other texture's image (target → donor). */
export function planTextureShuffle(store: AssetStore, opts: TextureShuffleOptions, random: () => number): Map<string, string> {
  const out = new Map<string, string>();
  for (const group of textureGroups(store, opts)) for (const [t, d] of derange(group, random)) out.set(t, d);
  return out;
}

export const SOUND_MODES = ['similar', 'category', 'wild'] as const;
export type SoundMode = (typeof SOUND_MODES)[number];

const isMusic = (id: string) => /^(music|music_disc)\./.test(parseRL(id).path);

/**
 * Which events may swap sounds: `similar` keeps the kind of sound (every `entity.*.ambient`, every
 * `block.*.step` …), `category` the first part (`entity`, `block` …), `wild` mixes everything.
 * Music only ever swaps with music, since it is streamed.
 */
export function soundGroup(id: string, mode: SoundMode): string {
  if (isMusic(id)) return 'music';
  const parts = parseRL(id).path.split('.');
  if (mode === 'wild') return 'all';
  if (mode === 'category') return parts[0];
  return `${parts[0]}.${parts.at(-1)}`;
}

/** Which event plays which other event's sounds (target → donor). Events without files stay. */
export function planSoundShuffle(
  events: SoundEvent[],
  mode: SoundMode,
  random: () => number,
  skip?: (id: string) => boolean,
): Map<string, string> {
  const groups = new Map<string, string[]>();
  for (const e of events) {
    if (e.files.length === 0 || skip?.(e.id)) continue;
    const g = soundGroup(e.id, mode);
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(e.id);
  }
  const out = new Map<string, string>();
  for (const ids of groups.values()) for (const [t, d] of derange(ids.sort(), random)) out.set(t, d);
  return out;
}

/**
 * Writes the swap into the pack's sounds.json files (per namespace): each target event replaces its
 * sounds with the donor's files, keeping its own subtitle. No audio is copied.
 */
export function applySoundShuffle(
  files: Record<string, SoundsJsonFile>,
  plan: Map<string, string>,
  events: SoundEvent[],
): Record<string, SoundsJsonFile> {
  const byId = new Map(events.map((e) => [e.id, e]));
  const out: Record<string, SoundsJsonFile> = {};
  for (const [target, donor] of plan) {
    const t = byId.get(target);
    const d = byId.get(donor);
    if (!t || !d) continue;
    const { ns, path } = parseRL(target);
    const json = (out[ns] ??= { ...files[ns] });
    const sounds = d.files.map((f) => {
      const entry: { name: string; volume?: number; pitch?: number; stream?: boolean } = { name: f.name };
      if (f.volume !== undefined && f.volume !== 1) entry.volume = f.volume;
      if (f.pitch !== undefined && f.pitch !== 1) entry.pitch = f.pitch;
      if (isMusic(donor)) entry.stream = true;
      return Object.keys(entry).length === 1 ? f.name : entry;
    });
    json[path] = { ...json[path], replace: true, ...(t.subtitle ? { subtitle: t.subtitle } : {}), sounds };
  }
  return out;
}
