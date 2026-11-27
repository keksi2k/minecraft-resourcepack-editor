/**
 * Overlays (pack.mcmeta `overlays.entries`, 1.20.2+): folders beside `assets/` that hold files for
 * some game versions only. Every entry whose format range includes the game's format is applied
 * on top of the pack's own files; later entries win over earlier ones.
 */

export interface Overlay {
  directory: string;
  /** Inclusive range of resource pack formats. */
  min: number;
  max: number;
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Array.isArray(v) && typeof v[0] === 'number' ? v[0] : undefined);

/** One entry's range: `formats` (number, [min, max] or {min_inclusive, max_inclusive}) or `min_format`/`max_format`. */
function rangeOf(e: any): [number, number] | undefined {
  const min = num(e?.min_format);
  const max = num(e?.max_format);
  if (min !== undefined || max !== undefined) return [min ?? max!, max ?? min!];
  const f = e?.formats;
  if (typeof f === 'number') return [f, f];
  if (Array.isArray(f) && f.length === 2 && f.every((x) => typeof x === 'number')) return [f[0], f[1]];
  if (f && typeof f === 'object' && typeof f.min_inclusive === 'number' && typeof f.max_inclusive === 'number') return [f.min_inclusive, f.max_inclusive];
  return undefined;
}

/** Folder names Minecraft accepts for overlays. */
export const VALID_DIRECTORY = /^[a-z0-9_.-]+$/;

export function readOverlays(raw: any): Overlay[] {
  const entries = raw?.overlays?.entries;
  if (!Array.isArray(entries)) return [];
  const out: Overlay[] = [];
  for (const e of entries) {
    const range = rangeOf(e);
    if (typeof e?.directory === 'string' && range) out.push({ directory: e.directory, min: range[0], max: range[1] });
  }
  return out;
}

/** The overlay folders the game applies at this format, lowest priority first. */
export function activeOverlays(raw: any, gameFormat: number | undefined): string[] {
  if (gameFormat === undefined) return [];
  return readOverlays(raw)
    .filter((o) => gameFormat >= o.min && gameFormat <= o.max && VALID_DIRECTORY.test(o.directory))
    .map((o) => o.directory);
}

/**
 * pack.mcmeta with these overlays. Each entry gets both the old `formats` field and 1.21.9's
 * `min_format`/`max_format`, so every version that knows overlays reads it.
 */
export function writeOverlays(raw: any, overlays: Overlay[]): any {
  const next = { ...(raw ?? {}) };
  if (!overlays.length) {
    delete next.overlays;
    return next;
  }
  next.overlays = {
    ...(raw?.overlays ?? {}),
    entries: overlays.map((o) => ({ directory: o.directory, formats: [o.min, o.max], min_format: o.min, max_format: o.max })),
  };
  return next;
}

/** The overlay folder a pack path lies in, and the path inside it. */
export function splitOverlayPath(path: string, directories: string[]): { directory: string; inner: string } | undefined {
  for (const d of directories) if (path.startsWith(`${d}/`)) return { directory: d, inner: path.slice(d.length + 1) };
  return undefined;
}
