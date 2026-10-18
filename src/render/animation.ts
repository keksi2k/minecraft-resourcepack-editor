/**
 * Shared clock for animated textures. Minecraft advances texture animations once per game tick
 * (20 per second); subscribers get the current time in (fractional) ticks on every animation frame.
 */
type Listener = (ticks: number) => void;

const listeners = new Set<Listener>();
let raf = 0;
const start = typeof performance !== 'undefined' ? performance.now() : 0;

function loop(now: number) {
  const ticks = ((now - start) / 1000) * 20;
  for (const l of listeners) l(ticks);
  raf = listeners.size ? requestAnimationFrame(loop) : 0;
}

export function subscribeTicks(listener: Listener): () => void {
  listeners.add(listener);
  if (!raf && typeof requestAnimationFrame !== 'undefined') raf = requestAnimationFrame(loop);
  return () => listeners.delete(listener);
}

export interface AnimationFrame {
  index: number;
  /** Duration in ticks. */
  time: number;
}

/** A texture's `.mcmeta` animation, resolved against its sprite sheet. */
export interface TextureAnimation {
  frames: AnimationFrame[];
  interpolate: boolean;
  /** Frame size in pixels. */
  fw: number;
  fh: number;
  /** Frames per row on the sheet (vertical strips have 1). */
  columns: number;
  /** Sum of all frame times, in ticks. */
  total: number;
}

export function parseAnimation(anim: any, width: number, height: number): TextureAnimation | undefined {
  if (!anim || typeof anim !== 'object') return undefined;
  const fw = Math.min(width, anim.width ?? Math.min(width, height));
  const fh = Math.min(height, anim.height ?? fw);
  const columns = Math.max(1, Math.floor(width / fw));
  const count = Math.max(1, columns * Math.floor(height / fh));
  const frametime = Math.max(1, Number(anim.frametime) || 1);
  const frames: AnimationFrame[] = Array.isArray(anim.frames)
    ? anim.frames
        .map((f: any) => (typeof f === 'number' ? { index: f, time: frametime } : { index: Number(f?.index), time: Math.max(1, Number(f?.time) || frametime) }))
        .filter((f: AnimationFrame) => Number.isInteger(f.index) && f.index >= 0 && f.index < count)
    : Array.from({ length: count }, (_, index) => ({ index, time: frametime }));
  if (frames.length < 2) return undefined;
  return { frames, interpolate: !!anim.interpolate, fw, fh, columns, total: frames.reduce((s, f) => s + f.time, 0) };
}

/** Which frame shows at `ticks`, the next one, and how far (0..1) we are into the current one. */
export function frameAt(anim: TextureAnimation, ticks: number): { current: number; next: number; progress: number } {
  let t = ticks % anim.total;
  for (let i = 0; i < anim.frames.length; i++) {
    const f = anim.frames[i];
    if (t < f.time) {
      return { current: f.index, next: anim.frames[(i + 1) % anim.frames.length].index, progress: t / f.time };
    }
    t -= f.time;
  }
  return { current: anim.frames[0].index, next: anim.frames[0].index, progress: 0 };
}

/** Draws the frame for `ticks` (blending into the next frame if the animation interpolates). */
export function drawAnimationFrame(ctx: CanvasRenderingContext2D, sheet: CanvasImageSource, anim: TextureAnimation, ticks: number) {
  const { current, next, progress } = frameAt(anim, ticks);
  const src = (i: number) => [(i % anim.columns) * anim.fw, Math.floor(i / anim.columns) * anim.fh] as const;
  ctx.clearRect(0, 0, anim.fw, anim.fh);
  ctx.globalAlpha = 1;
  ctx.drawImage(sheet, ...src(current), anim.fw, anim.fh, 0, 0, anim.fw, anim.fh);
  if (anim.interpolate && progress > 0 && next !== current) {
    ctx.globalAlpha = progress;
    ctx.drawImage(sheet, ...src(next), anim.fw, anim.fh, 0, 0, anim.fw, anim.fh);
    ctx.globalAlpha = 1;
  }
}
