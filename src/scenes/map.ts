import type { AssetStore } from '../assets/AssetStore';
import { blankPixels } from '../render/frames';
import type { Pixels } from '../render/pixelEdit';

/**
 * A filled map as held in the hand: the pack's map background, made-up land in the game's map
 * colours (those come from the game's code, a pack can't change them) and the pack's decorations.
 */

/** Some of the game's map colours (MapColor), as base RGB. */
export const MAP_COLORS = {
  grass: 0x7fb238,
  sand: 0xf7e9a3,
  plant: 0x007c00,
  stone: 0x707070,
  snow: 0xffffff,
  water: 0x4040ff,
  dirt: 0x976d4d,
  wood: 0x8f7748,
} as const;

/** The four shades every map colour comes in: low, normal, high, lowest (of 255). */
export const SHADES = [180, 220, 255, 135] as const;

export const shade = (rgb: number, s: number): [number, number, number] => [((rgb >> 16) & 255) * s / 255, ((rgb >> 8) & 255) * s / 255, (rgb & 255) * s / 255].map(Math.floor) as [number, number, number];

/** Deterministic smooth noise in 0…1. */
function noise(x: number, y: number, seed: number): number {
  const hash = (i: number, j: number) => {
    let h = (i * 374761393 + j * 668265263 + seed * 982451653) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * s(fx);
  const b = hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * s(fx);
  return a + (b - a) * s(fy);
}

const SEA = 62;

/** Terrain heights for a 128×128 map. */
export function mapHeights(seed = 1): Float32Array {
  const h = new Float32Array(128 * 128);
  for (let z = 0; z < 128; z++)
    for (let x = 0; x < 128; x++) {
      const n = noise(x / 40, z / 40, seed) * 0.6 + noise(x / 14, z / 14, seed + 1) * 0.3 + noise(x / 5, z / 5, seed + 2) * 0.1;
      h[z * 128 + x] = 40 + n * 50;
    }
  return h;
}

/**
 * The map's pixels: water shaded by depth, land by the slope towards north (with the game's
 * checker dither), colours by height.
 */
export function drawMapTerrain(seed = 1): Pixels {
  const heights = mapHeights(seed);
  const out = blankPixels(128, 128);
  for (let z = 0; z < 128; z++)
    for (let x = 0; x < 128; x++) {
      const h = Math.floor(heights[z * 128 + x]);
      const north = Math.floor(heights[Math.max(0, z - 1) * 128 + x]);
      const checker = (x + z) & 1;
      let color: number;
      let s: number;
      if (h < SEA) {
        color = MAP_COLORS.water;
        const d = (SEA - h) * 0.1 + checker * 0.2;
        s = d < 0.5 ? 2 : d > 0.9 ? 0 : 1;
      } else {
        const forest = noise(x / 9, z / 9, seed + 7) > 0.62;
        color = h < SEA + 2 ? MAP_COLORS.sand : h > 84 ? MAP_COLORS.snow : h > 76 ? MAP_COLORS.stone : forest ? MAP_COLORS.plant : MAP_COLORS.grass;
        const d = (h - north) * 0.8 + (checker - 0.5) * 0.4;
        s = d > 0.6 ? 2 : d < -0.6 ? 0 : 1;
      }
      out.data.set([...shade(color, SHADES[s]), 255], (z * 128 + x) * 4);
    }
  return out;
}

/** The decoration sprites (texture ids) the pack has, by name. */
export function mapDecorations(store: AssetStore): string[] {
  const dir = 'assets/minecraft/textures/map/decorations/';
  return store
    .list(dir)
    .filter((p) => p.endsWith('.png') && !p.slice(dir.length).includes('/'))
    .map((p) => `minecraft:map/decorations/${p.slice(dir.length, -4)}`)
    .sort();
}

export interface Placed {
  /** Decoration name, e.g. `player`. */
  name: string;
  /** Centre in map pixels (0…128). */
  x: number;
  y: number;
  /** Rotation in 16ths of a turn, as the game stores it. */
  rot: number;
}

/** Where the preview puts a few decorations; the chosen one goes beside the player. */
export const PLACED: Placed[] = [
  { name: 'player', x: 64, y: 64, rot: 2 },
  { name: 'frame', x: 30, y: 40, rot: 0 },
  { name: 'red_x', x: 98, y: 92, rot: 0 },
  { name: 'white_banner', x: 40, y: 100, rot: 0 },
  { name: 'target_point', x: 100, y: 30, rot: 0 },
  { name: 'plains_village', x: 80, y: 46, rot: 0 },
];

/** The in-hand map: background from -7 to 135 around the 128 px map (142 px in all). */
export const MAP_FRAME = 7;
/** Decorations are 8 map pixels across. */
export const DECORATION = 8;
