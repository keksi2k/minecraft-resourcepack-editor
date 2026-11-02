import type { AssetStore } from '../assets/AssetStore';
import { parseLenientJson } from '../assets/AssetStore';
import type { SoundsJsonFile } from '../sounds/editSounds';
import type { SoundEvent } from '../sounds/soundsJson';
import { colorizePng, type ColorStyle } from './colorize';
import { applySoundRandomizer, type PitchDirection } from './randomize';
import { applySoundShuffle, planSoundShuffle, planTextureShuffle, rng, textureScope, type SoundMode, type TextureScope } from './shuffle';

export interface FunnySettings {
  seed: string;
  shuffle: {
    enabled: boolean;
    scopes: TextureScope[];
    mobChaos: boolean;
    sounds: boolean;
    soundMode: SoundMode;
  };
  /** Random pitch for every sound, plus surprise variants from other events. */
  randomizer: {
    enabled: boolean;
    /** 0–1 octaves */
    strength: number;
    direction: PitchDirection;
    perVariant: boolean;
    /** 0–1 */
    surprises: number;
  };
  colors: {
    enabled: boolean;
    scopes: TextureScope[];
    style: ColorStyle;
    /** 0–1 */
    strength: number;
  };
  /** Also change files the user edited themselves. */
  includeEdits: boolean;
}

export const randomSeed = () => Math.random().toString(36).slice(2, 8);

export const defaultFunny = (): FunnySettings => ({
  seed: randomSeed(),
  shuffle: { enabled: true, scopes: ['item', 'block', 'entity'], mobChaos: false, sounds: true, soundMode: 'similar' },
  randomizer: { enabled: false, strength: 0.5, direction: 'both', perVariant: false, surprises: 0.1 },
  colors: { enabled: false, scopes: ['item', 'block', 'entity'], style: 'hue', strength: 1 },
  includeEdits: false,
});

/** Settings saved by older versions lack newer sections; fills them in with defaults. */
export const withDefaults = (s: Partial<FunnySettings>): FunnySettings => {
  const d = defaultFunny();
  return { ...d, ...s, shuffle: { ...d.shuffle, ...s.shuffle }, randomizer: { ...d.randomizer, ...s.randomizer }, colors: { ...d.colors, ...s.colors } };
};

export interface FunnyStats {
  textures: number;
  sounds: number;
  colored: number;
  /** Sound events given a random pitch, and surprise variants added (both missing in older records). */
  pitched?: number;
  surprises?: number;
}

export interface FunnyResult {
  /** New contents per path. */
  changes: Map<string, Uint8Array>;
  stats: FunnyStats;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Events the user changed in a sounds.json compared to the loaded pack (or added there). */
function editedEvents(store: AssetStore, path: string): Set<string> {
  const current = store.edits.get(path);
  if (!current) return new Set();
  const parse = (b: Uint8Array | undefined) => {
    try {
      return (b ? parseLenientJson(decoder.decode(b)) : {}) as SoundsJsonFile;
    } catch {
      return {};
    }
  };
  const before = parse(store.pack.get(path));
  const after = parse(current);
  return new Set(Object.keys(after).filter((k) => JSON.stringify(after[k]) !== JSON.stringify(before[k])));
}

/**
 * Computes the funny changes on top of the store's current state: swaps first, then colours (so
 * swapped textures get coloured too). Nothing is written to the store.
 */
export async function computeFunny(
  store: AssetStore,
  events: SoundEvent[],
  s: FunnySettings,
  onProgress?: (done: number, total: number) => void,
): Promise<FunnyResult> {
  const changes = new Map<string, Uint8Array>();
  const stats: FunnyStats = { textures: 0, sounds: 0, colored: 0 };
  const skip = (path: string) => !s.includeEdits && store.source(path) === 'edited';
  const current = (path: string) => changes.get(path) ?? store.get(path);

  if (s.shuffle.enabled && s.shuffle.scopes.length) {
    const plan = planTextureShuffle(store, { scopes: s.shuffle.scopes, mobChaos: s.shuffle.mobChaos, skip }, rng(`${s.seed}:textures`));
    for (const [target, donor] of plan) {
      changes.set(target, store.get(donor)!);
      const meta = store.get(`${donor}.mcmeta`);
      if (meta) changes.set(`${target}.mcmeta`, meta);
    }
    stats.textures = plan.size;
  }

  const shuffleSounds = s.shuffle.enabled && s.shuffle.sounds;
  const randomize = !!s.randomizer?.enabled;
  if ((shuffleSounds || randomize) && events.length) {
    const namespaces = [...new Set(events.map((e) => e.id.split(':')[0]))];
    let files: Record<string, SoundsJsonFile> = Object.fromEntries(
      namespaces.map((ns) => [ns, store.json<SoundsJsonFile>(`assets/${ns}/sounds.json`) ?? {}]),
    );
    const touched = new Set<string>();
    const edited = new Map(namespaces.map((ns) => [ns, s.includeEdits ? new Set<string>() : editedEvents(store, `assets/${ns}/sounds.json`)]));
    const skipEvent = (id: string) => {
      const [ns, path] = id.split(':');
      return edited.get(ns)!.has(path);
    };
    let sounding = events;
    if (shuffleSounds) {
      const plan = planSoundShuffle(events, s.shuffle.soundMode, rng(`${s.seed}:sounds`), skipEvent);
      const shuffled = applySoundShuffle(files, plan, events);
      files = { ...files, ...shuffled };
      Object.keys(shuffled).forEach((ns) => touched.add(ns));
      // the randomizer works on what each event plays after the swap
      const byId = new Map(events.map((e) => [e.id, e]));
      sounding = events.map((e) => (plan.has(e.id) ? { ...e, files: byId.get(plan.get(e.id)!)!.files, refs: [] } : e));
      stats.sounds = plan.size;
    }
    if (randomize) {
      const r = applySoundRandomizer(files, sounding, s.randomizer, rng(`${s.seed}:randomizer`), skipEvent);
      files = { ...files, ...r.files };
      Object.keys(r.files).forEach((ns) => touched.add(ns));
      stats.pitched = r.pitched;
      stats.surprises = r.surprises;
    }
    for (const ns of touched) changes.set(`assets/${ns}/sounds.json`, encoder.encode(JSON.stringify(files[ns], null, 2)));
  }

  if (s.colors.enabled && s.colors.scopes.length) {
    const paths = store.list('assets/').filter((p) => {
      const scope = textureScope(p);
      return scope && s.colors.scopes.includes(scope) && !skip(p);
    });
    const random = rng(`${s.seed}:colors`);
    // one random sub-seed per texture, drawn in order, so parallel decoding stays deterministic
    const seeds = paths.map(() => String(random()));
    const BATCH = 24;
    for (let i = 0; i < paths.length; i += BATCH) {
      await Promise.all(
        paths.slice(i, i + BATCH).map(async (p, j) => {
          const bytes = current(p);
          if (!bytes) return;
          const metaBytes = current(`${p}.mcmeta`);
          let mcmeta: unknown;
          try {
            mcmeta = metaBytes ? parseLenientJson(decoder.decode(metaBytes)) : undefined;
          } catch {}
          try {
            changes.set(p, await colorizePng(bytes, mcmeta, s.colors.style, s.colors.strength, rng(seeds[i + j])));
            stats.colored++;
          } catch (e) {
            console.warn(`Could not colour ${p}`, e);
          }
        }),
      );
      onProgress?.(Math.min(paths.length, i + BATCH), paths.length);
    }
  }
  return { changes, stats };
}
