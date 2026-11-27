import { describe, expect, it } from 'vitest';
import { PackFolder, type DirHandleLike, type FileHandleLike } from '../pack/folder';

/** A folder in memory with the parts of the File System Access API the editor uses. */
class MemDir implements DirHandleLike {
  readonly kind = 'directory' as const;
  readonly children = new Map<string, MemDir | MemFile>();
  constructor(readonly name: string) {}
  async *values() {
    yield* this.children.values();
  }
  async getDirectoryHandle(name: string, opts?: { create?: boolean }) {
    let d = this.children.get(name);
    if (!d && opts?.create) this.children.set(name, (d = new MemDir(name)));
    if (!(d instanceof MemDir)) throw new DOMException('not found', 'NotFoundError');
    return d;
  }
  async getFileHandle(name: string, opts?: { create?: boolean }) {
    let f = this.children.get(name);
    if (!f && opts?.create) this.children.set(name, (f = new MemFile(name, new Uint8Array())));
    if (!(f instanceof MemFile)) throw new DOMException('not found', 'NotFoundError');
    return f;
  }
  async removeEntry(name: string) {
    if (!this.children.delete(name)) throw new DOMException('not found', 'NotFoundError');
  }
  /** Writes a file like another program would (new time stamp). */
  put(path: string, text: string) {
    const parts = path.split('/');
    let d: MemDir = this;
    for (const p of parts.slice(0, -1)) {
      if (!d.children.has(p)) d.children.set(p, new MemDir(p));
      d = d.children.get(p) as MemDir;
    }
    d.children.set(parts[parts.length - 1], new MemFile(parts[parts.length - 1], new TextEncoder().encode(text)));
  }
  read(path: string): string | undefined {
    let node: MemDir | MemFile | undefined = this;
    for (const p of path.split('/')) node = node instanceof MemDir ? node.children.get(p) : undefined;
    return node instanceof MemFile ? new TextDecoder().decode(node.data) : undefined;
  }
}

let clock = 1000;
class MemFile implements FileHandleLike {
  readonly kind = 'file' as const;
  modified = ++clock;
  constructor(
    readonly name: string,
    public data: Uint8Array,
  ) {}
  async getFile() {
    const data = this.data;
    return { size: data.length, lastModified: this.modified, arrayBuffer: async () => data.slice().buffer };
  }
  async createWritable() {
    return {
      write: async (d: Uint8Array) => {
        this.data = d.slice();
      },
      close: async () => {
        this.modified = ++clock;
      },
    };
  }
}

const text = (b: Uint8Array | undefined) => (b ? new TextDecoder().decode(b) : undefined);
const enc = (s: string) => new TextEncoder().encode(s);

describe('pack folder', () => {
  it('finds the pack inside the chosen folder and skips hidden folders', async () => {
    const root = new MemDir('projects');
    root.put('MyPack/pack.mcmeta', '{}');
    root.put('MyPack/assets/minecraft/textures/block/stone.png', 'png');
    root.put('MyPack/.git/HEAD', 'ref');
    const { folder, files } = await PackFolder.open(root);
    expect(folder.name).toBe('MyPack');
    expect(folder.root).toEqual(['MyPack']);
    expect([...files.keys()].sort()).toEqual(['assets/minecraft/textures/block/stone.png', 'pack.mcmeta']);
  });

  it('writes changed files, deletes removed ones and leaves the rest', async () => {
    const root = new MemDir('pack');
    root.put('pack.mcmeta', '{}');
    root.put('assets/minecraft/textures/a.png', 'a');
    root.put('assets/minecraft/textures/b.png', 'b');
    const { folder, files } = await PackFolder.open(root);
    const next = new Map(files);
    next.set('assets/minecraft/textures/a.png', enc('A'));
    next.delete('assets/minecraft/textures/b.png');
    next.set('assets/minecraft/textures/new/c.png', enc('c'));
    expect(await folder.write(next)).toBe(3);
    expect(root.read('assets/minecraft/textures/a.png')).toBe('A');
    expect(root.read('assets/minecraft/textures/b.png')).toBeUndefined();
    expect(root.read('assets/minecraft/textures/new/c.png')).toBe('c');
    // nothing left to do, and its own writes are no outside changes
    expect(await folder.write(next)).toBe(0);
    expect(await folder.scan()).toEqual({ changed: new Map(), removed: [] });
  });

  it('notices what other programs change', async () => {
    const root = new MemDir('pack');
    root.put('pack.mcmeta', '{}');
    root.put('assets/minecraft/textures/a.png', 'a');
    root.put('assets/minecraft/textures/gone.png', 'g');
    const { folder } = await PackFolder.open(root);
    root.put('assets/minecraft/textures/a.png', 'edited in aseprite');
    root.put('assets/minecraft/textures/added.png', 'new');
    root.put('pack.mcmeta', '{}'); // saved again unchanged: not a change
    await root.getDirectoryHandle('assets').then((d) => d.getDirectoryHandle('minecraft')).then((d) => d.getDirectoryHandle('textures')).then((d) => d.removeEntry('gone.png'));
    const { changed, removed } = await folder.scan();
    expect([...changed.keys()].sort()).toEqual(['assets/minecraft/textures/a.png', 'assets/minecraft/textures/added.png']);
    expect(text(changed.get('assets/minecraft/textures/a.png'))).toBe('edited in aseprite');
    expect(removed).toEqual(['assets/minecraft/textures/gone.png']);
    expect((await folder.scan()).changed.size).toBe(0);
  });
});
