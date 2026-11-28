/// <reference lib="webworker" />
// Compresses PNGs again with oxipng, off the main thread. The pixels stay exactly the same; the
// colour of fully transparent pixels too (the game's mipmaps can show them at edges).
import optimise from '@jsquash/oxipng/optimise';

export interface PngJob {
  id: number;
  bytes: Uint8Array;
}
export type PngResult = { id: number; bytes?: Uint8Array; error?: string };

self.onmessage = async (e: MessageEvent<PngJob>) => {
  const { id, bytes } = e.data;
  try {
    const out = new Uint8Array(await optimise(bytes.slice().buffer, { level: 3, interlace: false, optimiseAlpha: false }));
    (self as unknown as Worker).postMessage({ id, bytes: out } satisfies PngResult, [out.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: (err as Error).message } satisfies PngResult);
  }
};
