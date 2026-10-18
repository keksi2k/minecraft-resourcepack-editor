import { create } from 'zustand';
import { LOCALES, t, useLocale } from '../i18n';
import { AssetStore } from '../assets/AssetStore';
import { loadVanillaAssets } from '../mojang/clientJar';
import { fetchAssetIndex, VanillaObjects } from '../mojang/soundAssets';
import { fetchManifest, fetchVersionJson, type VersionJson, type VersionManifest } from '../mojang/versions';
import { gameNames, listItems, type ItemEntry } from '../models/items';
import type { LoadedPack, PackMeta } from '../pack/loadPack';
import {
  addSoundToEvent,
  inspectOgg,
  newSoundName,
  removeSoundFromEvent,
  setEventReplace,
  soundsJsonPath,
  type SoundsJsonFile,
} from '../sounds/editSounds';
import { mergeSounds, type SoundEvent, type SoundFileRef } from '../sounds/soundsJson';
import { soundPath } from '../models/resourceLocation';

export type Tab = 'items' | 'mobs' | 'textures' | 'sounds';

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
  selectedItem?: string;
  selectedMob?: string;

  loadManifest(): Promise<void>;
  open(pack: LoadedPack | null, versionId: string): Promise<void>;
  setFile(path: string, data: Uint8Array | null): void;
  resetFile(path: string): void;
  /** Adds an uploaded .ogg as a new variant of a sound event. Returns a warning, if any. */
  addEventSound(eventId: string, file: File): Promise<string | undefined>;
  removeEventSound(eventId: string, ref: SoundFileRef): void;
  setEventReplace(eventId: string, replace: boolean): void;
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
    try {
      set({ manifest: await fetchManifest() });
    } catch (e) {
      set({ error: t('load.manifestError', { error: (e as Error).message }) });
    }
  },

  async open(pack, versionId) {
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
      });
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
    set({ phase: 'start', store: undefined, items: [], soundEvents: [], packIcon: undefined, selectedItem: undefined });
  },
}));

function writeJson(path: string, json: unknown) {
  useApp.getState().setFile(path, new TextEncoder().encode(JSON.stringify(json, null, 2)));
}

function afterEdit(path: string) {
  const { store, vanillaSounds, revision } = useApp.getState();
  if (!store) return;
  const patch: Partial<AppState> = { revision: revision + 1, items: listItems(store, useApp.getState().names) };
  if (path.endsWith('sounds.json')) patch.soundEvents = mergeSounds(vanillaSounds, packSoundFiles(store));
  useApp.setState(patch);
  if (/^assets\/minecraft\/lang\//.test(path)) void useApp.getState().loadGameNames();
}

// Item and mob names follow the UI language.
useLocale.subscribe((s, prev) => {
  if (s.locale !== prev.locale) void useApp.getState().loadGameNames();
});
