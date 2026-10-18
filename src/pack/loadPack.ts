import JSZip from 'jszip';
import { parseLenientJson } from '../assets/AssetStore';

export interface PackMeta {
  description: string;
  /** pack_format, or min_format for packs using the 1.21.9+ min/max fields. */
  format?: number;
  raw: unknown;
}

export interface LoadedPack {
  name: string;
  files: Map<string, Uint8Array>;
  meta?: PackMeta;
  /** The original ZIP, kept for restoring the session after a reload. */
  source?: Blob;
}

/** Packs are often zipped with an enclosing folder; find the folder that holds pack.mcmeta / assets. */
export function findPackRoot(paths: string[]): string {
  const candidates = paths
    .map((p) => /^((?:.*?\/)?)(pack\.mcmeta$|assets\/)/.exec(p)?.[1])
    .filter((p): p is string => p !== undefined);
  return candidates.sort((a, b) => a.length - b.length)[0] ?? '';
}

/** Flattens a JSON text component into plain text, dropping § formatting codes. */
export function textComponentToString(c: unknown): string {
  if (typeof c === 'string') return c.replace(/§./g, '');
  if (typeof c === 'number' || typeof c === 'boolean') return String(c);
  if (Array.isArray(c)) return c.map(textComponentToString).join('');
  if (c && typeof c === 'object') {
    const o = c as Record<string, unknown>;
    return textComponentToString(o.text ?? o.translate ?? '') + textComponentToString(o.extra ?? '');
  }
  return '';
}

const formatNumber = (v: unknown): number | undefined =>
  typeof v === 'number' ? v : Array.isArray(v) && typeof v[0] === 'number' ? v[0] : undefined;

export function parsePackMeta(bytes: Uint8Array | undefined): PackMeta | undefined {
  if (!bytes) return undefined;
  try {
    const raw = parseLenientJson(new TextDecoder().decode(bytes)) as any;
    const pack = raw?.pack ?? {};
    return {
      description: textComponentToString(pack.description ?? ''),
      format: formatNumber(pack.pack_format) ?? formatNumber(pack.min_format),
      raw,
    };
  } catch {
    return undefined;
  }
}

export async function loadPackZip(file: Blob, name = file instanceof File ? file.name : 'pack'): Promise<LoadedPack> {
  const zip = await JSZip.loadAsync(file);
  const entries = Object.values(zip.files).filter((f) => !f.dir && !f.name.startsWith('__MACOSX/'));
  const root = findPackRoot(entries.map((e) => e.name));
  const files = new Map<string, Uint8Array>();
  await Promise.all(
    entries
      .filter((e) => e.name.startsWith(root))
      .map(async (e) => files.set(e.name.slice(root.length), await e.async('uint8array'))),
  );
  return { name: name.replace(/\.zip$/i, ''), files, meta: parsePackMeta(files.get('pack.mcmeta')), source: file };
}
