import { parseLenientJson, type AssetStore } from '../assets/AssetStore';
import type { Pixels } from '../render/pixelEdit';

/**
 * Biome colours. Grass, foliage and leaf litter take their colour from a colormap
 * (textures/colormap/*.png, 256×256) at a spot given by the biome's temperature and downfall,
 * unless the biome sets a colour of its own. The biomes come from the game's data
 * (data/minecraft/worldgen/biome/*.json).
 */

export const COLORMAPS = ['grass', 'foliage', 'dry_foliage'] as const;
export type Colormap = (typeof COLORMAPS)[number];
export const colormapPath = (map: Colormap) => `assets/minecraft/textures/colormap/${map}.png`;

export interface Biome {
  id: string;
  temperature: number;
  downfall: number;
  grassColor?: number;
  foliageColor?: number;
  dryFoliageColor?: number;
  grassModifier?: 'swamp' | 'dark_forest';
  waterColor?: number;
}

const BIOME = /^data\/minecraft\/worldgen\/biome\/([^/]+)\.json$/;

/** `#rrggbb` (26.x) or a number (older versions). */
export function parseColor(v: unknown): number | undefined {
  if (typeof v === 'number') return v & 0xffffff;
  if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) return parseInt(v.slice(1), 16);
  return undefined;
}

export function parseBiome(id: string, json: any): Biome | undefined {
  if (!json || typeof json !== 'object' || typeof json.temperature !== 'number') return undefined;
  const e = json.effects ?? {};
  const mod = String(e.grass_color_modifier ?? '');
  return {
    id,
    temperature: json.temperature,
    downfall: Number(json.downfall) || 0,
    grassColor: parseColor(e.grass_color),
    foliageColor: parseColor(e.foliage_color),
    dryFoliageColor: parseColor(e.dry_foliage_color),
    grassModifier: mod === 'swamp' || mod === 'dark_forest' ? mod : undefined,
    waterColor: parseColor(e.water_color),
  };
}

/** Biomes with grass: those of the overworld (the nether and the end have none). */
const NO_GRASS = /^(nether_wastes|soul_sand_valley|crimson_forest|warped_forest|basalt_deltas|the_end|end_highlands|end_midlands|small_end_islands|end_barrens|the_void)$/;

export function listBiomes(store: AssetStore): Biome[] {
  const out: Biome[] = [];
  for (const [path, bytes] of store.vanilla) {
    const m = BIOME.exec(path);
    if (!m || NO_GRASS.test(m[1])) continue;
    let json: unknown;
    try {
      json = parseLenientJson(new TextDecoder().decode(bytes));
    } catch {
      continue;
    }
    const b = parseBiome(`minecraft:${m[1]}`, json);
    if (b) out.push(b);
  }
  return out.sort((a, b) => a.temperature - b.temperature || a.downfall - b.downfall || a.id.localeCompare(b.id));
}

/** Where the game reads a biome's colour in a 256×256 colormap. */
export function colormapSpot(temperature: number, downfall: number): [number, number] {
  const t = Math.max(0, Math.min(1, temperature));
  const d = Math.max(0, Math.min(1, downfall)) * t;
  return [Math.floor((1 - t) * 255), Math.floor((1 - d) * 255)];
}

/** Colour at a colormap spot; a map of another size is read at the same relative spot. */
export function sampleColormap(map: Pixels | undefined, temperature: number, downfall: number, fallback: number): number {
  if (!map || map.width < 1 || map.height < 1) return fallback;
  const [x, y] = colormapSpot(temperature, downfall);
  const px = Math.min(map.width - 1, Math.floor((x * map.width) / 256));
  const py = Math.min(map.height - 1, Math.floor((y * map.height) / 256));
  const i = (py * map.width + px) * 4;
  return (map.data[i] << 16) | (map.data[i + 1] << 8) | map.data[i + 2];
}

export const GRASS_FALLBACK = 0xff00ff;
export const FOLIAGE_FALLBACK = 0x48b518;
export const DRY_FOLIAGE_FALLBACK = 0x8b6644;
/** Swamps pick one of two colours by noise; the more common one. */
export const SWAMP_GRASS = 0x6a7039;
export const SWAMP_GRASS_ALT = 0x4c763c;

export function darkForestGrass(c: number): number {
  return (((c & 0xfefefe) + 0x28340a) >> 1) & 0xffffff;
}

export interface BiomeColors {
  grass: number;
  foliage: number;
  dryFoliage: number;
  water: number;
  /** Which colours come from the biome instead of the colormap. */
  fixed: { grass: boolean; foliage: boolean; dryFoliage: boolean };
}

export function biomeColors(b: Biome, maps: Partial<Record<Colormap, Pixels>>): BiomeColors {
  let grass = b.grassColor ?? sampleColormap(maps.grass, b.temperature, b.downfall, GRASS_FALLBACK);
  if (b.grassModifier === 'swamp') grass = SWAMP_GRASS;
  else if (b.grassModifier === 'dark_forest') grass = darkForestGrass(grass);
  return {
    grass,
    foliage: b.foliageColor ?? sampleColormap(maps.foliage, b.temperature, b.downfall, FOLIAGE_FALLBACK),
    dryFoliage: b.dryFoliageColor ?? sampleColormap(maps.dry_foliage, b.temperature, b.downfall, DRY_FOLIAGE_FALLBACK),
    water: b.waterColor ?? 0x3f76e4,
    fixed: { grass: b.grassColor !== undefined || b.grassModifier === 'swamp', foliage: b.foliageColor !== undefined, dryFoliage: b.dryFoliageColor !== undefined },
  };
}

export const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
