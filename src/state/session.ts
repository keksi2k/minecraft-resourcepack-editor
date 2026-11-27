import { del, get, set, setMany } from 'idb-keyval';
import type { FunnyRecord } from '../funny/record';
import type { PackMeta } from '../pack/loadPack';
import type { DirHandleLike } from '../pack/folder';

/**
 * The open pack and the user's edits, kept in IndexedDB so a reload or crash doesn't lose work.
 * The pack is stored as its original ZIP (cheaper than thousands of entries); edits as path → bytes
 * (null = file removed from the pack).
 */
export interface SessionMeta {
  versionId: string;
  packName: string;
  packMeta?: PackMeta;
  editCount: number;
  savedAt: number;
  /** The pack is a folder on disk (its handle is stored, not a ZIP). */
  folder?: boolean;
}

/** A pack folder as stored: the folder the user chose and the path down to the pack inside it. */
export interface StoredFolder {
  handle: DirHandleLike;
  root: string[];
}

const KEY = { meta: 'session:v1:meta', zip: 'session:v1:zip', edits: 'session:v1:edits', funny: 'session:v1:funny', folder: 'session:v1:folder' };

export interface StoredSession {
  meta: SessionMeta;
  zip?: Blob;
  edits: [string, Uint8Array | null][];
  funny?: FunnyRecord;
  folder?: StoredFolder;
}

export async function startSession(meta: SessionMeta, zip: Blob | undefined, folder?: StoredFolder): Promise<void> {
  await clearSession();
  await setMany([
    [KEY.meta, meta],
    [KEY.zip, zip ?? null],
    [KEY.edits, []],
    ...(folder ? ([[KEY.folder, folder]] as [string, StoredFolder][]) : []),
  ]);
}

export async function saveEdits(meta: SessionMeta, edits: Map<string, Uint8Array | null>): Promise<void> {
  await setMany([
    [KEY.meta, meta],
    [KEY.edits, [...edits]],
  ]);
}

/** The applied funny changes and what the files were before, so they can be undone after a reload. */
export async function saveFunny(record: FunnyRecord | undefined): Promise<void> {
  await (record ? set(KEY.funny, record) : del(KEY.funny));
}

export function loadSessionMeta(): Promise<SessionMeta | undefined> {
  return get<SessionMeta>(KEY.meta).catch(() => undefined);
}

export async function loadSession(): Promise<StoredSession | undefined> {
  const meta = await loadSessionMeta();
  if (!meta) return undefined;
  const [zip, edits, funny, folder] = await Promise.all([
    get<Blob | null>(KEY.zip),
    get<[string, Uint8Array | null][]>(KEY.edits),
    get<FunnyRecord>(KEY.funny).catch(() => undefined),
    get<StoredFolder>(KEY.folder).catch(() => undefined),
  ]);
  return { meta, zip: zip ?? undefined, edits: edits ?? [], funny, folder };
}

export async function clearSession(): Promise<void> {
  await Promise.all(Object.values(KEY).map((k) => del(k))).catch(() => {});
}

/** Coalesces rapid edits into one write. */
export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
