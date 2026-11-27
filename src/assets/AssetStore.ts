export type Source = 'vanilla' | 'pack' | 'edited';

const decoder = new TextDecoder();

/** Minecraft's Gson parser is lenient; packs in the wild contain BOMs, comments and trailing commas. */
export function parseLenientJson(text: string): unknown {
  const clean = text.replace(/^﻿/, '');
  try {
    return JSON.parse(clean);
  } catch {
    const stripped = clean
      .replace(/("(?:[^"\\]|\\.)*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (_, str) => str ?? '')
      .replace(/,(\s*[}\]])/g, '$1');
    return JSON.parse(stripped);
  }
}

/** Width and height from a PNG's IHDR chunk. */
export function pngSize(png: Uint8Array): [number, number] | undefined {
  if (png.length < 24 || png[0] !== 0x89 || png[1] !== 0x50) return undefined;
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return [v.getUint32(16), v.getUint32(20)];
}

/** Frame size of an animation the way Minecraft works it out: explicit width/height, else square frames of the shorter side. */
export function frameSize(anim: { width?: number; height?: number }, w: number, h: number): [number, number] {
  return [anim.width ?? (anim.height !== undefined ? w : Math.min(w, h)), anim.height ?? (anim.width !== undefined ? h : Math.min(w, h))];
}

/**
 * The vanilla `.mcmeta` of an animated texture, made to fit a replacement image: frames the image
 * doesn't have are dropped. Undefined if the image can't be cut into frames the way Minecraft
 * would (it would then reject the texture, which is worse than showing the strip).
 */
export function animationMetaFor(png: Uint8Array, vanillaMeta: Uint8Array): Uint8Array | undefined {
  const size = pngSize(png);
  let meta: any;
  try {
    meta = parseLenientJson(decoder.decode(vanillaMeta));
  } catch {
    return undefined;
  }
  const anim = meta?.animation;
  if (!size || !anim || typeof anim !== 'object') return undefined;
  const [w, h] = size;
  const [fw, fh] = frameSize(anim, w, h);
  if (!fw || !fh || w % fw || h % fh) return undefined;
  const count = (w / fw) * (h / fh);
  if (!Array.isArray(anim.frames)) return vanillaMeta;
  const frames = anim.frames.filter((f: any) => {
    const i = typeof f === 'number' ? f : f?.index;
    return Number.isInteger(i) && i >= 0 && i < count;
  });
  if (frames.length === anim.frames.length) return vanillaMeta;
  const next = { ...meta, animation: { ...anim, frames } };
  if (!frames.length) delete next.animation.frames;
  return new TextEncoder().encode(JSON.stringify(next, null, 2));
}

/**
 * Layered view over a resource pack: vanilla files from the client jar, the loaded pack on top,
 * and the user's edits on top of that. An edit of `null` removes the pack's file so the vanilla
 * file shows through again.
 */
export class AssetStore {
  readonly edits = new Map<string, Uint8Array | null>();
  private readonly revs = new Map<string, number>();
  private jsonCache = new Map<string, unknown>();
  private changeCount = 0;
  private active: string[] = [];

  constructor(
    readonly vanilla: Map<string, Uint8Array>,
    readonly pack: Map<string, Uint8Array>,
  ) {}

  /** Overlay folders the game applies (lowest priority first); their files cover the pack's own. */
  get overlays(): readonly string[] {
    return this.active;
  }

  setOverlays(dirs: string[]): void {
    if (dirs.join('/') === this.active.join('/')) return;
    const before = this.active;
    this.active = [...dirs];
    // every path an old or new overlay covers may show something else now
    for (const dir of new Set([...before, ...dirs])) {
      for (const map of [this.pack, this.edits]) for (const p of map.keys()) if (p.startsWith(`${dir}/`)) this.bump(p.slice(dir.length + 1));
    }
    this.jsonCache.clear();
    this.changeCount++;
  }

  /** The overlay path that provides `path`, if an active overlay covers it (and no root edit does). */
  private overlaid(path: string): string | undefined {
    if (this.edits.has(path)) return undefined;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = `${this.active[i]}/${path}`;
      if (this.edits.has(p)) {
        if (this.edits.get(p)) return p;
        continue;
      }
      if (this.pack.has(p)) return p;
    }
    return undefined;
  }

  /** Where an edit of `path` goes: into the overlay the game reads it from, else the path itself. */
  writePath(path: string): string {
    return this.overlaid(path) ?? path;
  }

  /** The path holding the user's edit of `path` (in an overlay or not), if there is one. */
  editPath(path: string): string | undefined {
    if (this.edits.has(path)) return path;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = `${this.active[i]}/${path}`;
      if (this.edits.has(p)) return p;
    }
    return undefined;
  }

  get(path: string): Uint8Array | undefined {
    const o = this.overlaid(path);
    if (o) return this.edits.get(o) ?? this.pack.get(o);
    if (this.edits.has(path)) return this.edits.get(path) ?? this.vanilla.get(path);
    return this.pack.get(path) ?? this.vanilla.get(path);
  }

  has(path: string): boolean {
    return this.get(path) !== undefined;
  }

  source(path: string): Source | undefined {
    const o = this.overlaid(path);
    if (o) return this.edits.has(o) ? 'edited' : 'pack';
    if (this.edits.has(path)) return this.edits.get(path) ? 'edited' : this.vanilla.has(path) ? 'vanilla' : undefined;
    if (this.pack.has(path)) return 'pack';
    if (this.vanilla.has(path)) return 'vanilla';
    return undefined;
  }

  /** Revision counter of a single path, bumped on every edit. Used as cache key by renderers. */
  rev(path: string): number {
    return this.revs.get(path) ?? 0;
  }

  /** Goes up with every edit of any file; for caches built from many files. */
  get changes(): number {
    return this.changeCount;
  }

  json<T = unknown>(path: string): T | undefined {
    if (this.jsonCache.has(path)) return this.jsonCache.get(path) as T | undefined;
    const bytes = this.get(path);
    let value: unknown;
    if (bytes) {
      try {
        value = parseLenientJson(decoder.decode(bytes));
      } catch (e) {
        console.warn(`Invalid JSON: ${path}`, e);
      }
    }
    this.jsonCache.set(path, value);
    return value as T | undefined;
  }

  /** All visible paths starting with `prefix`. */
  list(prefix = ''): string[] {
    const out = new Set<string>();
    for (const map of [this.vanilla, this.pack, this.edits]) {
      for (const p of map.keys()) if (p.startsWith(prefix) && this.has(p)) out.add(p);
    }
    // files only an overlay has show at the path the game sees them at
    for (const dir of this.active) {
      for (const map of [this.pack, this.edits]) {
        for (const p of map.keys()) {
          if (!p.startsWith(`${dir}/`)) continue;
          const inner = p.slice(dir.length + 1);
          if (inner.startsWith(prefix) && this.has(inner)) out.add(inner);
        }
      }
    }
    return [...out].sort();
  }

  setEdit(path: string, data: Uint8Array | null): void {
    this.edits.set(path, data);
    this.touch(path);
  }

  /** Adds a vanilla file fetched later (from the asset index, e.g. the title panorama). */
  addVanilla(path: string, data: Uint8Array): void {
    this.vanilla.set(path, data);
    this.touch(path);
  }

  clearEdit(path: string): void {
    this.edits.delete(path);
    this.touch(path);
  }

  /** True if removing the pack/edited file would reveal a vanilla file. */
  canRevertToVanilla(path: string): boolean {
    const src = this.source(path);
    return (src === 'pack' || src === 'edited') && this.vanilla.has(path) && !this.overlaid(path);
  }

  get editCount(): number {
    return this.edits.size;
  }

  /** Files that make up the pack as it should be exported. */
  exportFiles(): Map<string, Uint8Array> {
    const out = new Map(this.pack);
    for (const [path, data] of this.edits) {
      if (data) out.set(path, data);
      else out.delete(path);
    }
    // Minecraft reads a texture's .mcmeta only from the pack that provides the texture. Without
    // it, a replaced animated texture (sea lantern, fire, prismarine…) shows its whole strip.
    for (const path of [...out.keys()]) {
      if (!path.endsWith('.png') || out.has(`${path}.mcmeta`)) continue;
      const meta = this.vanilla.get(`${path}.mcmeta`);
      const fixed = meta && animationMetaFor(out.get(path)!, meta);
      if (fixed) out.set(`${path}.mcmeta`, fixed);
    }
    // …and the other way round: a .mcmeta without its texture in the pack would be ignored.
    for (const path of [...out.keys()]) {
      const png = path.endsWith('.png.mcmeta') ? path.slice(0, -'.mcmeta'.length) : undefined;
      const vanilla = png && !out.has(png) ? this.vanilla.get(png) : undefined;
      if (png && vanilla) out.set(png, vanilla);
    }
    return out;
  }

  private touch(path: string) {
    this.bump(path);
    // a file in an active overlay changes what the game sees at its inner path
    for (const dir of this.active) if (path.startsWith(`${dir}/`)) this.bump(path.slice(dir.length + 1));
    this.changeCount++;
  }

  private bump(path: string) {
    this.revs.set(path, this.rev(path) + 1);
    this.jsonCache.delete(path);
  }
}
