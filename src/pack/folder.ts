import { findPackRoot, parsePackMeta, type LoadedPack } from './loadPack';

/**
 * Working on a pack folder on disk instead of a ZIP (File System Access API, Chromium browsers).
 * The folder is read once; afterwards every change in the editor is written back, and files
 * changed by other programs (Aseprite, Blockbench, a text editor …) are picked up again.
 *
 * The handle types are declared here in the shape this code needs, so tests can use an
 * in-memory folder.
 */

export interface FileLike {
  size: number;
  lastModified: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface FileHandleLike {
  kind: 'file';
  name: string;
  getFile(): Promise<FileLike>;
  createWritable(): Promise<{ write(data: Uint8Array): Promise<void>; close(): Promise<void> }>;
}

export interface DirHandleLike {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<FileHandleLike | DirHandleLike>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<DirHandleLike>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike>;
  removeEntry(name: string): Promise<void>;
  queryPermission?(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(desc: { mode: 'read' | 'readwrite' }): Promise<PermissionState>;
}

declare global {
  interface Window {
    showDirectoryPicker?(opts?: { mode?: 'read' | 'readwrite'; id?: string }): Promise<DirHandleLike>;
  }
}

export const folderSupported = () => typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

/** Folders that never belong to a pack (version control, editor settings …). */
const SKIP = (name: string) => name.startsWith('.') || name === 'node_modules' || name === '__MACOSX';

interface Stamp {
  size: number;
  modified: number;
}

/** Every file below `dir` (path → handle), paths relative to it with `/`. */
async function walk(dir: DirHandleLike, prefix = '', out = new Map<string, FileHandleLike>()): Promise<Map<string, FileHandleLike>> {
  for await (const entry of dir.values()) {
    if (SKIP(entry.name)) continue;
    const path = `${prefix}${entry.name}`;
    if (entry.kind === 'directory') await walk(entry, `${path}/`, out);
    else out.set(path, entry);
  }
  return out;
}

const stamp = (f: FileLike): Stamp => ({ size: f.size, modified: f.lastModified });
const sameStamp = (a: Stamp | undefined, b: Stamp) => !!a && a.size === b.size && a.modified === b.modified;
const sameBytes = (a: Uint8Array | undefined, b: Uint8Array | undefined) => !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);

export interface FolderChanges {
  /** Files that are new or changed on disk. */
  changed: Map<string, Uint8Array>;
  /** Files that were deleted on disk. */
  removed: string[];
}

/**
 * The pack folder: what is on disk (with size and time, to notice other programs' changes) and
 * what the editor last wrote there.
 */
export class PackFolder {
  private stamps = new Map<string, Stamp>();
  /** Contents on disk as far as this editor knows (what it read or wrote). */
  private disk = new Map<string, Uint8Array>();
  private busy: Promise<unknown> = Promise.resolve();

  private constructor(
    readonly handle: DirHandleLike,
    /** Folders from the chosen folder down to the pack root (pack.mcmeta / assets/). */
    readonly root: string[],
  ) {}

  get name() {
    return this.root.length ? this.root[this.root.length - 1] : this.handle.name;
  }

  /** Reads the folder; the pack may sit in a subfolder of the chosen one. */
  static async open(handle: DirHandleLike, root?: string[]): Promise<{ folder: PackFolder; files: Map<string, Uint8Array> }> {
    const all = await walk(handle);
    const prefix = root ? root.map((r) => `${r}/`).join('') : findPackRoot([...all.keys()]);
    const folder = new PackFolder(handle, prefix.split('/').filter(Boolean));
    const files = new Map<string, Uint8Array>();
    for (const [path, h] of all) {
      if (!path.startsWith(prefix)) continue;
      const f = await h.getFile();
      const bytes = new Uint8Array(await f.arrayBuffer());
      const inner = path.slice(prefix.length);
      files.set(inner, bytes);
      folder.disk.set(inner, bytes);
      folder.stamps.set(inner, stamp(f));
    }
    return { folder, files };
  }

  /** The pack as the editor loads it. */
  static toPack(folder: PackFolder, files: Map<string, Uint8Array>): LoadedPack {
    return { name: folder.name, files, meta: parsePackMeta(files.get('pack.mcmeta')), folder };
  }

  private async dir(parts: string[], create: boolean): Promise<DirHandleLike> {
    let d = this.handle;
    for (const p of [...this.root, ...parts]) d = await d.getDirectoryHandle(p, { create });
    return d;
  }

  /** One thing at a time: a scan must not see a file half written. */
  private queue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.busy.then(job, job);
    this.busy = next.catch(() => undefined);
    return next;
  }

  /**
   * Makes the folder hold exactly `files` (the pack as it should be): writes what differs from
   * the disk and deletes what is gone. Returns how many files were written or deleted.
   */
  write(files: Map<string, Uint8Array>): Promise<number> {
    return this.queue(async () => {
      let n = 0;
      for (const [path, bytes] of files) {
        if (this.disk.get(path) === bytes || sameBytes(this.disk.get(path), bytes)) continue;
        const parts = path.split('/');
        const dir = await this.dir(parts.slice(0, -1), true);
        const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
        const w = await fh.createWritable();
        await w.write(bytes);
        await w.close();
        this.disk.set(path, bytes);
        this.stamps.set(path, stamp(await fh.getFile()));
        n++;
      }
      for (const path of [...this.disk.keys()]) {
        if (files.has(path)) continue;
        const parts = path.split('/');
        try {
          await (await this.dir(parts.slice(0, -1), false)).removeEntry(parts[parts.length - 1]);
        } catch {
          // already gone
        }
        this.disk.delete(path);
        this.stamps.delete(path);
        n++;
      }
      return n;
    });
  }

  /** What other programs changed since the last read or write. */
  scan(): Promise<FolderChanges> {
    return this.queue(async () => {
      const changed = new Map<string, Uint8Array>();
      const seen = new Set<string>();
      let root: DirHandleLike;
      try {
        root = await this.dir([], false);
      } catch {
        return { changed, removed: [...this.disk.keys()] };
      }
      for (const [path, h] of await walk(root)) {
        seen.add(path);
        const f = await h.getFile();
        const s = stamp(f);
        if (sameStamp(this.stamps.get(path), s)) continue;
        const bytes = new Uint8Array(await f.arrayBuffer());
        this.stamps.set(path, s);
        // saved again without changes (or touched): nothing to reload
        if (sameBytes(this.disk.get(path), bytes)) continue;
        this.disk.set(path, bytes);
        changed.set(path, bytes);
      }
      const removed = [...this.disk.keys()].filter((p) => !seen.has(p));
      for (const p of removed) {
        this.disk.delete(p);
        this.stamps.delete(p);
      }
      return { changed, removed };
    });
  }

  /** Whether the browser still lets the editor write there; asks if `ask` (needs a click). */
  async permitted(ask: boolean): Promise<boolean> {
    const desc = { mode: 'readwrite' as const };
    if ((await this.handle.queryPermission?.(desc)) === 'granted') return true;
    return ask ? (await this.handle.requestPermission?.(desc)) === 'granted' : false;
  }
}

/** Lets the user pick a folder and reads the pack in it. */
export async function pickPackFolder(): Promise<LoadedPack | undefined> {
  if (!window.showDirectoryPicker) return undefined;
  let handle: DirHandleLike;
  try {
    handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'rpe-pack' });
  } catch {
    return undefined; // cancelled
  }
  const { folder, files } = await PackFolder.open(handle);
  return PackFolder.toPack(folder, files);
}
