import { inspectOgg } from './editSounds';

/**
 * Sound editing on raw PCM: every operation returns a new clip and leaves its input untouched, so
 * the editor can keep earlier clips for undo. Positions are sample indices; a range is [start, end).
 */
export interface Clip {
  sampleRate: number;
  /** One array per channel (Minecraft: 1 = positional, 2 = stereo without direction). */
  channels: Float32Array[];
}

export const clipLength = (c: Clip) => c.channels[0]?.length ?? 0;
export const clipDuration = (c: Clip) => clipLength(c) / c.sampleRate;

/** Clamps a range into the clip; an empty range means the whole clip. */
export function range(c: Clip, start = 0, end = clipLength(c)): [number, number] {
  const n = clipLength(c);
  let a = Math.max(0, Math.min(n, Math.round(Math.min(start, end))));
  let b = Math.max(0, Math.min(n, Math.round(Math.max(start, end))));
  if (a === b) [a, b] = [0, n];
  return [a, b];
}

const map = (c: Clip, fn: (ch: Float32Array, i: number) => Float32Array): Clip => ({ sampleRate: c.sampleRate, channels: c.channels.map(fn) });

/** Keeps only [start, end). */
export const crop = (c: Clip, start: number, end: number): Clip => {
  const [a, b] = range(c, start, end);
  return map(c, (ch) => ch.slice(a, b));
};

/** Removes [start, end). */
export const cut = (c: Clip, start: number, end: number): Clip => {
  const [a, b] = range(c, start, end);
  return map(c, (ch) => {
    const out = new Float32Array(ch.length - (b - a));
    out.set(ch.subarray(0, a));
    out.set(ch.subarray(b), a);
    return out;
  });
};

/** Applies `fn(sample, positionInRange 0–1)` to every sample in [start, end). */
function shape(c: Clip, start: number, end: number, fn: (v: number, t: number) => number): Clip {
  const [a, b] = range(c, start, end);
  const span = Math.max(1, b - a - 1);
  return map(c, (ch) => {
    const out = ch.slice();
    for (let i = a; i < b; i++) out[i] = fn(ch[i], (i - a) / span);
    return out;
  });
}

const clampSample = (v: number) => Math.max(-1, Math.min(1, v));

export const gain = (c: Clip, factor: number, start?: number, end?: number) => shape(c, start ?? 0, end ?? clipLength(c), (v) => clampSample(v * factor));
export const dbToGain = (db: number) => Math.pow(10, db / 20);

export const silence = (c: Clip, start: number, end: number) => shape(c, start, end, () => 0);
export const fadeIn = (c: Clip, start?: number, end?: number) => shape(c, start ?? 0, end ?? clipLength(c), (v, t) => v * t);
export const fadeOut = (c: Clip, start?: number, end?: number) => shape(c, start ?? 0, end ?? clipLength(c), (v, t) => v * (1 - t));

/** Scales [start, end) so its loudest sample reaches `peak`. */
export function normalize(c: Clip, start?: number, end?: number, peak = 0.98): Clip {
  const [a, b] = range(c, start, end);
  let max = 0;
  for (const ch of c.channels) for (let i = a; i < b; i++) max = Math.max(max, Math.abs(ch[i]));
  return max === 0 ? c : gain(c, peak / max, a, b);
}

export function reverse(c: Clip, start?: number, end?: number): Clip {
  const [a, b] = range(c, start, end);
  return map(c, (ch) => {
    const out = ch.slice();
    out.subarray(a, b).reverse();
    return out;
  });
}

/** Mixes all channels into one (what Minecraft needs for sounds with direction and falloff). */
export function toMono(c: Clip): Clip {
  if (c.channels.length === 1) return c;
  const n = clipLength(c);
  const out = new Float32Array(n);
  for (const ch of c.channels) for (let i = 0; i < n; i++) out[i] += ch[i] / c.channels.length;
  return { sampleRate: c.sampleRate, channels: [out] };
}

/** Plays faster/slower like a record: `factor` 2 = twice as fast and an octave higher. */
export function changeSpeed(c: Clip, factor: number): Clip {
  if (!(factor > 0) || factor === 1) return c;
  const n = Math.max(1, Math.round(clipLength(c) / factor));
  return map(c, (ch) => {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const p = i * factor;
      const j = Math.floor(p);
      const f = p - j;
      out[i] = (ch[j] ?? 0) * (1 - f) + (ch[j + 1] ?? ch[j] ?? 0) * f;
    }
    return out;
  });
}

/** Cuts or pads (with silence) to exactly `n` samples. */
export const fitLength = (c: Clip, n: number): Clip =>
  map(c, (ch) => {
    if (ch.length === n) return ch;
    const out = new Float32Array(n);
    out.set(ch.subarray(0, n));
    return out;
  });

/** Replaces [start, end) with `part` (which may be longer or shorter). */
export function splice(c: Clip, start: number, end: number, part: Clip): Clip {
  const a = Math.max(0, Math.min(start, end));
  const b = Math.min(clipLength(c), Math.max(start, end));
  return map(c, (ch, i) => {
    const p = part.channels[Math.min(i, part.channels.length - 1)];
    const out = new Float32Array(ch.length - (b - a) + p.length);
    out.set(ch.subarray(0, a));
    out.set(p, a);
    out.set(ch.subarray(b), a + p.length);
    return out;
  });
}

/**
 * Changes the length without changing the pitch (WSOLA: overlapping windows, each one placed where
 * it lines up best with the previous one). `factor` 2 = twice as long.
 */
export function timeStretch(c: Clip, factor: number): Clip {
  if (!(factor > 0) || factor === 1) return c;
  const n = clipLength(c);
  const N = 1 << Math.round(Math.log2(Math.max(256, c.sampleRate * 0.046))); // ~46 ms windows
  const hs = N / 4;
  const ha = hs / factor;
  const tol = N / 8;
  const win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N));
  const mono = toMono(c).channels[0];
  const outLen = Math.max(1, Math.round(n * factor));
  const frames = Math.ceil(outLen / hs) + 1;
  const offsets = [0];
  for (let k = 1; k < frames; k++) {
    const ideal = Math.round(k * ha);
    const natural = offsets[k - 1] + hs; // where the previous window would naturally continue
    let best = ideal;
    let bestScore = -Infinity;
    const lo = Math.max(0, ideal - tol);
    const hi = Math.min(n - 1, ideal + tol);
    for (let p = lo; p <= hi; p += 2) {
      let s = 0;
      for (let i = 0; i < N / 2; i += 4) s += (mono[natural + i] ?? 0) * (mono[p + i] ?? 0);
      if (s > bestScore) {
        bestScore = s;
        best = p;
      }
    }
    offsets.push(best);
  }
  const norm = new Float32Array(outLen + N);
  for (let k = 0; k < frames; k++) for (let i = 0; i < N; i++) norm[k * hs + i] += win[i];
  return map(c, (ch) => {
    const out = new Float32Array(outLen + N);
    for (let k = 0; k < frames; k++) {
      const o = k * hs;
      const p = offsets[k];
      for (let i = 0; i < N; i++) out[o + i] += (ch[p + i] ?? 0) * win[i];
    }
    for (let i = 0; i < outLen; i++) out[i] = norm[i] > 1e-3 ? out[i] / norm[i] : 0;
    return out.slice(0, outLen);
  });
}

/** Shifts the pitch by `semitones` and keeps the length. */
export function pitchShift(c: Clip, semitones: number): Clip {
  if (!semitones) return c;
  const r = Math.pow(2, semitones / 12);
  const out = changeSpeed(timeStretch(c, r), r);
  const n = clipLength(c);
  // rounding can leave a sample more or less
  return map(out, (ch) => (ch.length === n ? ch : Float32Array.from({ length: n }, (_, i) => ch[i] ?? 0)));
}

/** Soft clipping (tanh): `drive` 1 = mild, 20 = heavy. Loudness stays about the same. */
export function distort(c: Clip, drive: number, start?: number, end?: number): Clip {
  const k = Math.max(0.01, drive);
  const norm = Math.tanh(k);
  return shape(c, start ?? 0, end ?? clipLength(c), (v) => Math.tanh(v * k) / norm);
}

/** Runs a clip through a Web Audio graph offline (browser only); `tail` seconds are added for reverbs. */
async function renderOffline(
  c: Clip,
  build: (ctx: OfflineAudioContext, input: AudioNode, output: AudioNode) => void,
  tail = 0,
): Promise<Clip> {
  const len = Math.max(1, clipLength(c) + Math.round(tail * c.sampleRate));
  const ctx = new OfflineAudioContext(c.channels.length, len, c.sampleRate);
  const buf = ctx.createBuffer(c.channels.length, Math.max(1, clipLength(c)), c.sampleRate);
  c.channels.forEach((ch, i) => buf.copyToChannel(ch, i));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  build(ctx, src, ctx.destination);
  src.start();
  const r = await ctx.startRendering();
  return { sampleRate: c.sampleRate, channels: Array.from({ length: r.numberOfChannels }, (_, i) => r.getChannelData(i).slice()) };
}

export type FilterKind = 'lowpass' | 'highpass' | 'bass' | 'treble';

/** Low-/high-pass at `value` Hz, or bass/treble boost/cut by `value` dB. */
export function filter(c: Clip, kind: FilterKind, value: number): Promise<Clip> {
  return renderOffline(c, (ctx, input, output) => {
    const f = ctx.createBiquadFilter();
    if (kind === 'lowpass' || kind === 'highpass') {
      f.type = kind;
      f.frequency.value = value;
      f.Q.value = 0.707;
    } else {
      f.type = kind === 'bass' ? 'lowshelf' : 'highshelf';
      f.frequency.value = kind === 'bass' ? 250 : 3500;
      f.gain.value = value;
    }
    input.connect(f).connect(output);
  });
}

/** Room reverb from a synthetic impulse (decaying noise). `size` 0–1, `mix` 0–1 wet share. */
export function reverb(c: Clip, size = 0.5, mix = 0.35, keepLength = false): Promise<Clip> {
  const seconds = 0.3 + size * 3;
  return renderOffline(
    c,
    (ctx, input, output) => {
      const len = Math.round(seconds * c.sampleRate);
      const ir = ctx.createBuffer(2, len, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = ir.getChannelData(ch);
        let seed = 1234567 + ch * 7654321;
        for (let i = 0; i < len; i++) {
          seed = (seed * 1103515245 + 12345) >>> 0;
          d[i] = ((seed / 0xffffffff) * 2 - 1) * Math.pow(1 - i / len, 2 + (1 - size) * 4);
        }
      }
      const conv = ctx.createConvolver();
      conv.buffer = ir;
      const dry = ctx.createGain();
      const wet = ctx.createGain();
      dry.gain.value = 1 - mix;
      wet.gain.value = mix;
      input.connect(dry).connect(output);
      input.connect(conv).connect(wet).connect(output);
    },
    keepLength ? 0 : seconds,
  );
}

/** Evens out loud and quiet parts, then brings the peak back up. */
export async function compress(c: Clip, amount = 0.5): Promise<Clip> {
  const out = await renderOffline(c, (ctx, input, output) => {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10 - amount * 30;
    comp.ratio.value = 2 + amount * 10;
    comp.attack.value = 0.005;
    comp.release.value = 0.15;
    comp.knee.value = 6;
    input.connect(comp).connect(output);
  });
  return normalize(out);
}

/** Inserts `seconds` of silence at `at`. */
export function insertSilence(c: Clip, at: number, seconds: number): Clip {
  const k = Math.max(0, Math.round(seconds * c.sampleRate));
  const p = Math.max(0, Math.min(clipLength(c), Math.round(at)));
  return map(c, (ch) => {
    const out = new Float32Array(ch.length + k);
    out.set(ch.subarray(0, p));
    out.set(ch.subarray(p), p + k);
    return out;
  });
}

/** Adds an echo: each repeat `delay` seconds later and `decay` times quieter. */
export function echo(c: Clip, delay = 0.18, decay = 0.45, repeats = 3): Clip {
  const d = Math.max(1, Math.round(delay * c.sampleRate));
  const n = clipLength(c);
  return map(c, (ch) => {
    const out = new Float32Array(n + d * repeats);
    out.set(ch);
    for (let r = 1; r <= repeats; r++) {
      const g = Math.pow(decay, r);
      for (let i = 0; i < n; i++) out[i + d * r] += ch[i] * g;
    }
    for (let i = 0; i < out.length; i++) out[i] = clampSample(out[i]);
    return out;
  });
}

/** Cuts near-silent parts off both ends. */
export function trimSilence(c: Clip, threshold = 0.01): Clip {
  const n = clipLength(c);
  const loud = (i: number) => c.channels.some((ch) => Math.abs(ch[i]) > threshold);
  let a = 0;
  while (a < n && !loud(a)) a++;
  let b = n;
  while (b > a && !loud(b - 1)) b--;
  if (a >= b) return c;
  return map(c, (ch) => ch.slice(a, b));
}

/** Per-pixel min/max of the first channel group, for drawing a waveform `width` columns wide. */
export function peaks(ch: Float32Array, from: number, to: number, width: number): [number, number][] {
  const out: [number, number][] = [];
  const per = (to - from) / width;
  for (let x = 0; x < width; x++) {
    const a = Math.floor(from + x * per);
    const b = Math.max(a + 1, Math.floor(from + (x + 1) * per));
    let lo = 0;
    let hi = 0;
    for (let i = a; i < b && i < ch.length; i++) {
      if (ch[i] < lo) lo = ch[i];
      if (ch[i] > hi) hi = ch[i];
    }
    out.push([lo, hi]);
  }
  return out;
}

/** Encodes a clip as Ogg Vorbis, the only format Minecraft plays. `quality` −1 … 10. */
export async function encodeOgg(c: Clip, quality = 5): Promise<Uint8Array> {
  // Loaded on first use: the encoder is a few hundred KB of WebAssembly.
  const { createOggEncoder } = await import('wasm-media-encoders');
  const enc = await createOggEncoder();
  const channels = c.channels.slice(0, 2);
  enc.configure({ channels: channels.length as 1 | 2, sampleRate: c.sampleRate, vbrQuality: quality });
  const parts: Uint8Array[] = [];
  const CHUNK = 1 << 16;
  const n = clipLength(c);
  for (let i = 0; i < n; i += CHUNK) parts.push(enc.encode(channels.map((ch) => ch.subarray(i, Math.min(n, i + CHUNK)))).slice());
  parts.push(enc.finalize().slice());
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/**
 * Returns Ogg Vorbis bytes for any audio file: Vorbis files pass through unchanged, everything
 * else the browser can decode (mp3, wav, Ogg Opus …) is re-encoded. Throws the reason otherwise.
 */
export async function ensureVorbis(bytes: Uint8Array): Promise<{ bytes: Uint8Array; channels: number; converted: boolean }> {
  const info = inspectOgg(bytes);
  if (typeof info !== 'string') return { bytes, channels: info.channels, converted: false };
  let clip: Clip;
  try {
    clip = await decodeAudio(bytes);
  } catch {
    throw new Error(info);
  }
  return { bytes: await encodeOgg(clip), channels: Math.min(2, clip.channels.length), converted: true };
}

/**
 * Decodes any audio the browser understands (ogg, mp3, wav, …). `sampleRate` keeps the file's own
 * rate when known, so an unchanged sound is not resampled.
 */
export async function decodeAudio(bytes: Uint8Array, sampleRate = 44100): Promise<Clip> {
  const ctx = new OfflineAudioContext(1, 1, sampleRate);
  const buf = await ctx.decodeAudioData(bytes.slice().buffer);
  return { sampleRate: buf.sampleRate, channels: Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i).slice()) };
}
