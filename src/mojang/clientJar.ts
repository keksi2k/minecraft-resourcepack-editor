import { get, set } from 'idb-keyval';
import JSZip from 'jszip';
import { t } from '../i18n';
import { fetchBytes, type Progress } from './fetchUtil';
import type { VersionJson } from './versions';

export interface VanillaAssets {
  versionId: string;
  files: Map<string, Uint8Array>;
  /** Resource pack format of this game version, read from the jar's version.json. */
  packFormat?: number;
}

interface CachedVanilla {
  entries: [string, Uint8Array][];
  packFormat?: number;
}

const CACHE_VERSION = 1;
const KEEP = /^assets\/[^/]+\/(textures|models|items)\/.+\.(png|json|mcmeta)$|^assets\/minecraft\/lang\/en_us\.json$/;

export type LoadStep = (status: string, progress?: number) => void;

export async function loadVanillaAssets(version: VersionJson, onStep: LoadStep): Promise<VanillaAssets> {
  const cacheKey = `vanilla:v${CACHE_VERSION}:${version.id}`;
  onStep(t('load.statusCache', { version: version.id }));
  const cached = await get<CachedVanilla>(cacheKey).catch(() => undefined);
  if (cached) return { versionId: version.id, files: new Map(cached.entries), packFormat: cached.packFormat };

  const mb = (n: number) => (n / 1048576).toFixed(1);
  const total = version.downloads.client.size;
  const onProgress: Progress = (loaded) =>
    onStep(t('load.statusDownload', { version: version.id, loaded: mb(loaded), total: mb(total) }), loaded / total);
  const jarBytes = await fetchBytes(version.downloads.client.url, onProgress);

  onStep(t('load.statusExtract'));
  const zip = await JSZip.loadAsync(jarBytes);
  const files = new Map<string, Uint8Array>();
  const wanted = Object.values(zip.files).filter((f) => !f.dir && KEEP.test(f.name));
  let done = 0;
  await Promise.all(
    wanted.map(async (f) => {
      files.set(f.name, await f.async('uint8array'));
      if (++done % 500 === 0) onStep(t('load.statusExtractProgress', { done, total: wanted.length }), done / wanted.length);
    }),
  );

  let packFormat: number | undefined;
  const versionInfo = zip.file('version.json');
  if (versionInfo) {
    const pv = JSON.parse(await versionInfo.async('string')).pack_version;
    packFormat = typeof pv === 'number' ? pv : (pv?.resource_major ?? pv?.resource);
  }

  onStep(t('load.statusSaveCache'));
  await navigator.storage?.persist?.().catch(() => false);
  await set(cacheKey, { entries: [...files], packFormat } satisfies CachedVanilla).catch((e) =>
    console.warn('Could not cache vanilla assets', e),
  );
  return { versionId: version.id, files, packFormat };
}
