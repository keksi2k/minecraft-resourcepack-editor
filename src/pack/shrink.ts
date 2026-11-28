import { parseLenientJson } from '../assets/AssetStore';
import { bytesEqual } from './compare';

/**
 * Making a pack smaller without changing how it looks or sounds in the game:
 * - files that are the same as the game's own (the game uses its own anyway),
 * - files the game never reads (system files, image editor projects, backups, archives),
 * - JSON written compactly (spaces, line breaks and comments the game doesn't need),
 * - PNGs compressed better (oxipng; pixels stay exactly the same),
 * - sounds encoded again at a lower Ogg Vorbis quality (this one is audible, so it's optional).
 */

export type ShrinkStep = 'vanilla' | 'junk' | 'json' | 'png' | 'ogg';
export const SHRINK_STEPS: ShrinkStep[] = ['vanilla', 'junk', 'json', 'png', 'ogg'];

export interface ShrinkCandidates {
  /** Files per step, with their current size. */
  files: Record<ShrinkStep, string[]>;
  bytes: Record<ShrinkStep, number>;
}

/** Files Minecraft never reads: left behind by operating systems, image editors and backups. */
export function isJunk(path: string): boolean {
  const name = path.slice(path.lastIndexOf('/') + 1);
  if (/^(\.DS_Store|Thumbs\.db|desktop\.ini|\._.*)$/i.test(name) || path.startsWith('__MACOSX/')) return true;
  // pack-level files (readme, licence, credits) are the author's: only look inside assets/
  if (!path.startsWith('assets/')) return false;
  return /\.(psd|xcf|kra|ora|pdn|ase|aseprite|piskel|bbmodel|blend|bak|tmp|old|orig|zip|rar|7z)$|~$/i.test(name);
}

const decoder = new TextDecoder();

/** Same content as the game's file: equal bytes, or JSON that reads the same. */
export function sameAsVanilla(path: string, mine: Uint8Array, vanilla: Uint8Array | undefined): boolean {
  if (!vanilla) return false;
  if (bytesEqual(mine, vanilla)) return true;
  if (!/\.(json|mcmeta)$/.test(path)) return false;
  try {
    return JSON.stringify(parseLenientJson(decoder.decode(mine))) === JSON.stringify(parseLenientJson(decoder.decode(vanilla)));
  } catch {
    return false;
  }
}

/** JSON files the game reads, written without spaces; undefined when that isn't smaller (or not JSON). */
export function compactJson(path: string, bytes: Uint8Array): Uint8Array | undefined {
  // pack.mcmeta is the pack's face in the game's list: people read it, so it stays as it is
  if (!/\.(json|mcmeta)$/.test(path) || path === 'pack.mcmeta') return undefined;
  try {
    const text = decoder.decode(bytes).replace(/^﻿/, '');
    const out = new TextEncoder().encode(JSON.stringify(parseLenientJson(text)));
    return out.length < bytes.length ? out : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What each step would work on. `files` are the pack's own files (edits included); `vanilla`
 * finds the game's version of a file.
 */
export function shrinkCandidates(files: Map<string, Uint8Array>, vanilla: (path: string) => Uint8Array | undefined): ShrinkCandidates {
  const out: ShrinkCandidates = {
    files: { vanilla: [], junk: [], json: [], png: [], ogg: [] },
    bytes: { vanilla: 0, junk: 0, json: 0, png: 0, ogg: 0 },
  };
  const add = (step: ShrinkStep, path: string, size: number) => {
    out.files[step].push(path);
    out.bytes[step] += size;
  };
  for (const [path, bytes] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    if (path === 'pack.mcmeta' || path === 'pack.png') {
      if (path === 'pack.png') add('png', path, bytes.length);
      continue;
    }
    if (isJunk(path)) add('junk', path, bytes.length);
    else if (sameAsVanilla(path, bytes, vanilla(path))) add('vanilla', path, bytes.length);
    else if (/\.(json|mcmeta)$/.test(path)) add('json', path, bytes.length);
    else if (/\.png$/i.test(path)) add('png', path, bytes.length);
    else if (/\.ogg$/i.test(path)) add('ogg', path, bytes.length);
  }
  return out;
}

export const formatBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`);
