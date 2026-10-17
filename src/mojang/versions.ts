import { fetchJsonCached } from './fetchUtil';

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

export interface VersionEntry {
  id: string;
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
  url: string;
  releaseTime: string;
}

export interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: VersionEntry[];
}

export interface VersionJson {
  id: string;
  assetIndex: { id: string; url: string };
  downloads: { client: { url: string; size: number; sha1: string } };
}

export async function fetchManifest(): Promise<VersionManifest> {
  // The manifest changes with every release, so it is never cached.
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) throw new Error(`Versionsliste nicht erreichbar (HTTP ${res.status})`);
  return res.json();
}

export function fetchVersionJson(entry: VersionEntry): Promise<VersionJson> {
  return fetchJsonCached<VersionJson>(entry.url);
}

/** Newest release per resource pack format. Formats in between belong to snapshots. */
const FORMAT_TO_RELEASE: [number, string][] = [
  [1, '1.8.9'],
  [2, '1.10.2'],
  [3, '1.12.2'],
  [4, '1.14.4'],
  [5, '1.16.1'],
  [6, '1.16.5'],
  [7, '1.17.1'],
  [8, '1.18.2'],
  [9, '1.19.2'],
  [12, '1.19.3'],
  [13, '1.19.4'],
  [15, '1.20.1'],
  [18, '1.20.2'],
  [22, '1.20.4'],
  [32, '1.20.6'],
  [34, '1.21.1'],
  [42, '1.21.3'],
  [46, '1.21.4'],
  [55, '1.21.5'],
  [63, '1.21.6'],
  [64, '1.21.8'],
  [69, '1.21.10'],
];

/** Suggests a game version for a pack format; unknown/newer formats map to the latest release. */
export function suggestVersion(packFormat: number | undefined, manifest: VersionManifest): string {
  const known = new Set(manifest.versions.map((v) => v.id));
  if (packFormat !== undefined) {
    const hit = FORMAT_TO_RELEASE.find(([f]) => f >= packFormat);
    if (hit && known.has(hit[1])) return hit[1];
  }
  return manifest.latest.release;
}
