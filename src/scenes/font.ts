import { parseLenientJson, type AssetStore } from '../assets/AssetStore';
import { normalizeRL, parseRL, texturePath } from '../models/resourceLocation';
import type { Pixels } from '../render/pixelEdit';
import { parseFormatted, type Segment } from '../texts/formatting';

/**
 * Minecraft's bitmap fonts (assets/<ns>/font/*.json): `bitmap` providers cut a PNG into a grid of
 * glyphs, `space` providers give advances, `reference` includes another font. Fonts are merged
 * across packs: the pack's providers come before vanilla's, and the first one that has a character
 * draws it. `ttf` and `unihex` (unifont) providers aren't read; their characters fall back to a
 * system font in the preview.
 */

export interface BitmapProvider {
  type: 'bitmap';
  /** Texture path of the glyph sheet. */
  file: string;
  ascent: number;
  height: number;
  /** One string per row of the sheet. */
  chars: string[];
  /** Which layer the provider came from. */
  from: 'pack' | 'vanilla';
  /** The font file that defines it. */
  defPath: string;
}

export interface SpaceProvider {
  type: 'space';
  advances: Record<string, number>;
  from: 'pack' | 'vanilla';
  defPath: string;
}

export type FontProvider = BitmapProvider | SpaceProvider;

export interface Glyph {
  provider: BitmapProvider;
  /** Cell in the sheet (source pixels). */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Source pixels to screen pixels. */
  scale: number;
  /** Screen pixels the pen moves on. */
  advance: number;
}

export interface Font {
  id: string;
  providers: FontProvider[];
  sheets: Map<string, Pixels>;
  glyph(cp: number): Glyph | undefined;
  space(cp: number): number | undefined;
}

export const fontPath = (id: string) => {
  const { ns, path } = parseRL(id);
  return `assets/${ns}/font/${path}.json`;
};

const decoder = new TextDecoder();

function readLayer(store: AssetStore, path: string, layer: 'pack' | 'vanilla'): any {
  let bytes: Uint8Array | undefined | null;
  if (layer === 'vanilla') bytes = store.vanilla.get(path);
  else bytes = store.edits.has(path) ? store.edits.get(path) : store.pack.get(path);
  if (!bytes) return undefined;
  try {
    return parseLenientJson(decoder.decode(bytes));
  } catch {
    return undefined;
  }
}

/** A provider applies to the normal font unless its filter asks for an option (uniform, jp) to be on. */
const filtered = (p: any) => p?.filter && typeof p.filter === 'object' && Object.values(p.filter).some((v) => v === true);

/** The providers of a font in lookup order, references expanded. */
export function fontProviders(store: AssetStore, id = 'minecraft:default', seen = new Set<string>()): FontProvider[] {
  const key = normalizeRL(id);
  if (seen.has(key)) return [];
  seen.add(key);
  const path = fontPath(key);
  const out: FontProvider[] = [];
  for (const layer of ['pack', 'vanilla'] as const) {
    const json = readLayer(store, path, layer);
    for (const p of Array.isArray(json?.providers) ? json.providers : []) {
      if (filtered(p)) continue;
      const type = String(p?.type ?? '').replace(/^minecraft:/, '');
      if (type === 'reference' && typeof p.id === 'string') out.push(...fontProviders(store, p.id, new Set(seen)));
      else if (type === 'bitmap' && typeof p.file === 'string' && Array.isArray(p.chars)) {
        const file = normalizeRL(p.file.replace(/\.png$/, ''));
        out.push({
          type: 'bitmap',
          file: texturePath(file),
          ascent: Number(p.ascent) || 0,
          height: Number(p.height) || 8,
          chars: p.chars.filter((c: unknown) => typeof c === 'string'),
          from: layer,
          defPath: path,
        });
      } else if (type === 'space' && p.advances && typeof p.advances === 'object') {
        out.push({ type: 'space', advances: p.advances, from: layer, defPath: path });
      }
    }
  }
  return out;
}

/** The characters of a bitmap provider's rows, as code points (`\u0000` marks an empty cell). */
export const rowCodePoints = (row: string) => Array.from(row, (c) => c.codePointAt(0)!);

/** Width of a glyph in source pixels: up to its rightmost column that isn't transparent. */
export function glyphWidth(sheet: Pixels, sx: number, sy: number, sw: number, sh: number): number {
  for (let x = sw - 1; x >= 0; x--) {
    for (let y = 0; y < sh; y++) {
      if (sheet.data[((sy + y) * sheet.width + sx + x) * 4 + 3] !== 0) return x + 1;
    }
  }
  return 0;
}

/** Builds the glyph table from providers and their decoded sheets. */
export function buildFont(id: string, providers: FontProvider[], sheets: Map<string, Pixels>): Font {
  const glyphs = new Map<number, Glyph>();
  const spaces = new Map<number, number>();
  for (const p of providers) {
    if (p.type === 'space') {
      for (const [ch, adv] of Object.entries(p.advances)) {
        const cp = ch.codePointAt(0);
        if (cp !== undefined && !glyphs.has(cp) && !spaces.has(cp)) spaces.set(cp, Number(adv) || 0);
      }
      continue;
    }
    const sheet = sheets.get(p.file);
    if (!sheet || !p.chars.length) continue;
    const rows = p.chars.map(rowCodePoints);
    const cols = Math.max(...rows.map((r) => r.length));
    const sw = Math.floor(sheet.width / cols);
    const sh = Math.floor(sheet.height / rows.length);
    if (!sw || !sh) continue;
    const scale = p.height / sh;
    rows.forEach((row, r) =>
      row.forEach((cp, c) => {
        if (cp === 0 || glyphs.has(cp) || spaces.has(cp)) return;
        const w = glyphWidth(sheet, c * sw, r * sh, sw, sh);
        glyphs.set(cp, { provider: p, sx: c * sw, sy: r * sh, sw, sh, scale, advance: Math.floor(0.5 + w * scale) + 1 });
      }),
    );
  }
  return { id, providers, sheets, glyph: (cp) => glyphs.get(cp), space: (cp) => spaces.get(cp) };
}

/** Loads a font with its glyph sheets from the store. */
export async function loadFont(store: AssetStore, id = 'minecraft:default', decode: (bytes: Uint8Array) => Promise<Pixels>): Promise<Font> {
  const providers = fontProviders(store, id);
  const sheets = new Map<string, Pixels>();
  await Promise.all(
    [...new Set(providers.flatMap((p) => (p.type === 'bitmap' ? [p.file] : [])))].map(async (file) => {
      const bytes = store.get(file);
      if (bytes) sheets.set(file, await decode(bytes).catch(() => undefined as unknown as Pixels));
    }),
  );
  for (const [k, v] of sheets) if (!v) sheets.delete(k);
  return buildFont(id, providers, sheets);
}

/** Characters no bitmap provider has are drawn at roughly unifont's size. */
export const FALLBACK_ADVANCE = 6;

export interface TextRun {
  cp: number;
  x: number;
  glyph?: Glyph;
  style: Omit<Segment, 'text'>;
  advance: number;
}

/** Positions every character of § text (in GUI pixels, before scaling). */
export function layoutText(font: Font, text: string): { runs: TextRun[]; width: number } {
  const runs: TextRun[] = [];
  let x = 0;
  for (const seg of parseFormatted(text)) {
    const { text: s, ...style } = seg;
    for (const ch of s) {
      const cp = ch.codePointAt(0)!;
      const space = font.space(cp);
      const glyph = space === undefined ? font.glyph(cp) : undefined;
      let advance = space ?? glyph?.advance ?? FALLBACK_ADVANCE;
      if (style.bold && space === undefined) advance += 1;
      runs.push({ cp, x, glyph, style, advance });
      x += advance;
    }
  }
  return { runs, width: x };
}

export const textWidth = (font: Font, text: string) => layoutText(font, text).width;

/** Private use characters (U+E000 …) are free for a pack's own glyphs. */
export const PRIVATE_USE_START = 0xe000;

/** The first private use character no provider of the font has yet. */
export function nextFreeChar(providers: FontProvider[]): string {
  const used = new Set<number>();
  for (const p of providers) {
    if (p.type === 'bitmap') p.chars.forEach((row) => rowCodePoints(row).forEach((cp) => used.add(cp)));
    else Object.keys(p.advances).forEach((c) => used.add(c.codePointAt(0)!));
  }
  let cp = PRIVATE_USE_START;
  while (used.has(cp)) cp++;
  return String.fromCodePoint(cp);
}

export interface GlyphSpec {
  /** Resource location of the glyph image (`minecraft:font/custom/heart.png`). */
  file: string;
  char: string;
  height: number;
  ascent: number;
}

/** The pack's font file with one more single-glyph bitmap provider. */
export function addGlyph(json: any, g: GlyphSpec): any {
  const providers = Array.isArray(json?.providers) ? json.providers : [];
  return { ...(json ?? {}), providers: [...providers, { type: 'bitmap', file: g.file, ascent: g.ascent, height: g.height, chars: [g.char] }] };
}

/** The pack's font file without the bitmap provider that draws `char` alone. */
export function removeGlyph(json: any, char: string): any {
  const providers = Array.isArray(json?.providers) ? json.providers : [];
  return {
    ...json,
    providers: providers.filter((p: any) => !(p?.type?.replace?.(/^minecraft:/, '') === 'bitmap' && Array.isArray(p.chars) && p.chars.length === 1 && p.chars[0] === char)),
  };
}

export const codePointLabel = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
