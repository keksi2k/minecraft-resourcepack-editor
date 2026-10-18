import { del, get, setMany } from 'idb-keyval';
import type { PackMeta } from '../pack/loadPack';

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
}

const KEY = { meta: 'session:v1:meta', zip: 'session:v1:zip', edits: 'session:v1:edits' };

export interface StoredSession {
  meta: SessionMeta;
  zip?: Blob;
  edits: [string, Uint8Array | null][];
}

export async function startSession(meta: SessionMeta, zip: Blob | undefined): Promise<void> {
  await clearSession();
  await setMany([
    [KEY.meta, meta],
    [KEY.zip, zip ?? null],
    [KEY.edits, []],
  ]);
}

export async function saveEdits(meta: SessionMeta, edits: Map<string, Uint8Array | null>): Promise<void> {
  await setMany([
    [KEY.meta, meta],
    [KEY.edits, [...edits]],
  ]);
}

export function loadSessionMeta(): Promise<SessionMeta | undefined> {
  return get<SessionMeta>(KEY.meta).catch(() => undefined);
}

export async function loadSession(): Promise<StoredSession | undefined> {
  const meta = await loadSessionMeta();
  if (!meta) return undefined;
  const [zip, edits] = await Promise.all([get<Blob | null>(KEY.zip), get<[string, Uint8Array | null][]>(KEY.edits)]);
  return { meta, zip: zip ?? undefined, edits: edits ?? [] };
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
