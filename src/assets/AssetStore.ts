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

/**
 * Layered view over a resource pack: vanilla files from the client jar, the loaded pack on top,
 * and the user's edits on top of that. An edit of `null` removes the pack's file so the vanilla
 * file shows through again.
 */
export class AssetStore {
  readonly edits = new Map<string, Uint8Array | null>();
  private readonly revs = new Map<string, number>();
  private jsonCache = new Map<string, unknown>();

  constructor(
    readonly vanilla: Map<string, Uint8Array>,
    readonly pack: Map<string, Uint8Array>,
  ) {}

  get(path: string): Uint8Array | undefined {
    if (this.edits.has(path)) return this.edits.get(path) ?? this.vanilla.get(path);
    return this.pack.get(path) ?? this.vanilla.get(path);
  }

  has(path: string): boolean {
    return this.get(path) !== undefined;
  }

  source(path: string): Source | undefined {
    if (this.edits.has(path)) return this.edits.get(path) ? 'edited' : this.vanilla.has(path) ? 'vanilla' : undefined;
    if (this.pack.has(path)) return 'pack';
    if (this.vanilla.has(path)) return 'vanilla';
    return undefined;
  }

  /** Revision counter of a single path, bumped on every edit. Used as cache key by renderers. */
  rev(path: string): number {
    return this.revs.get(path) ?? 0;
  }

  json<T = unknown>(path: string): T | undefined {
    if (this.jsonCache.has(path)) return this.jsonCache.get(path) as T | undefined;
    const bytes = this.get(path);
    let value: unknown;
    if (bytes) {
      try {
        value = parseLenientJson(decoder.decode(bytes));
      } catch (e) {
        console.warn(`Ungültiges JSON: ${path}`, e);
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
    return [...out].sort();
  }

  setEdit(path: string, data: Uint8Array | null): void {
    this.edits.set(path, data);
    this.touch(path);
  }

  clearEdit(path: string): void {
    this.edits.delete(path);
    this.touch(path);
  }

  /** True if removing the pack/edited file would reveal a vanilla file. */
  canRevertToVanilla(path: string): boolean {
    const src = this.source(path);
    return (src === 'pack' || src === 'edited') && this.vanilla.has(path);
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
    return out;
  }

  private touch(path: string) {
    this.revs.set(path, this.rev(path) + 1);
    this.jsonCache.delete(path);
  }
}
