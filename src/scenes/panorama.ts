import type { Pixels } from '../render/pixelEdit';

/**
 * The title screen panorama: six images taken from one spot, like the game's panorama screenshot
 * does it: 0 straight ahead, 1–3 turned right by 90° each, 4 looking up and 5 looking down (both
 * from the direction of 0). World axes as in three.js: ahead is −Z, right +X, up +Y.
 */

export type Vec = [number, number, number];

export interface PanoramaFace {
  /** Direction the camera looked in. */
  forward: Vec;
  /** Image right and image up, seen from the centre. */
  right: Vec;
  up: Vec;
}

export const PANORAMA_FACES: PanoramaFace[] = [
  { forward: [0, 0, -1], right: [1, 0, 0], up: [0, 1, 0] },
  { forward: [1, 0, 0], right: [0, 0, 1], up: [0, 1, 0] },
  { forward: [0, 0, 1], right: [-1, 0, 0], up: [0, 1, 0] },
  { forward: [-1, 0, 0], right: [0, 0, -1], up: [0, 1, 0] },
  { forward: [0, 1, 0], right: [1, 0, 0], up: [0, 0, 1] },
  { forward: [0, -1, 0], right: [1, 0, 0], up: [0, 0, -1] },
];

export const panoramaPath = (i: number) => `assets/minecraft/textures/gui/title/background/panorama_${i}.png`;
/** Key of a panorama image in the asset index (vanilla panoramas aren't in the client jar). */
export const panoramaKey = (i: number) => `minecraft/textures/gui/title/background/panorama_${i}.png`;

/** The direction a pixel of a face shows (not normalised). */
export function faceDirection(face: PanoramaFace, u: number, v: number): Vec {
  // u, v in −1..1; v grows upwards
  return [0, 1, 2].map((k) => face.forward[k] + u * face.right[k] + v * face.up[k]) as Vec;
}

/** Longitude (0 ahead, growing to the right) and latitude (up positive) of a direction. */
export function directionAngles([x, y, z]: Vec): [number, number] {
  return [Math.atan2(x, -z), Math.atan2(y, Math.hypot(x, z))];
}

function sampleBilinear(src: Pixels, fx: number, fy: number, out: Uint8ClampedArray, o: number) {
  const { width: w, height: h, data } = src;
  const x0 = Math.floor(fx);
  const y0 = Math.max(0, Math.min(h - 1, Math.floor(fy)));
  const y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0;
  const ty = Math.max(0, Math.min(1, fy - y0));
  // the image wraps around horizontally
  const xa = ((x0 % w) + w) % w;
  const xb = (xa + 1) % w;
  for (let c = 0; c < 4; c++) {
    const a = data[(y0 * w + xa) * 4 + c] * (1 - tx) + data[(y0 * w + xb) * 4 + c] * tx;
    const b = data[(y1 * w + xa) * 4 + c] * (1 - tx) + data[(y1 * w + xb) * 4 + c] * tx;
    out[o + c] = a * (1 - ty) + b * ty;
  }
}

/**
 * Cuts a 360° image (equirectangular, twice as wide as high, the middle looking ahead) into the
 * six panorama faces.
 */
export function equirectToFaces(src: Pixels, size: number): Pixels[] {
  return PANORAMA_FACES.map((face) => {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let j = 0; j < size; j++) {
      for (let i = 0; i < size; i++) {
        const d = faceDirection(face, (2 * (i + 0.5)) / size - 1, 1 - (2 * (j + 0.5)) / size);
        const [lon, lat] = directionAngles(d);
        const fx = (lon / (2 * Math.PI) + 0.5) * src.width - 0.5;
        const fy = (0.5 - lat / Math.PI) * src.height - 0.5;
        sampleBilinear(src, fx, fy, data, (j * size + i) * 4);
      }
    }
    return { width: size, height: size, data };
  });
}

/** A good face size for a 360° image: a quarter of its width, as a power of two, at most 2048. */
export function faceSizeFor(width: number): number {
  const target = Math.max(16, Math.min(2048, width / 4));
  return 2 ** Math.round(Math.log2(target));
}
