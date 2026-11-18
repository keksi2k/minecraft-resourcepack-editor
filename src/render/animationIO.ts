import { frameSize, pngSize } from '../assets/AssetStore';
import { parseAnimation } from './animation';
import { animationFromDelays, importFrameSize, renderAnimation, stackFrames, upscaleFrames } from './frames';
import { decodeGif, encodeGif, isGif } from './gif';
import type { Pixels } from './pixelEdit';
import { decodeImage, encodePng } from './png';

/** Natural sort, so frame_2.png comes before frame_10.png. */
const byName = (a: File, b: File) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

/** Frames from an animated GIF (with its timing) or from several images (in file name order). */
export async function readFrames(files: File[]): Promise<{ frames: Pixels[]; delaysMs?: number[] }> {
  if (files.length === 1) {
    const bytes = new Uint8Array(await files[0].arrayBuffer());
    if (isGif(bytes)) {
      const gif = decodeGif(bytes);
      return { frames: gif.frames.map((f) => ({ width: gif.width, height: gif.height, data: f.pixels })), delaysMs: gif.frames.map((f) => f.delayMs) };
    }
  }
  return { frames: await Promise.all([...files].sort(byName).map((f) => decodeImage(f))) };
}

/**
 * Turns imported frames into a texture: a vertical strip plus its `.mcmeta`. The existing
 * `.mcmeta` keeps its other settings (interpolation, GUI scaling …); its frame list is replaced.
 */
export async function buildAnimation(
  frames: Pixels[],
  delaysMs: number[] | undefined,
  current: { png?: Uint8Array; meta?: Record<string, any> },
): Promise<{ png: Uint8Array; meta: Record<string, any>; size: [number, number] }> {
  const size = current.png && pngSize(current.png);
  const curFrame = size ? frameSize(current.meta?.animation ?? {}, ...size) : undefined;
  const [fw, fh] = importFrameSize(frames, curFrame);
  const png = await encodePng(stackFrames(frames, fw, fh));
  const old = current.meta?.animation ?? {};
  const timing = delaysMs ? animationFromDelays(delaysMs) : { frametime: old.frametime ?? 5 };
  const animation: Record<string, unknown> = { ...old, ...timing };
  if (!('frames' in timing)) delete animation.frames;
  delete animation.width;
  delete animation.height;
  if (fw !== fh) Object.assign(animation, { width: fw, height: fh });
  return { png, meta: { ...current.meta, animation }, size: [fw, fh] };
}

/** The texture's animation as a looping GIF, scaled up to about 256 px wide. */
export async function animationToGif(png: Uint8Array, animJson: unknown): Promise<Uint8Array> {
  const sheet = await decodeImage(png);
  const anim = parseAnimation(animJson, sheet.width, sheet.height);
  if (!anim) throw new Error('Not animated');
  const factor = Math.max(1, Math.min(16, Math.round(256 / anim.fw)));
  const frames = upscaleFrames(renderAnimation(sheet, anim), anim.fw, anim.fh, factor);
  return encodeGif(anim.fw * factor, anim.fh * factor, frames);
}
