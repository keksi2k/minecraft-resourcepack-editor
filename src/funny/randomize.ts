import { parseRL } from '../models/resourceLocation';
import type { SoundsJsonFile } from '../sounds/editSounds';
import type { SoundEvent, SoundFileRef } from '../sounds/soundsJson';

export const PITCH_DIRECTIONS = ['both', 'higher', 'lower'] as const;
export type PitchDirection = (typeof PITCH_DIRECTIONS)[number];

export interface SoundRandomizerOptions {
  /** How far the pitch may move, in octaves (0–1; 1 = up to twice/half as high). */
  strength: number;
  direction: PitchDirection;
  /** Every variant gets its own pitch (otherwise one per event, so a mob keeps one "voice"). */
  perVariant: boolean;
  /** Chance (0–1) that an event also gets a random sound from somewhere else as an extra variant. */
  surprises: number;
}

export interface SoundRandomizerResult {
  /** Changed sounds.json files per namespace (only the touched ones). */
  files: Record<string, SoundsJsonFile>;
  pitched: number;
  surprises: number;
}

const isMusic = (id: string) => /^(music|music_disc)\./.test(parseRL(id).path);
/** Minecraft plays pitches between 0.5 and 2 only. */
const clampPitch = (p: number) => Math.round(Math.max(0.5, Math.min(2, p)) * 100) / 100;

type Entry = string | ({ name: string } & Record<string, unknown>);

function entry(f: SoundFileRef, pitch: number): Entry {
  const e: { name: string } & Record<string, unknown> = { name: f.name, ...f.extra };
  if (f.volume !== undefined && f.volume !== 1) e.volume = f.volume;
  if (pitch !== 1) e.pitch = pitch;
  return Object.keys(e).length === 1 ? f.name : e;
}

/**
 * Gives every sound event a random pitch (written into the pack's sounds.json with `replace: true`,
 * keeping all variants and their other settings) and sprinkles in surprise variants from other
 * events. Music is left alone. `events` must be the events as they will sound (after any shuffle).
 */
export function applySoundRandomizer(
  files: Record<string, SoundsJsonFile>,
  events: SoundEvent[],
  opts: SoundRandomizerOptions,
  random: () => number,
  skip?: (id: string) => boolean,
): SoundRandomizerResult {
  const pool = events.filter((e) => e.files.length > 0 && !isMusic(e.id)).sort((a, b) => a.id.localeCompare(b.id));
  const octaves = Math.max(0, Math.min(1, opts.strength));
  const factor = () => {
    const u = random();
    const o = opts.direction === 'higher' ? u * octaves : opts.direction === 'lower' ? -u * octaves : (u * 2 - 1) * octaves;
    return Math.pow(2, o);
  };
  const out: Record<string, SoundsJsonFile> = {};
  let pitched = 0;
  let surprises = 0;
  pool.forEach((ev, self) => {
    if (skip?.(ev.id)) return;
    const shared = factor();
    const sounds: Entry[] = ev.files.map((f) => entry(f, clampPitch((f.pitch ?? 1) * (opts.perVariant ? factor() : shared))));
    if (pool.length > 1 && opts.surprises > 0 && random() < opts.surprises) {
      // any other event, never this one
      let i = Math.floor(random() * (pool.length - 1));
      if (i >= self) i++;
      const donor = pool[i];
      const f = donor.files[Math.floor(random() * donor.files.length)];
      sounds.push(entry(f, clampPitch(f.pitch ?? 1)));
      surprises++;
    }
    for (const r of ev.refs) sounds.push({ name: r, type: 'event' });
    const { ns, path } = parseRL(ev.id);
    const json = (out[ns] ??= { ...files[ns] });
    json[path] = { ...json[path], replace: true, ...(ev.subtitle ? { subtitle: ev.subtitle } : {}), sounds: sounds as SoundsJsonFile[string]['sounds'] };
    pitched++;
  });
  return { files: out, pitched, surprises };
}
