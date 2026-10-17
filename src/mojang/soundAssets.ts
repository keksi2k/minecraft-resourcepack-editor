import { get, set } from 'idb-keyval';
import { fetchJsonCached } from './fetchUtil';
import type { VersionJson } from './versions';

export interface AssetIndex {
  objects: Record<string, { hash: string; size: number }>;
}

const BASE_KEY = 'mcres-base';

/**
 * Base URL for resources.download.minecraft.net. That host sends no CORS headers, so the
 * browser has to go through a proxy: /mcres in dev/preview (see vite.config.ts), or a URL
 * configured via VITE_RESOURCES_BASE / the settings field.
 */
export function getResourcesBase(): string {
  try {
    const stored = localStorage.getItem(BASE_KEY);
    if (stored) return stored;
  } catch {}
  return import.meta.env.VITE_RESOURCES_BASE ?? '/mcres';
}

export function setResourcesBase(url: string) {
  try {
    if (url) localStorage.setItem(BASE_KEY, url.replace(/\/$/, ''));
    else localStorage.removeItem(BASE_KEY);
  } catch {}
}

export function fetchAssetIndex(version: VersionJson): Promise<AssetIndex> {
  return fetchJsonCached<AssetIndex>(version.assetIndex.url);
}

/** Vanilla files that live outside the client jar (sounds, sounds.json), addressed by asset-index key. */
export class VanillaObjects {
  private local = new Map<string, File>();
  private memo = new Map<string, Promise<Uint8Array>>();

  constructor(readonly index: AssetIndex) {}

  has(key: string): boolean {
    return key in this.index.objects;
  }

  get localCount(): number {
    return this.local.size;
  }

  /** Accepts the files of a picked `.minecraft/assets` folder (objects/<xx>/<hash>). */
  addLocalFolder(files: Iterable<File>): number {
    let added = 0;
    for (const f of files) {
      const m = /objects[\\/][0-9a-f]{2}[\\/]([0-9a-f]{40})$/.exec(f.webkitRelativePath || f.name);
      if (m) {
        this.local.set(m[1], f);
        added++;
      }
    }
    this.memo.clear();
    return added;
  }

  fetch(key: string): Promise<Uint8Array> {
    const obj = this.index.objects[key];
    if (!obj) return Promise.reject(new Error(`Nicht im Asset-Index: ${key}`));
    let p = this.memo.get(obj.hash);
    if (!p) {
      p = this.load(obj.hash);
      this.memo.set(obj.hash, p);
      p.catch(() => this.memo.delete(obj.hash));
    }
    return p;
  }

  private async load(hash: string): Promise<Uint8Array> {
    const file = this.local.get(hash);
    if (file) return new Uint8Array(await file.arrayBuffer());
    const res = await fetch(`${getResourcesBase()}/${hash.slice(0, 2)}/${hash}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} – Sound-Server nicht erreichbar (Proxy?)`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    // Guard against SPA fallbacks answering 200 with index.html when no proxy is configured.
    if (bytes[0] === 0x3c) throw new Error('Kein Sound-Proxy konfiguriert');
    return bytes;
  }

  /** sounds.json is small and content-addressed, so it is kept in IndexedDB. */
  async soundsJson(): Promise<unknown> {
    const obj = this.index.objects['minecraft/sounds.json'];
    if (!obj) return undefined;
    const key = `soundsjson:${obj.hash}`;
    const hit = await get(key).catch(() => undefined);
    if (hit) return hit;
    const json = JSON.parse(new TextDecoder().decode(await this.fetch('minecraft/sounds.json')));
    await set(key, json).catch(() => {});
    return json;
  }
}
