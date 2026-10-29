import { normalizeRL, soundPath } from '../models/resourceLocation';

export interface SoundFileRef {
  /** Sound id as written in sounds.json, e.g. `minecraft:dig/stone1`. */
  name: string;
  /** Pack path, e.g. `assets/minecraft/sounds/dig/stone1.ogg`. */
  path: string;
  /** Asset-index key, e.g. `minecraft/sounds/dig/stone1.ogg`. */
  key: string;
  volume?: number;
  pitch?: number;
  /** Listed by the pack's sounds.json (as opposed to vanilla's). */
  fromPack?: boolean;
}

export interface SoundEvent {
  /** Event id, e.g. `minecraft:block.stone.break`. */
  id: string;
  subtitle?: string;
  files: SoundFileRef[];
  /** Other events this one plays (`"type": "event"`). */
  refs: string[];
  /** The pack defines or extends this event in its sounds.json. */
  fromPack: boolean;
  /** The pack sets `replace: true`, so vanilla variants are dropped. */
  replaced?: boolean;
}

type SoundsJson = Record<string, { replace?: boolean; subtitle?: string; sounds?: unknown[] }>;

function fileRef(name: string, extra: { volume?: number; pitch?: number; fromPack?: boolean } = {}): SoundFileRef {
  const id = normalizeRL(name);
  const path = soundPath(id);
  return { name: id, path, key: path.replace(/^assets\//, ''), ...extra };
}

function addEvents(target: Map<string, SoundEvent>, ns: string, json: SoundsJson | undefined, fromPack: boolean) {
  for (const [name, def] of Object.entries(json ?? {})) {
    if (!def || typeof def !== 'object') continue;
    const id = name.includes(':') ? name : `${ns}:${name}`;
    const prev = target.get(id);
    const ev: SoundEvent =
      prev && !def.replace
        ? { ...prev, files: [...prev.files], refs: [...prev.refs] }
        : { id, files: [], refs: [], fromPack };
    ev.fromPack ||= fromPack;
    if (fromPack && def.replace) ev.replaced = true;
    if (def.subtitle) ev.subtitle = def.subtitle;
    for (const s of def.sounds ?? []) {
      if (typeof s === 'string') {
        ev.files.push(fileRef(s.includes(':') ? s : `${ns}:${s}`, { fromPack: fromPack || undefined }));
      } else if (s && typeof s === 'object' && typeof (s as any).name === 'string') {
        const o = s as { name: string; type?: string; volume?: number; pitch?: number };
        const sid = o.name.includes(':') ? o.name : `${ns}:${o.name}`;
        if (o.type === 'event') ev.refs.push(sid);
        else ev.files.push(fileRef(sid, { volume: o.volume, pitch: o.pitch, fromPack: fromPack || undefined }));
      }
    }
    target.set(id, ev);
  }
}

/** Merges vanilla sounds.json with the pack's per-namespace sounds.json files, honouring `replace`. */
export function mergeSounds(vanilla: SoundsJson | undefined, pack: Record<string, SoundsJson | undefined>): SoundEvent[] {
  const events = new Map<string, SoundEvent>();
  addEvents(events, 'minecraft', vanilla, false);
  for (const [ns, json] of Object.entries(pack)) addEvents(events, ns, json, true);
  return [...events.values()].sort((a, b) => a.id.localeCompare(b.id));
}
