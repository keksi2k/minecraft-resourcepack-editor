import { create } from 'zustand';
import { LOCALES, t, useLocale } from '../i18n';
import { AssetStore } from '../assets/AssetStore';
import { loadVanillaAssets } from '../mojang/clientJar';
import { fetchAssetIndex, VanillaObjects } from '../mojang/soundAssets';
import { fetchManifest, fetchVersionJson, type VersionJson, type VersionManifest } from '../mojang/versions';
import { gameNames, listItems, type ItemEntry } from '../models/items';
import { loadPackZip, type LoadedPack, type PackMeta } from '../pack/loadPack';
import { clearSession, debounce, loadSession, loadSessionMeta, saveEdits, saveFunny, startSession, type SessionMeta } from './session';
import { computeFunny, type FunnySettings } from '../funny/funny';
import type { FunnyRecord } from '../funny/record';
import {
  addSoundToEvent,
  adoptEvent,
  inspectOgg,
  setSoundAttributes,
  type SoundAttributes,
  newSoundName,
  removeSoundFromEvent,
  setEventReplace,
  soundsJsonPath,
  type SoundsJsonFile,
} from '../sounds/editSounds';
import { mergeSounds, type SoundEvent, type SoundFileRef } from '../sounds/soundsJson';
import { soundPath } from '../models/resourceLocation';

export type Tab = 'items' | 'mobs' | 'textures' | 'sounds' | 'funny';

interface AppState {
  phase: 'start' | 'loading' | 'ready';
  status: string;
  progress?: number;
  error?: string;

  manifest?: VersionManifest;
  version?: VersionJson;
  /** Resource pack format of the loaded game version. */
  gameFormat?: number;

  packName: string;
  packMeta?: PackMeta;
  packIcon?: string;
  store?: AssetStore;
  /** Bumped on every edit so components re-read from the store. */
  revision: number;
  items: ItemEntry[];
  /** Minecraft display names (lang keys → text) in the UI language, falling back to English. */
  names: Record<string, string>;

  objects?: VanillaObjects;
  vanillaSounds?: Record<string, any>;
  soundEvents: SoundEvent[];
  soundsLoading: boolean;
  /** Why vanilla sounds couldn't be loaded, if they couldn't. */
  soundsError?: string;

  tab: Tab;
  /** A saved session from before a reload, offered on the start screen. */
  resumable?: SessionMeta;
  selectedItem?: string;
  selectedMob?: string;
  /** The applied funny changes (shuffle, colours), if any. */
  funny?: FunnyRecord;

  loadManifest(): Promise<void>;
  open(pack: LoadedPack | null, versionId: string, restoredEdits?: [string, Uint8Array | null][]): Promise<void>;
  resume(): Promise<void>;
  discardSession(): Promise<void>;
  setFile(path: string, data: Uint8Array | null): void;
  resetFile(path: string): void;
  /** Adds an uploaded .ogg as a new variant of a sound event. Returns a warning, if any. */
  addEventSound(eventId: string, file: File): Promise<string | undefined>;
  removeEventSound(eventId: string, ref: SoundFileRef): void;
  setEventReplace(eventId: string, replace: boolean): void;
  setSoundAttributes(eventId: string, ref: SoundFileRef, attrs: SoundAttributes): void;
  /** Copies an event's vanilla variants into the pack (replace: true) so they become editable. */
  adoptEvent(eventId: string): void;
  /** Replaces any earlier funny changes with new ones computed from `settings`. */
  applyFunny(settings: FunnySettings, onProgress?: (done: number, total: number) => void): Promise<void>;
  /** Puts every file the funny changes touched back the way it was. */
  removeFunny(): void;
  addLocalAssetsFolder(files: FileList): number;
  loadSounds(): Promise<void>;
  /** (Re)loads item/mob names for the current UI language. */
  loadGameNames(): Promise<void>;
  setTab(tab: Tab): void;
  select(id: string | undefined): void;
  selectMob(id: string | undefined): void;
  close(): void;
}

const packSoundFiles = (store: AssetStore) =>
  Object.fromEntries(
    store
      .list('assets/')
      .filter((p) => /^assets\/[^/]+\/sounds\.json$/.test(p))
      .map((p) => [p.split('/')[1], store.json<any>(p)]),
  );

export const useApp = create<AppState>((set, get) => ({
  phase: 'start',
  status: '',
  packName: '',
  revision: 0,
  items: [],
  names: {},
  soundEvents: [],
  soundsLoading: false,
  tab: 'items',

  async loadManifest() {
    void loadSessionMeta().then((resumable) => set({ resumable }));
    try {
      set({ manifest: await fetchManifest() });
    } catch (e) {
      set({ error: t('load.manifestError', { error: (e as Error).message }) });
    }
  },

  async open(pack, versionId, restoredEdits) {
    const entry = get().manifest?.versions.find((v) => v.id === versionId);
    if (!entry) return set({ error: t('load.unknownVersion', { version: versionId }) });
    set({ phase: 'loading', error: undefined, status: t('load.statusVersionInfo'), progress: undefined });
    try {
      const version = await fetchVersionJson(entry);
      const vanilla = await loadVanillaAssets(version, (status, progress) => set({ status, progress }));
      set({ status: t('load.statusAnalyzing'), progress: undefined });
      const store = new AssetStore(vanilla.files, pack?.files ?? new Map());
      const icon = store.get('pack.png');
      set({
        phase: 'ready',
        version,
        gameFormat: vanilla.packFormat,
        packName: pack?.name ?? t('load.newPackName'),
        packMeta: pack?.meta,
        packIcon: icon ? URL.createObjectURL(new Blob([icon], { type: 'image/png' })) : undefined,
        store,
        names: gameNames(store),
        items: listItems(store),
        revision: 0,
        selectedItem: undefined,
        selectedMob: undefined,
        soundEvents: [],
        objects: undefined,
        vanillaSounds: undefined,
        resumable: undefined,
        funny: undefined,
      });
      if (restoredEdits) {
        for (const [path, data] of restoredEdits) store.setEdit(path, data);
        refreshDerived();
      } else {
        void startSession(sessionMeta(), pack?.source).catch((e) => console.warn('Could not save session', e));
      }
      void get().loadSounds();
    } catch (e) {
      console.error(e);
      set({ phase: 'start', error: (e as Error).message });
    }
  },

  async loadSounds() {
    const { store, version } = get();
    if (!store || !version) return;
    set({ soundsLoading: true });
    let objects = get().objects;
    let vanillaSounds = get().vanillaSounds;
    let soundsError: string | undefined;
    try {
      objects ??= new VanillaObjects(await fetchAssetIndex(version));
      vanillaSounds ??= (await objects.soundsJson()) as Record<string, any>;
    } catch (e) {
      soundsError = (e as Error).message;
    }
    set({ objects, vanillaSounds, soundsError, soundsLoading: false, soundEvents: mergeSounds(vanillaSounds, packSoundFiles(store)) });
    void get().loadGameNames();
  },

  async loadGameNames() {
    const { store, objects } = get();
    if (!store) return;
    const code = LOCALES[useLocale.getState().locale].minecraftLang;
    let translated: Record<string, string> | undefined;
    if (code !== 'en_us') {
      // Vanilla translations live in the asset index (same server as sounds); a pack may add its own.
      const vanilla = await objects?.langJson(code).catch(() => undefined);
      translated = { ...vanilla, ...store.json<Record<string, string>>(`assets/minecraft/lang/${code}.json`) };
    }
    if (get().store !== store) return;
    const names = gameNames(store, translated);
    set({ names, items: listItems(store, names) });
  },

  async resume() {
    const saved = await loadSession();
    if (!saved) return set({ resumable: undefined });
    const pack = saved.zip ? await loadPackZip(saved.zip, saved.meta.packName) : null;
    if (pack) pack.name = saved.meta.packName;
    await get().open(pack, saved.meta.versionId, saved.edits);
    if (saved.funny && get().store) set({ funny: saved.funny });
  },

  async discardSession() {
    await clearSession();
    set({ resumable: undefined });
  },

  setFile(path, data) {
    const store = get().store!;
    store.setEdit(path, data);
    afterEdit(path);
  },

  resetFile(path) {
    get().store!.clearEdit(path);
    afterEdit(path);
  },

  async addEventSound(eventId, file) {
    const store = get().store!;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const info = inspectOgg(bytes);
    if (typeof info === 'string') throw new Error(info);
    const ns = eventId.includes(':') ? eventId.split(':')[0] : 'minecraft';
    const name = newSoundName(eventId, file.name, (n) => store.has(soundPath(`${ns}:${n}`)));
    get().setFile(soundPath(`${ns}:${name}`), bytes);
    const jsonPath = soundsJsonPath(eventId);
    writeJson(jsonPath, addSoundToEvent(store.json<SoundsJsonFile>(jsonPath) ?? {}, eventId, name));
    return info.channels > 1 ? t('sounds.stereoHint') : undefined;
  },

  removeEventSound(eventId, ref) {
    const store = get().store!;
    const jsonPath = soundsJsonPath(eventId);
    writeJson(jsonPath, removeSoundFromEvent(store.json<SoundsJsonFile>(jsonPath) ?? {}, eventId, ref.name));
    // Only drop the audio file if nothing else references it and it isn't a vanilla path.
    const stillUsed = get().soundEvents.some((e) => e.files.some((f) => f.path === ref.path));
    if (!stillUsed && !get().objects?.has(ref.key)) {
      if (store.pack.has(ref.path)) get().setFile(ref.path, null);
      else if (store.edits.has(ref.path)) get().resetFile(ref.path);
    }
  },

  setEventReplace(eventId, replace) {
    const jsonPath = soundsJsonPath(eventId);
    writeJson(jsonPath, setEventReplace(get().store!.json<SoundsJsonFile>(jsonPath) ?? {}, eventId, replace));
  },

  setSoundAttributes(eventId, ref, attrs) {
    const jsonPath = soundsJsonPath(eventId);
    writeJson(jsonPath, setSoundAttributes(get().store!.json<SoundsJsonFile>(jsonPath) ?? {}, eventId, ref.name, attrs));
  },

  adoptEvent(eventId) {
    const ev = get().soundEvents.find((e) => e.id === eventId);
    if (!ev) return;
    const jsonPath = soundsJsonPath(eventId);
    writeJson(jsonPath, adoptEvent(get().store!.json<SoundsJsonFile>(jsonPath) ?? {}, eventId, ev.files, ev.refs));
  },

  async applyFunny(settings, onProgress) {
    const store = get().store!;
    restoreFiles(store, get().funny?.before ?? []);
    set({ funny: undefined });
    let result;
    try {
      const events = mergeSounds(get().vanillaSounds, packSoundFiles(store));
      result = await computeFunny(store, events, settings, onProgress);
    } catch (e) {
      refreshDerived();
      persistEdits();
      void saveFunny(undefined);
      throw e;
    }
    const before: FunnyRecord['before'] = [...result.changes.keys()].map((p) => [p, store.edits.has(p) ? store.edits.get(p)! : undefined]);
    for (const [path, data] of result.changes) store.setEdit(path, data);
    const funny: FunnyRecord = { settings, stats: result.stats, before };
    set({ funny });
    refreshDerived();
    persistEdits();
    void saveFunny(funny).catch((e) => console.warn('Could not save funny changes', e));
  },

  removeFunny() {
    const store = get().store;
    if (!store) return;
    restoreFiles(store, get().funny?.before ?? []);
    set({ funny: undefined });
    refreshDerived();
    persistEdits();
    void saveFunny(undefined);
  },

  addLocalAssetsFolder(files) {
    const objects = get().objects;
    if (!objects) return 0;
    const n = objects.addLocalFolder(files);
    if (!get().vanillaSounds) void get().loadSounds();
    return n;
  },

  setTab: (tab) => set({ tab }),
  select: (selectedItem) => set({ selectedItem }),
  selectMob: (selectedMob) => set({ selectedMob }),

  close() {
    const icon = get().packIcon;
    if (icon) URL.revokeObjectURL(icon);
    void clearSession();
    set({ phase: 'start', store: undefined, items: [], soundEvents: [], packIcon: undefined, selectedItem: undefined, funny: undefined });
  },
}));

function writeJson(path: string, json: unknown) {
  useApp.getState().setFile(path, new TextEncoder().encode(JSON.stringify(json, null, 2)));
}

function sessionMeta(): SessionMeta {
  const s = useApp.getState();
  return { versionId: s.version!.id, packName: s.packName, packMeta: s.packMeta, editCount: s.store?.editCount ?? 0, savedAt: Date.now() };
}

const persistEdits = debounce(() => {
  const { store, phase } = useApp.getState();
  if (store && phase === 'ready') void saveEdits(sessionMeta(), store.edits).catch((e) => console.warn('Could not save edits', e));
}, 400);

function afterEdit(path: string) {
  const { store, vanillaSounds, revision } = useApp.getState();
  if (!store) return;
  const patch: Partial<AppState> = { revision: revision + 1, items: listItems(store, useApp.getState().names) };
  if (path.endsWith('sounds.json')) patch.soundEvents = mergeSounds(vanillaSounds, packSoundFiles(store));
  useApp.setState(patch);
  if (/^assets\/minecraft\/lang\//.test(path)) void useApp.getState().loadGameNames();
  persistEdits();
}

/** Puts files back to a recorded edit state (`undefined` = not edited). */
function restoreFiles(store: AssetStore, before: FunnyRecord['before']) {
  for (const [path, data] of before) {
    if (data === undefined) store.clearEdit(path);
    else store.setEdit(path, data);
  }
}

/** Recomputes everything derived from the store (after restoring a session). */
function refreshDerived() {
  const { store, vanillaSounds, revision, names } = useApp.getState();
  if (!store) return;
  useApp.setState({ revision: revision + 1, items: listItems(store, names), soundEvents: mergeSounds(vanillaSounds, packSoundFiles(store)) });
}

// Item and mob names follow the UI language.
useLocale.subscribe((s, prev) => {
  if (s.locale !== prev.locale) void useApp.getState().loadGameNames();
});
