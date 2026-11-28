import { create } from 'zustand';
import { LOCALES, t, useLocale } from '../i18n';
import { AssetStore } from '../assets/AssetStore';
import { loadVanillaAssets } from '../mojang/clientJar';
import { fetchAssetIndex, VanillaObjects } from '../mojang/soundAssets';
import { fetchManifest, fetchVersionJson, type VersionJson, type VersionManifest } from '../mojang/versions';
import { gameNames, listItems, type ItemEntry } from '../models/items';
import { listPlants, type PlantEntry } from '../models/plants';
import { loadPackZip, parsePackMeta, type LoadedPack, type PackMeta } from '../pack/loadPack';
import { clearSession, debounce, loadSession, loadSessionMeta, saveEdits, saveFunny, startSession, type SessionMeta } from './session';
import type { FunnySettings } from '../funny/funny';
import type { FunnyRecord } from '../funny/record';
import {
  addSoundToEvent,
  adoptEvent,
  setSoundAttributes,
  type SoundAttributes,
  newSoundName,
  removeSoundFromEvent,
  setEventReplace,
  soundsJsonPath,
  type SoundsJsonFile,
} from '../sounds/editSounds';
import { ensureVorbis } from '../sounds/audioEdit';
import { useEditor } from './editorStore';
import { mergeSounds, type SoundEvent, type SoundFileRef } from '../sounds/soundsJson';
import { soundPath } from '../models/resourceLocation';
import { activeOverlays } from '../pack/overlays';
import { PackFolder } from '../pack/folder';

export type Tab = 'items' | 'plants' | 'mobs' | 'textures' | 'sounds' | 'scenes' | 'texts' | 'progress' | 'funny';

export interface FolderState {
  name: string;
  status: 'saved' | 'saving' | 'error' | 'reloaded' | 'denied';
  /** When the last write or reload finished. */
  at?: number;
  /** Files reloaded from disk by the last reload. */
  reloaded?: number;
  error?: string;
}

/** Files as they were before a batch change (`undefined` = not edited), for undoing it. */
export type FileStates = [string, Uint8Array | null | undefined][];

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
  plants: PlantEntry[];
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
  selectedPlant?: string;
  selectedMob?: string;
  /** The applied funny changes (shuffle, colours), if any. */
  funny?: FunnyRecord;
  /** A texture to show in the texture tab (bumped `n` re-triggers the same path). */
  textureFocus?: { path: string; n: number };
  /** The last batch change, so it can be undone in one go. */
  lastBatch?: { before: FileStates; count: number };
  /** Steps that can be undone and redone (each the files one action changed). */
  undoCount: number;
  redoCount: number;
  /** A sound event to show in the sounds tab (bumped `n` re-triggers the same one). */
  soundFocus?: { id: string; n: number };
  /** The pack folder on disk the editor writes to, if the pack was opened from one. */
  folder?: FolderState;
  /** Reads what other programs changed in the pack folder. */
  reloadFolder(): Promise<void>;
  /** Asks the browser again for permission to write to the folder (after a reload), then writes. */
  allowFolder(): Promise<void>;
  /** The pack upgrade dialog is open. */
  upgradeOpen: boolean;
  setUpgradeOpen(open: boolean): void;

  loadManifest(): Promise<void>;
  open(pack: LoadedPack | null, versionId: string, restoredEdits?: [string, Uint8Array | null][]): Promise<void>;
  resume(): Promise<void>;
  discardSession(): Promise<void>;
  setFile(path: string, data: Uint8Array | null): void;
  resetFile(path: string): void;
  /** Adds an uploaded .ogg as a new variant of a sound event. Returns a warning, if any. */
  addEventSound(eventId: string, file: File): Promise<string | undefined>;
  /** Adds Ogg Vorbis bytes (e.g. a recording) as a new variant named after `name`. */
  addEventSoundBytes(eventId: string, bytes: Uint8Array, name: string): void;
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
  /**
   * Fetches vanilla files that live in the asset index instead of the jar (path → index key) and
   * adds them to the vanilla layer, so they can be shown and edited like any other file.
   */
  ensureVanillaObjects(files: [path: string, key: string][]): Promise<void>;
  /** (Re)loads item/mob names for the current UI language. */
  loadGameNames(): Promise<void>;
  setTab(tab: Tab): void;
  /** Opens the texture tab with this texture selected. */
  focusTexture(path: string): void;
  /** Writes many files at once and remembers how they were, for `undoBatch`. */
  applyBatch(changes: Map<string, Uint8Array | null>): void;
  undoBatch(): void;
  /** Takes back the last change to the pack's files (any tab), or does it again. */
  undo(): void;
  redo(): void;
  /** Opens the sounds tab with this event shown. */
  focusSound(id: string): void;
  select(id: string | undefined): void;
  selectPlant(id: string | undefined): void;
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
  plants: [],
  names: {},
  soundEvents: [],
  soundsLoading: false,
  tab: 'items',
  undoCount: 0,
  redoCount: 0,
  upgradeOpen: false,
  setUpgradeOpen: (upgradeOpen) => set({ upgradeOpen }),

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
      store.setOverlays(activeOverlays(parsePackMeta(store.get('pack.mcmeta'))?.raw, vanilla.packFormat));
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
        plants: listPlants(store),
        revision: 0,
        selectedItem: undefined,
        selectedPlant: undefined,
        selectedMob: undefined,
        soundEvents: [],
        objects: undefined,
        vanillaSounds: undefined,
        resumable: undefined,
        funny: undefined,
        lastBatch: undefined,
      });
      if (restoredEdits) {
        for (const [path, data] of restoredEdits) store.setEdit(path, data);
        refreshDerived(restoredEdits.map(([p]) => p));
      }
      startHistory(store);
      attachFolder(pack?.folder);
      if (!restoredEdits) {
        const f = pack?.folder;
        void startSession(sessionMeta(), pack?.source, f && { handle: f.handle, root: f.root }).catch((e) => console.warn('Could not save session', e));
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

  async ensureVanillaObjects(files) {
    const { store, objects } = get();
    if (!store || !objects) return;
    // the jar may hold a placeholder (the panorama is 1×1 there); the game uses the asset index's file
    const done = fetchedObjects.get(store) ?? new Set<string>();
    fetchedObjects.set(store, done);
    const missing = files.filter(([path, key]) => !done.has(path) && objects.has(key));
    if (!missing.length) return;
    missing.forEach(([path]) => done.add(path));
    const fetched = await Promise.all(missing.map(([, key]) => objects.fetch(key).catch(() => undefined)));
    if (get().store !== store) return;
    missing.forEach(([path], i) => (fetched[i] ? store.addVanilla(path, fetched[i]!) : done.delete(path)));
    set({ revision: get().revision + 1 });
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
    set({ names, items: listItems(store, names), plants: listPlants(store, names) });
  },

  async resume() {
    const saved = await loadSession();
    if (!saved) return set({ resumable: undefined });
    let pack: LoadedPack | null = null;
    let edits = saved.edits;
    if (saved.meta.folder && saved.folder) {
      // the folder holds the pack and everything written before the reload; the browser asks first
      const { handle, root } = saved.folder;
      try {
        if ((await handle.queryPermission?.({ mode: 'readwrite' })) !== 'granted' && (await handle.requestPermission?.({ mode: 'readwrite' })) !== 'granted') {
          throw new Error(t('folder.denied', { name: saved.meta.packName }));
        }
        const { folder, files } = await PackFolder.open(handle, root);
        pack = PackFolder.toPack(folder, files);
        // only what didn't reach the disk any more
        edits = edits.filter(([p, d]) => (d ? !sameBytes(files.get(p), d) : files.has(p)));
      } catch (e) {
        return set({ error: (e as Error).message });
      }
    } else if (saved.zip) pack = await loadPackZip(saved.zip, saved.meta.packName);
    if (pack) pack.name = saved.meta.packName;
    await get().open(pack, saved.meta.versionId, edits);
    if (saved.funny && get().store) set({ funny: saved.funny });
  },

  async discardSession() {
    await clearSession();
    set({ resumable: undefined });
  },

  setFile(path, data) {
    const store = get().store!;
    // a file an active overlay provides is changed where the game reads it: in the overlay
    store.setEdit(store.writePath(path), data);
    afterEdit(path);
  },

  resetFile(path) {
    const store = get().store!;
    store.clearEdit(store.editPath(path) ?? path);
    afterEdit(path);
  },

  async addEventSound(eventId, file) {
    // Anything the browser can decode is turned into Ogg Vorbis, the only format Minecraft plays.
    const { bytes, channels, converted } = await ensureVorbis(new Uint8Array(await file.arrayBuffer()));
    get().addEventSoundBytes(eventId, bytes, file.name);
    const notes = [converted && t('sounds.converted', { name: file.name }), channels > 1 && t('sounds.stereoHint')].filter(Boolean);
    return notes.length ? notes.join(' ') : undefined;
  },

  addEventSoundBytes(eventId, bytes, fileName) {
    const store = get().store!;
    const ns = eventId.includes(':') ? eventId.split(':')[0] : 'minecraft';
    const name = newSoundName(eventId, fileName, (n) => store.has(soundPath(`${ns}:${n}`)));
    get().setFile(soundPath(`${ns}:${name}`), bytes);
    const jsonPath = soundsJsonPath(eventId);
    writeJson(jsonPath, addSoundToEvent(store.json<SoundsJsonFile>(jsonPath) ?? {}, eventId, name));
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
      const { computeFunny } = await import('../funny/funny');
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

  setTab(tab) {
    if (tab === get().tab) return;
    // an open editor belongs to its tab; leaving the tab closes it
    const editor = useEditor.getState();
    if (editor.target) {
      if (!editor.confirmLeave()) return;
      editor.close();
    }
    set({ tab });
  },
  focusTexture(path) {
    get().setTab('textures');
    if (get().tab === 'textures') set({ textureFocus: { path, n: (get().textureFocus?.n ?? 0) + 1 } });
  },

  applyBatch(changes) {
    const store = get().store;
    if (!store || !changes.size) return;
    changes = new Map([...changes].map(([p, d]) => [store.writePath(p), d]));
    const before: FileStates = [...changes.keys()].map((p) => [p, store.edits.has(p) ? store.edits.get(p)! : undefined]);
    for (const [path, data] of changes) store.setEdit(path, data);
    set({ lastBatch: { before, count: changes.size } });
    refreshDerived(changes.keys());
    persistEdits();
  },

  undoBatch() {
    const { store, lastBatch } = get();
    if (!store || !lastBatch) return;
    restoreFiles(store, lastBatch.before);
    set({ lastBatch: undefined });
    refreshDerived(lastBatch.before.map(([p]) => p));
    persistEdits();
  },

  undo() {
    const step = history.undo.pop();
    if (!step) return;
    replay(step, 'before');
    history.redo.push(step);
    syncHistory();
  },

  redo() {
    const step = history.redo.pop();
    if (!step) return;
    replay(step, 'after');
    history.undo.push(step);
    syncHistory();
  },

  focusSound(id) {
    get().setTab('sounds');
    if (get().tab === 'sounds') set({ soundFocus: { id, n: (get().soundFocus?.n ?? 0) + 1 } });
  },

  select: (selectedItem) => set({ selectedItem }),
  selectPlant: (selectedPlant) => set({ selectedPlant }),
  selectMob: (selectedMob) => set({ selectedMob }),

  async reloadFolder() {
    const { store } = get();
    const folder = activeFolder;
    if (!store || !folder) return;
    try {
      const { changed, removed } = await folder.scan();
      if (get().store !== store) return;
      for (const [path, bytes] of changed) store.setPackFile(path, bytes);
      for (const path of removed) store.setPackFile(path, undefined);
      const n = changed.size + removed.length;
      if (n) {
        refreshDerived();
        persistEdits();
        if ([...changed.keys(), ...removed].some((p) => /^assets\/minecraft\/lang\//.test(p))) void get().loadGameNames();
      }
      const before = get().folder;
      set({ folder: n || before?.status !== 'error' ? { name: folder.name, status: n ? 'reloaded' : 'saved', at: Date.now(), reloaded: n } : before });
    } catch (e) {
      set({ folder: { name: folder.name, status: 'error', error: (e as Error).message } });
    }
  },

  async allowFolder() {
    const folder = activeFolder;
    if (!folder) return;
    if (await folder.permitted(true)) await writeFolder();
    else set({ folder: { name: folder.name, status: 'denied' } });
  },

  close() {
    attachFolder(undefined);
    const icon = get().packIcon;
    if (icon) URL.revokeObjectURL(icon);
    void clearSession();
    useEditor.getState().close();
    history.undo = [];
    history.redo = [];
    set({ phase: 'start', store: undefined, items: [], plants: [], soundEvents: [], packIcon: undefined, selectedItem: undefined, selectedPlant: undefined, funny: undefined, lastBatch: undefined, textureFocus: undefined, undoCount: 0, redoCount: 0, upgradeOpen: false });
  },
}));

/* undo / redo ------------------------------------------------------------------------------- */

type Change = [path: string, before: Uint8Array | null | undefined, after: Uint8Array | null | undefined];
const HISTORY_LIMIT = 100;
const history: { undo: Change[][]; redo: Change[][]; open?: Change[]; replaying: boolean } = { undo: [], redo: [], replaying: false };

/** Records every edit of the store; edits made in one go (one click) become one step. */
function startHistory(store: AssetStore) {
  history.undo = [];
  history.redo = [];
  history.open = undefined;
  store.onEdit = (path, before, after) => {
    if (history.replaying) return;
    if (!history.open) {
      const step: Change[] = [];
      history.open = step;
      queueMicrotask(() => {
        history.open = undefined;
        if (!step.length) return;
        history.undo.push(step);
        if (history.undo.length > HISTORY_LIMIT) history.undo.shift();
        history.redo = [];
        syncHistory();
      });
    }
    history.open.push([path, before, after]);
  };
}

function replay(step: Change[], side: 'before' | 'after') {
  const store = useApp.getState().store;
  if (!store) return;
  history.replaying = true;
  try {
    const list = side === 'before' ? [...step].reverse() : step;
    for (const [path, before, after] of list) {
      const v = side === 'before' ? before : after;
      if (v === undefined) store.clearEdit(path);
      else store.setEdit(path, v);
    }
  } finally {
    history.replaying = false;
  }
  // a batch or the funny changes can't be undone on their own after this
  useApp.setState({ lastBatch: undefined });
  refreshDerived(step.map(([p]) => p));
  persistEdits();
}

function syncHistory() {
  useApp.setState({ undoCount: history.undo.length, redoCount: history.redo.length });
}

/** Vanilla files already taken from the asset index, per store. */
const fetchedObjects = new WeakMap<AssetStore, Set<string>>();

function writeJson(path: string, json: unknown) {
  useApp.getState().setFile(path, new TextEncoder().encode(JSON.stringify(json, null, 2)));
}

function sessionMeta(): SessionMeta {
  const s = useApp.getState();
  return { versionId: s.version!.id, packName: s.packName, packMeta: s.packMeta, editCount: s.store?.editCount ?? 0, savedAt: Date.now(), folder: !!activeFolder || undefined };
}

const persistEdits = debounce(() => {
  const { store, phase } = useApp.getState();
  if (store && phase === 'ready') void saveEdits(sessionMeta(), store.edits).catch((e) => console.warn('Could not save edits', e));
  if (activeFolder) void writeFolder();
}, 400);

/* pack folder ------------------------------------------------------------------------------- */

/** The folder the open pack came from; every change is written there. */
let activeFolder: PackFolder | undefined;
let stopWatching: (() => void) | undefined;

const sameBytes = (a: Uint8Array | undefined, b: Uint8Array) => !!a && a.length === b.length && a.every((v, i) => v === b[i]);

/** Chromium 129+ tells about changes in a folder; elsewhere the folder is read again on focus. */
type FolderObserver = { observe(handle: unknown, opts: { recursive: boolean }): Promise<void>; disconnect(): void };
const Observer = (globalThis as { FileSystemObserver?: new (cb: () => void) => FolderObserver }).FileSystemObserver;

function attachFolder(folder: PackFolder | undefined) {
  stopWatching?.();
  stopWatching = undefined;
  activeFolder = folder;
  useApp.setState({ folder: folder && { name: folder.name, status: 'saved', at: Date.now() } });
  if (!folder) return;
  // coming back from another program (Aseprite, Blockbench …): read what it saved
  const reload = debounce(() => void useApp.getState().reloadFolder(), 150);
  const onVisible = () => document.visibilityState === 'visible' && reload();
  window.addEventListener('focus', reload);
  document.addEventListener('visibilitychange', onVisible);
  let observer: FolderObserver | undefined;
  try {
    if (Observer) {
      observer = new Observer(reload);
      void observer.observe(folder.handle, { recursive: true }).catch(() => undefined);
    }
  } catch {
    observer = undefined;
  }
  stopWatching = () => {
    window.removeEventListener('focus', reload);
    document.removeEventListener('visibilitychange', onVisible);
    observer?.disconnect();
  };
}

/** Writes the pack (its files plus the edits) to the folder. */
async function writeFolder() {
  const { store } = useApp.getState();
  const folder = activeFolder;
  if (!store || !folder) return;
  const files = new Map(store.pack);
  for (const [path, data] of store.edits) {
    if (data) files.set(path, data);
    else files.delete(path);
  }
  useApp.setState({ folder: { name: folder.name, status: 'saving' } });
  try {
    await folder.write(files);
    if (activeFolder === folder) useApp.setState({ folder: { name: folder.name, status: 'saved', at: Date.now() } });
  } catch (e) {
    if (activeFolder !== folder) return;
    const name = (e as DOMException)?.name;
    useApp.setState({ folder: { name: folder.name, status: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'error', error: (e as Error).message } });
  }
}

function afterEdit(path: string) {
  const { store, vanillaSounds, revision } = useApp.getState();
  if (!store) return;
  const { names } = useApp.getState();
  const patch: Partial<AppState> = { revision: revision + 1, items: listItems(store, names), plants: listPlants(store, names) };
  if (path.endsWith('sounds.json')) patch.soundEvents = mergeSounds(vanillaSounds, packSoundFiles(store));
  useApp.setState(patch);
  if (/^assets\/minecraft\/lang\//.test(path)) void useApp.getState().loadGameNames();
  if (path === 'pack.png') refreshIcon();
  if (path === 'pack.mcmeta') {
    useApp.setState({ packMeta: parsePackMeta(store.get(path)) });
    syncOverlays();
  }
  persistEdits();
}

/** Applies the overlays pack.mcmeta declares for the loaded game version. */
function syncOverlays() {
  const { store, gameFormat, revision, names } = useApp.getState();
  if (!store) return;
  const before = store.overlays.join('/');
  store.setOverlays(activeOverlays(parsePackMeta(store.get('pack.mcmeta'))?.raw, gameFormat));
  if (store.overlays.join('/') !== before) useApp.setState({ revision: revision + 1, items: listItems(store, names), plants: listPlants(store, names) });
}

/** Shows the current pack.png (after it was uploaded, edited, removed or restored). */
function refreshIcon() {
  const { store, packIcon } = useApp.getState();
  if (packIcon) URL.revokeObjectURL(packIcon);
  const icon = store?.get('pack.png');
  useApp.setState({ packIcon: icon ? URL.createObjectURL(new Blob([icon], { type: 'image/png' })) : undefined });
}

/** Puts files back to a recorded edit state (`undefined` = not edited). */
function restoreFiles(store: AssetStore, before: FileStates) {
  for (const [path, data] of before) {
    if (data === undefined) store.clearEdit(path);
    else store.setEdit(path, data);
  }
}

/** Recomputes everything derived from the store (after restoring a session or changing many files);
 *  `paths` are the files that changed, so item names are read again when a language file is among them. */
function refreshDerived(paths: Iterable<string> = []) {
  const { store, vanillaSounds, revision, names } = useApp.getState();
  if (!store) return;
  useApp.setState({
    revision: revision + 1,
    items: listItems(store, names),
    plants: listPlants(store, names),
    soundEvents: mergeSounds(vanillaSounds, packSoundFiles(store)),
    packMeta: parsePackMeta(store.get('pack.mcmeta')),
  });
  syncOverlays();
  refreshIcon();
  if ([...paths].some((p) => /^assets\/minecraft\/lang\//.test(p))) void useApp.getState().loadGameNames();
}

// Item and mob names follow the UI language.
useLocale.subscribe((s, prev) => {
  if (s.locale !== prev.locale) void useApp.getState().loadGameNames();
});
