import { parseLenientJson, type AssetStore } from '../assets/AssetStore';
import { normalizeRL } from './resourceLocation';

/**
 * Whether a texture is stitched into a texture atlas. Only atlas textures can be animated by a
 * `.mcmeta`; textures drawn on their own read blur/clamp instead. Since 1.19.3 the atlases are
 * listed in `assets/<ns>/atlases/*.json`; for older versions a folder rule stands in.
 */

const ATLAS = /^assets\/[^/]+\/atlases\/[^/]+\.json$/;
const TEXTURE = /^assets\/([^/]+)\/textures\/(.+)\.png$/;
/** Pre-1.19.3 rule: these folders are drawn on their own. */
const STANDALONE = /^(entity|environment|misc|colormap|font|effect|models|gui\/(?!sprites\/))/;
const decoder = new TextDecoder();

interface Index {
  dirs: string[];
  singles: Set<string>;
}

const cache = new WeakMap<AssetStore, { changes: number; index: Index | undefined }>();

function buildIndex(store: AssetStore): Index | undefined {
  const files = store.list('assets/').filter((p) => ATLAS.test(p));
  if (!files.length) return undefined;
  const dirs = new Set<string>();
  const singles = new Set<string>();
  for (const f of files) {
    let sources: any[] = [];
    try {
      const json = parseLenientJson(decoder.decode(store.get(f)!)) as { sources?: unknown };
      sources = Array.isArray(json?.sources) ? json.sources : [];
    } catch {
      continue;
    }
    for (const s of sources) {
      const type = typeof s?.type === 'string' ? s.type.replace(/^minecraft:/, '') : '';
      if (type === 'directory' && typeof s.source === 'string') dirs.add(s.source.replace(/\/$/, ''));
      else if (type === 'single' && typeof s.resource === 'string') singles.add(normalizeRL(s.resource));
    }
  }
  return { dirs: [...dirs], singles };
}

/** True if the texture at `path` (assets/<ns>/textures/….png) is part of an atlas. */
export function isAtlasTexture(store: AssetStore, path: string): boolean {
  const m = TEXTURE.exec(path);
  if (!m) return false;
  let entry = cache.get(store);
  if (!entry || entry.changes !== store.changes) cache.set(store, (entry = { changes: store.changes, index: buildIndex(store) }));
  const rel = m[2];
  if (!entry.index) return !STANDALONE.test(rel);
  return entry.index.singles.has(`${m[1]}:${rel}`) || entry.index.dirs.some((d) => rel.startsWith(`${d}/`));
}
