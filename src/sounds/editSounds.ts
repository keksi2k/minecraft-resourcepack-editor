import { parseRL } from '../models/resourceLocation';

type SoundEntry = string | { name: string; type?: string; [k: string]: unknown };
export type SoundsJsonFile = Record<string, { replace?: boolean; subtitle?: string; sounds?: SoundEntry[] }>;

const entryName = (e: SoundEntry) => (typeof e === 'string' ? e : e.name);

/** sounds.json holding an event: events live in the sounds.json of their own namespace. */
export function soundsJsonPath(eventId: string): string {
  return `assets/${parseRL(eventId).ns}/sounds.json`;
}

/** Appends a sound file to an event in a pack's sounds.json (returns a new object). */
export function addSoundToEvent(json: SoundsJsonFile, eventId: string, soundName: string): SoundsJsonFile {
  const key = parseRL(eventId).path;
  const ev = json[key] ?? {};
  return { ...json, [key]: { ...ev, sounds: [...(ev.sounds ?? []), soundName] } };
}

/** Removes a sound from an event; drops the event entry when nothing meaningful is left. */
export function removeSoundFromEvent(json: SoundsJsonFile, eventId: string, soundName: string): SoundsJsonFile {
  const key = parseRL(eventId).path;
  const ev = json[key];
  if (!ev) return json;
  const { ns } = parseRL(eventId);
  const matches = (e: SoundEntry) => {
    const n = entryName(e);
    return n === soundName || `${ns}:${n}` === soundName || n === parseRL(soundName).path;
  };
  const sounds = (ev.sounds ?? []).filter((e) => !matches(e));
  const out = { ...json };
  if (sounds.length === 0 && !ev.replace && !ev.subtitle) delete out[key];
  else out[key] = { ...ev, sounds };
  return out;
}

export function setEventReplace(json: SoundsJsonFile, eventId: string, replace: boolean): SoundsJsonFile {
  const key = parseRL(eventId).path;
  const ev = { ...(json[key] ?? {}) };
  if (replace) ev.replace = true;
  else delete ev.replace;
  const out = { ...json, [key]: ev };
  if (!ev.replace && !ev.subtitle && !(ev.sounds?.length)) delete out[key];
  return out;
}

/** Sound names the pack itself lists for an event (as written, without namespace). */
export function packSoundNames(json: SoundsJsonFile | undefined, eventId: string): string[] {
  return (json?.[parseRL(eventId).path]?.sounds ?? []).filter((e) => typeof e === 'string' || e.type !== 'event').map(entryName);
}

/** Picks a free sound name like `custom/entity.zombie_villager.step/step1` for an uploaded file. */
export function newSoundName(eventId: string, fileName: string, taken: (name: string) => boolean): string {
  const base =
    fileName
      .replace(/\.ogg$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9_.-]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'sound';
  const dir = `custom/${parseRL(eventId).path}`;
  let name = `${dir}/${base}`;
  for (let i = 2; taken(name); i++) name = `${dir}/${base}_${i}`;
  return name;
}

export interface OggInfo {
  channels: number;
  sampleRate: number;
}

/** Minecraft only plays Ogg Vorbis. Returns the stream info, or an error message. */
export function inspectOgg(bytes: Uint8Array): OggInfo | string {
  const ascii = (o: number, n: number) => String.fromCharCode(...bytes.subarray(o, o + n));
  if (bytes.length < 64 || ascii(0, 4) !== 'OggS') return 'Keine Ogg-Datei. Minecraft braucht .ogg (Vorbis), z. B. mit Audacity exportieren.';
  // The first page carries the codec identification header right after the segment table.
  const segments = bytes[26];
  const p = 27 + segments;
  if (ascii(p, 8) === 'OpusHead') return 'Die Datei ist Ogg Opus – Minecraft unterstützt nur Ogg Vorbis.';
  if (bytes[p] !== 1 || ascii(p + 1, 6) !== 'vorbis') return 'Ogg-Datei ohne Vorbis-Audio – Minecraft unterstützt nur Ogg Vorbis.';
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { channels: bytes[p + 11], sampleRate: view.getUint32(p + 12, true) };
}
