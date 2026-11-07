import { parseLenientJson, type AssetStore } from '../assets/AssetStore';
import { normalizeRL, parseRL, texturePath } from './resourceLocation';

/** Files the game combines into a texture that exists only in its atlas (armour trims on items). */
export interface TexturePermutation {
  /** Greyscale-coded template that gets recoloured. */
  template: string;
  /** The template's colours, in the same order as `palette`. */
  key: string;
  /** The colours they become. */
  palette: string;
}

interface AtlasSource {
  type?: string;
  textures?: string[];
  palette_key?: string;
  permutations?: Record<string, string>;
  separator?: string;
}

const ATLAS = /^assets\/[^/]+\/atlases\/[^/]+\.json$/;
const decoder = new TextDecoder();

/** Palettes live in `textures/palettes/` since 26.x; before that their ids were plain texture ids. */
function palettePath(store: AssetStore, id: string): string | undefined {
  const { ns, path } = parseRL(id);
  return [`assets/${ns}/textures/palettes/${path}.png`, `assets/${ns}/textures/${path}.png`].find((p) => store.has(p));
}

function sourcesOf(bytes: Uint8Array): AtlasSource[] {
  try {
    const sources = (parseLenientJson(decoder.decode(bytes)) as { sources?: unknown }).sources;
    return Array.isArray(sources) ? sources : [];
  } catch {
    return [];
  }
}

function buildIndex(store: AssetStore): Map<string, TexturePermutation> {
  const index = new Map<string, TexturePermutation>();
  for (const atlas of store.list('assets/').filter((p) => ATLAS.test(p))) {
    // the game adds up an atlas's sources from every pack, so a pack's file doesn't replace vanilla's
    const files = new Set([store.vanilla.get(atlas), store.get(atlas)]);
    for (const bytes of files) {
      if (!bytes) continue;
      for (const source of sourcesOf(bytes)) {
        if (normalizeRL(source.type ?? '') !== 'minecraft:paletted_permutations' || !source.palette_key) continue;
        const key = palettePath(store, source.palette_key);
        if (!key) continue;
        for (const texture of source.textures ?? []) {
          const template = texturePath(texture);
          if (!store.has(template)) continue;
          for (const [suffix, paletteId] of Object.entries(source.permutations ?? {})) {
            const palette = palettePath(store, paletteId);
            if (palette) index.set(`${normalizeRL(texture)}${source.separator ?? '_'}${suffix}`, { template, key, palette });
          }
        }
      }
    }
  }
  return index;
}

const indexes = new WeakMap<AssetStore, { changes: number; index: Map<string, TexturePermutation> }>();

/** How the game generates this texture, if an atlas defines it that way. */
export function texturePermutation(store: AssetStore, textureId: string): TexturePermutation | undefined {
  let cached = indexes.get(store);
  if (!cached || cached.changes !== store.changes) {
    cached = { changes: store.changes, index: buildIndex(store) };
    indexes.set(store, cached);
  }
  return cached.index.get(normalizeRL(textureId));
}

/** Every file the generated texture depends on. */
export const permutationFiles = (p: TexturePermutation) => [p.template, `${p.template}.mcmeta`, p.key, p.palette];

/**
 * Recolours RGBA pixels as the game's PaletteMapping does: each colour found in `key` becomes the
 * colour at the same position in `palette`; other colours stay, and the template's alpha is kept
 * (multiplied with the new colour's). Undefined if the palettes differ in size, which the game rejects.
 */
export function recolor(pixels: ArrayLike<number>, key: ArrayLike<number>, palette: ArrayLike<number>): Uint8ClampedArray | undefined {
  if (key.length !== palette.length) return undefined;
  const map = new Map<number, number>();
  for (let i = 0; i < key.length; i += 4) {
    if (key[i + 3] !== 0) map.set((key[i] << 16) | (key[i + 1] << 8) | key[i + 2], i);
  }
  const out = new Uint8ClampedArray(pixels.length);
  for (let i = 0; i < pixels.length; i += 4) {
    const alpha = pixels[i + 3];
    const at = alpha === 0 ? undefined : map.get((pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2]);
    const [from, base, newAlpha] = at === undefined ? [pixels, i, 255] : [palette, at, palette[at + 3]];
    out[i] = from[base];
    out[i + 1] = from[base + 1];
    out[i + 2] = from[base + 2];
    out[i + 3] = Math.floor((alpha * newAlpha) / 255);
  }
  return out;
}
