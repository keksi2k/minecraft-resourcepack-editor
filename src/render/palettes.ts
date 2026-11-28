import type { Pixels, RGBA } from './pixelEdit';

/**
 * Colour palettes for the texture editor: read from the usual palette files or fetched from Lospec,
 * kept in the browser, and used to snap a texture to its colours.
 */

export interface Palette {
  name: string;
  /** opaque colours as #rrggbb */
  colors: string[];
  /** where it came from, e.g. a Lospec page */
  source?: string;
}

const STORAGE = 'texturePalettes';
const MAX_COLORS = 256;

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('')}`;
const unique = (list: string[]) => [...new Set(list.map((c) => c.toLowerCase()))].slice(0, MAX_COLORS);

/**
 * The colours of a palette file. Understands Lospec/paint.net/GIMP/JASC formats: `.hex` (one
 * colour per line), `.txt` (paint.net, AARRGGBB), `.gpl` (GIMP), `.pal` (JASC) and Lospec's `.json`.
 */
export function parsePalette(text: string): string[] {
  const t = text.replace(/^﻿/, '').trim();
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t);
      if (Array.isArray(j.colors)) return unique(j.colors.filter((c: unknown) => typeof c === 'string' && /^#?[0-9a-f]{6}$/i.test(c)).map((c: string) => `#${c.replace('#', '')}`));
    } catch {
      return [];
    }
  }
  const lines = t.split(/\r?\n/).map((l) => l.trim());
  if (lines[0] === 'GIMP Palette') {
    const out: string[] = [];
    for (const l of lines.slice(1)) {
      const m = /^(\d+)\s+(\d+)\s+(\d+)/.exec(l);
      if (m) out.push(hex(+m[1], +m[2], +m[3]));
    }
    return unique(out);
  }
  if (lines[0] === 'JASC-PAL') {
    const out: string[] = [];
    for (const l of lines.slice(3)) {
      const m = /^(\d+)\s+(\d+)\s+(\d+)/.exec(l);
      if (m) out.push(hex(+m[1], +m[2], +m[3]));
    }
    return unique(out);
  }
  const out: string[] = [];
  for (const l of lines) {
    if (!l || l.startsWith(';') || l.startsWith('//')) continue;
    // paint.net writes AARRGGBB; everything else RRGGBB, with or without #
    const m = /^#?([0-9a-f]{8}|[0-9a-f]{6})\b/i.exec(l);
    if (!m) continue;
    out.push(`#${(m[1].length === 8 ? m[1].slice(2) : m[1]).toLowerCase()}`);
  }
  return unique(out);
}

/** The colours of a palette image (Lospec offers palettes as PNG strips), in reading order. */
export function paletteFromImage(p: Pixels): string[] {
  const out: string[] = [];
  for (let i = 0; i < p.data.length; i += 4) if (p.data[i + 3] > 0) out.push(hex(p.data[i], p.data[i + 1], p.data[i + 2]));
  return unique(out);
}

/** The palette's name in a Lospec link (`lospec.com/palette-list/pico-8`) or a bare name. */
export function lospecSlug(input: string): string | undefined {
  const s = input.trim();
  const m = /lospec\.com\/palette-list\/([a-z0-9-]+)/i.exec(s);
  const slug = (m ? m[1] : s).toLowerCase().replace(/\.(json|hex|png|gpl|pal|txt)$/, '').replace(/\s+/g, '-');
  return /^[a-z0-9][a-z0-9-]*$/.test(slug) ? slug : undefined;
}

/** Fetches a palette from Lospec (it allows that from any page). */
export async function fetchLospec(slug: string): Promise<Palette> {
  const res = await fetch(`https://lospec.com/palette-list/${encodeURIComponent(slug)}.json`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  const colors = parsePalette(JSON.stringify(j));
  if (!colors.length) throw new Error('no colours');
  return { name: typeof j.name === 'string' && j.name ? j.name : slug, colors, source: `https://lospec.com/palette-list/${slug}` };
}

export function loadPalettes(): Palette[] {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE) ?? '[]');
    return Array.isArray(list) ? list.filter((p) => p && typeof p.name === 'string' && Array.isArray(p.colors)) : [];
  } catch {
    return [];
  }
}

export function savePalettes(list: Palette[]): void {
  try {
    localStorage.setItem(STORAGE, JSON.stringify(list));
  } catch {
    // storage full or blocked: the palettes just aren't kept
  }
}

const rgb = (c: string): [number, number, number] => {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** The palette colour closest to (r, g, b), weighted the way eyes see differences. */
export function nearest(colors: [number, number, number][], r: number, g: number, b: number): [number, number, number] {
  let best = colors[0];
  let bestD = Infinity;
  for (const c of colors) {
    const rm = (c[0] + r) / 2;
    const dr = c[0] - r;
    const dg = c[1] - g;
    const db = c[2] - b;
    const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** Replaces every visible pixel with the nearest palette colour (alpha stays); returns how many changed. */
export function snapToPalette(p: Pixels, colors: string[], mask?: Uint8Array): number {
  if (!colors.length) return 0;
  const list = colors.map(rgb);
  const cache = new Map<number, [number, number, number]>();
  const d = p.data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0 || (mask && !mask[i / 4])) continue;
    const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
    let c = cache.get(key);
    if (!c) cache.set(key, (c = nearest(list, d[i], d[i + 1], d[i + 2])));
    if (c[0] === d[i] && c[1] === d[i + 1] && c[2] === d[i + 2]) continue;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    n++;
  }
  return n;
}

/** A palette colour as the editor's RGBA. */
export const paletteColor = (c: string): RGBA => [...rgb(c), 255];
