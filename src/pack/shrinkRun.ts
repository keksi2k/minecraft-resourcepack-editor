import { compactJson, type ShrinkCandidates, type ShrinkStep } from './shrink';
import type { PngJob, PngResult } from './pngWorker';

export interface ShrinkOptions {
  steps: Set<ShrinkStep>;
  /** Ogg Vorbis quality for sounds encoded again (−1 … 10). */
  oggQuality: number;
}

export interface ShrinkOutcome {
  changes: Map<string, Uint8Array | null>;
  /** Bytes before and after, per step. */
  before: Record<ShrinkStep, number>;
  after: Record<ShrinkStep, number>;
  failed: string[];
}

/** Compresses PNGs on a few workers; resolves with the smaller bytes (or the old ones). */
async function optimisePngs(items: [string, Uint8Array][], onDone: () => void): Promise<Map<string, Uint8Array | Error>> {
  const out = new Map<string, Uint8Array | Error>();
  if (!items.length) return out;
  const count = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1, items.length));
  const workers = Array.from({ length: count }, () => new Worker(new URL('./pngWorker.ts', import.meta.url), { type: 'module' }));
  let next = 0;
  try {
    await Promise.all(
      workers.map(
        (w) =>
          new Promise<void>((resolve) => {
            const send = () => {
              if (next >= items.length) return resolve();
              const id = next++;
              w.postMessage({ id, bytes: items[id][1] } satisfies PngJob);
            };
            w.onmessage = (e: MessageEvent<PngResult>) => {
              out.set(items[e.data.id][0], e.data.bytes ?? new Error(e.data.error));
              onDone();
              send();
            };
            w.onerror = (e) => {
              // a worker that can't start: the rest of its share stays as it is
              e.preventDefault();
              resolve();
            };
            send();
          }),
      ),
    );
  } finally {
    for (const w of workers) w.terminate();
  }
  return out;
}

/**
 * Runs the chosen steps over the candidates and returns the changes for the pack: `null` removes
 * a file. Optimised files that don't come out smaller are left alone.
 */
export async function runShrink(
  candidates: ShrinkCandidates,
  get: (path: string) => Uint8Array | undefined,
  options: ShrinkOptions,
  onProgress: (done: number, total: number) => void,
): Promise<ShrinkOutcome> {
  const changes = new Map<string, Uint8Array | null>();
  const before = { vanilla: 0, junk: 0, json: 0, png: 0, ogg: 0 };
  const after = { ...before };
  const failed: string[] = [];
  const { steps } = options;
  const total = [...steps].reduce((s, step) => s + candidates.files[step].length, 0);
  let done = 0;
  const tick = () => onProgress(++done, total);

  const keep = (step: ShrinkStep, path: string, old: Uint8Array, next: Uint8Array | undefined) => {
    before[step] += old.length;
    if (next && next.length < old.length) {
      changes.set(path, next);
      after[step] += next.length;
    } else after[step] += old.length;
  };

  for (const step of ['vanilla', 'junk'] as const) {
    if (!steps.has(step)) continue;
    for (const path of candidates.files[step]) {
      before[step] += get(path)?.length ?? 0;
      changes.set(path, null);
      tick();
    }
  }
  if (steps.has('json'))
    for (const path of candidates.files.json) {
      const bytes = get(path);
      if (bytes) keep('json', path, bytes, compactJson(path, bytes));
      tick();
    }
  if (steps.has('png')) {
    const items = candidates.files.png.map((p) => [p, get(p)] as [string, Uint8Array | undefined]).filter((x): x is [string, Uint8Array] => !!x[1]);
    const results = await optimisePngs(items, tick);
    for (const [path, bytes] of items) {
      const r = results.get(path);
      if (r instanceof Error) failed.push(path);
      keep('png', path, bytes, r instanceof Error ? undefined : r);
    }
  }
  if (steps.has('ogg')) {
    const { decodeAudio, encodeOgg } = await import('../sounds/audioEdit');
    const { inspectOgg } = await import('../sounds/editSounds');
    for (const path of candidates.files.ogg) {
      const bytes = get(path);
      const info = bytes && inspectOgg(bytes);
      // only Ogg Vorbis plays in the game; anything else is left for the pack check to report
      if (bytes && typeof info !== 'string' && info) {
        let next: Uint8Array | undefined;
        try {
          // at the file's own sample rate, so nothing is resampled
          next = await encodeOgg(await decodeAudio(bytes, info.sampleRate), options.oggQuality);
          // a little smaller isn't worth another generation of encoding loss
          if (next.length > bytes.length * 0.9) next = undefined;
        } catch {
          failed.push(path);
        }
        keep('ogg', path, bytes, next);
      }
      tick();
    }
  }
  return { changes, before, after, failed };
}
