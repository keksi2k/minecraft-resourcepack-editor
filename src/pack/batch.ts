import { parseLenientJson, type AssetStore } from '../assets/AssetStore';
import { scaleNearest } from '../render/frames';
import { adjustHsl, grayscale, invert, type Pixels } from '../render/pixelEdit';

/** One change applied to many textures at once. */
export type BatchOp =
  | { kind: 'hsl'; hue: number; saturation: number; lightness: number }
  | { kind: 'grayscale' }
  | { kind: 'invert' }
  | { kind: 'scale'; factor: number };

/** Applies a colour operation to pixels in place; scaling returns a new image. */
export function applyOp(p: Pixels, op: BatchOp): Pixels {
  switch (op.kind) {
    case 'hsl':
      adjustHsl(p, op.hue, op.saturation, op.lightness);
      return p;
    case 'grayscale':
      grayscale(p);
      return p;
    case 'invert':
      invert(p);
      return p;
    case 'scale':
      return scaleNearest(p, p.width * op.factor, p.height * op.factor);
  }
}

/**
 * A `.mcmeta` after its texture was scaled: explicit animation frame sizes are in image pixels and
 * grow with it. GUI scaling sizes are in GUI pixels and stay. Undefined if nothing changes.
 */
export function scaleMeta(meta: any, factor: number): any | undefined {
  const anim = meta?.animation;
  if (!anim || typeof anim !== 'object' || (anim.width === undefined && anim.height === undefined)) return undefined;
  const next = { ...anim };
  if (typeof anim.width === 'number') next.width = anim.width * factor;
  if (typeof anim.height === 'number') next.height = anim.height * factor;
  return { ...meta, animation: next };
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/**
 * Runs `op` on every texture in `paths`. Returns the new file contents (textures, and `.mcmeta`
 * files that have to follow a scaled texture) without changing the store.
 */
export async function runBatch(
  store: AssetStore,
  paths: string[],
  op: BatchOp,
  codec: { decode: (b: Uint8Array) => Promise<Pixels>; encode: (p: Pixels) => Promise<Uint8Array> },
  onProgress?: (done: number, total: number) => void,
): Promise<Map<string, Uint8Array>> {
  const out = new Map<string, Uint8Array>();
  let done = 0;
  for (const path of paths) {
    const bytes = store.get(path);
    if (bytes) {
      try {
        const result = applyOp(await codec.decode(bytes), op);
        out.set(path, await codec.encode(result));
        if (op.kind === 'scale') {
          const metaBytes = store.get(`${path}.mcmeta`);
          const meta = metaBytes && scaleMeta(parseLenientJson(decoder.decode(metaBytes)), op.factor);
          if (meta) out.set(`${path}.mcmeta`, encoder.encode(JSON.stringify(meta, null, 2)));
        }
      } catch (e) {
        console.warn(`Batch: skipped ${path}`, e);
      }
    }
    onProgress?.(++done, paths.length);
    // let the page breathe on large batches
    if (done % 16 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}
