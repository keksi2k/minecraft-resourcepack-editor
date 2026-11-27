import { parseLenientJson, type AssetStore } from '../../assets/AssetStore';
import type { Pixels } from '../../render/pixelEdit';
import { parsePackMeta } from '../loadPack';
import { convertOverrides } from './itemOverrides';
import { isWholeCopy, sliceImage, SLICE_FORMATS, type SliceFile, type SliceInput, type SliceOutput } from './slices';

/**
 * Brings a pack made for an older game version up to the loaded one. Everything the game changed
 * that can be converted without guessing is replayed in version order on a copy of the pack's
 * files:
 *
 * - textures the game moved or renamed (data from the client jars, see renames.json),
 * - old combined textures cut into separate sprites (Mojang's slicer, see slices.json),
 * - `.lang` files turned into `.json` (1.13),
 * - texture references in the pack's models following the renames,
 * - `overrides` in item models turned into item definitions (1.21.4),
 * - pack.mcmeta's format.
 *
 * The result is a set of file changes, applied in one undoable step. Textures whose layout
 * changed can't be converted; they are listed so they can be redrawn.
 */

export type GroupId = 'renames' | 'slices' | 'lang' | 'refs' | 'items' | 'format';
export const GROUPS: GroupId[] = ['renames', 'slices', 'lang', 'refs', 'items', 'format'];

export interface RenameStep {
  version: string;
  format: number;
  renames: [string, string][];
  dropped: string[];
}

export interface UpgradeData {
  renames: RenameStep[];
  slices: SliceFile;
  /** Old translation keys (1.12 and before) → new ones. */
  langKeys?: Record<string, string>;
}

export interface UpgradeEntry {
  from: string;
  to?: string[];
  /** Extra information: the game version, unknown predicates … */
  note?: string;
}

export interface UpgradePlan {
  /** The format the pack declares (undefined: none). */
  packFormat?: number;
  groups: Record<GroupId, UpgradeEntry[]>;
  changes: Map<string, Uint8Array | null>;
  /** Pack textures whose layout changed: they can't be converted and need redrawing. */
  redraw: { path: string; version: string }[];
}

export interface Codec {
  decode: (b: Uint8Array) => Promise<Pixels>;
  encode: (p: Pixels) => Promise<Uint8Array>;
}

const T = 'assets/minecraft/textures/';
const tex = (id: string) => `${T}${id}.png`;
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const json = (v: unknown) => encoder.encode(`${JSON.stringify(v, null, 2)}\n`);

/** 1.13.2 < 1.14 < 1.14.4 < 26.2 */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

const sameBytes = (a: Uint8Array | undefined, b: Uint8Array | undefined) => !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);

function parse(bytes: Uint8Array | undefined): any {
  if (!bytes) return undefined;
  try {
    return parseLenientJson(decoder.decode(bytes));
  } catch {
    return undefined;
  }
}

/** `key=value` lines of a pre-1.13 `.lang` file. */
export function parseLang(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line.trim() || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq > 0) out[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return out;
}

/** Applies renames (a → b) to a map of texture ids that may point at `a`. */
function composeInto(map: Map<string, string>, renames: [string, string][]) {
  const step = new Map(renames);
  for (const [k, v] of map) if (step.has(v)) map.set(k, step.get(v)!);
  for (const [a, b] of renames) if (!map.has(a)) map.set(a, b);
}

/** Old `blocks/` and `items/` folders (before 1.13) for textures no rename covers. */
const legacyFolder = (id: string) => id.replace(/^blocks\//, 'block/').replace(/^items\//, 'item/');

export async function planUpgrade(
  store: AssetStore,
  gameFormat: number,
  data: UpgradeData,
  codec: Codec,
  enabled: ReadonlySet<GroupId> = new Set(GROUPS),
): Promise<UpgradePlan> {
  // the pack's own files as they are now (overlay folders are left alone: their paths don't start with assets/)
  const original = new Map(store.pack);
  for (const [path, bytes] of store.edits) {
    if (bytes) original.set(path, bytes);
    else original.delete(path);
  }
  const files = new Map(original);
  const vanilla = store.vanilla;
  const packFormat = parsePackMeta(files.get('pack.mcmeta'))?.format;
  /** The pack predates a change that came with `format`. */
  const older = (format: number) => packFormat === undefined || packFormat < format;
  const groups: Record<GroupId, UpgradeEntry[]> = { renames: [], slices: [], lang: [], refs: [], items: [], format: [] };

  // where every texture id ends up after all the game's renames, to know which sprites are still read
  const everRenamed = new Map<string, string>();
  for (const s of data.renames) composeInto(everRenamed, s.renames);
  const stillRead = (path: string) => {
    if (vanilla.has(path)) return true;
    const id = path.startsWith(T) && path.endsWith('.png') ? path.slice(T.length, -4) : undefined;
    return !!id && everRenamed.has(id) && vanilla.has(tex(everRenamed.get(id)!));
  };
  // texture references: every rename the pack is older than, whether the pack has the texture or not
  const refRenames = new Map<string, string>();

  const move = (from: string, to: string) => {
    files.set(to, files.get(from)!);
    files.delete(from);
    const meta = files.get(`${from}.mcmeta`);
    if (meta && !files.has(`${to}.mcmeta`)) files.set(`${to}.mcmeta`, meta);
    files.delete(`${from}.mcmeta`);
  };

  const renameStep = (step: RenameStep) => {
    if (!older(step.format)) return;
    composeInto(refRenames, step.renames);
    if (!enabled.has('renames')) return;
    for (const [a, b] of step.renames) {
      const from = tex(a);
      const to = tex(b);
      // without a declared format, only files the game doesn't read any more count as old
      if (!files.has(from) || files.has(to) || (packFormat === undefined && vanilla.has(from))) continue;
      move(from, to);
      groups.renames.push({ from, to: [to], note: step.version });
    }
  };

  const legacyFolders = () => {
    if (!older(4)) return;
    if (enabled.has('renames')) {
      for (const path of [...files.keys()]) {
        const m = /^assets\/minecraft\/textures\/((?:blocks|items)\/.+)\.png$/.exec(path);
        const to = m && tex(legacyFolder(m[1]));
        if (!to || files.has(to)) continue;
        move(path, to);
        groups.renames.push({ from: path, to: [to], note: '1.13' });
      }
    }
    if (enabled.has('lang')) {
      for (const path of [...files.keys()]) {
        const m = /^(assets\/[^/]+\/lang\/)([^/]+)\.lang$/.exec(path);
        if (!m) continue;
        const to = `${m[1]}${m[2].toLowerCase()}.json`;
        const old = parseLang(decoder.decode(files.get(path)!));
        const entries = Object.entries(old).map(([k, v]) => [data.langKeys?.[k] ?? k, v]);
        const merged = { ...Object.fromEntries(entries), ...(parse(files.get(to)) ?? {}) };
        files.set(to, json(merged));
        files.delete(path);
        const known = entries.filter(([k], i) => k !== Object.keys(old)[i]).length;
        groups.lang.push({ from: path, to: [to], note: `${known}/${entries.length}` });
      }
    }
  };

  const sliceStage = async (stage: string, inputs: SliceInput[]) => {
    if (!enabled.has('slices') || !older(SLICE_FORMATS[stage])) return;
    // the slicer lists some inputs more than once; their outputs belong together
    const byInput = new Map<string, SliceOutput[]>();
    for (const i of inputs) byInput.set(i.input, [...(byInput.get(i.input) ?? []), ...i.outputs]);
    for (const [input, outputs] of byInput) {
      const bytes = files.get(input);
      if (!bytes) continue;
      const fresh = outputs.filter((o) => o.path !== input);
      // a pack without a format that already has the new sprites was made for the new version
      if (!fresh.length || (packFormat === undefined && fresh.some((o) => files.has(o.path)))) continue;
      const todo = outputs.filter((o) => (o.path === input || !files.has(o.path)) && stillRead(o.path) && !(o.path === input && isWholeCopy(o)));
      if (!todo.length) continue;
      let image: Pixels | undefined;
      try {
        image = await codec.decode(bytes);
      } catch (e) {
        console.warn(`Could not read ${input}; left as it is`, e);
        continue;
      }
      const meta = files.get(`${input}.mcmeta`);
      const written: string[] = [];
      for (const o of todo) {
        files.set(o.path, isWholeCopy(o) ? bytes : await codec.encode(sliceImage(image, o)));
        if (o.path !== input) {
          if (meta) files.set(`${o.path}.mcmeta`, meta);
          else if (o.meta !== undefined) files.set(`${o.path}.mcmeta`, json(o.meta));
        }
        written.push(o.path);
      }
      // the old combined texture isn't read by the game any more
      if (!stillRead(input) && !outputs.some((o) => o.path === input)) {
        files.delete(input);
        files.delete(`${input}.mcmeta`);
      }
      groups.slices.push({ from: input, to: written.filter((p) => p !== input), note: stage });
    }
  };

  const itemDefinitions = () => {
    if (!enabled.has('items') || !older(46)) return;
    for (const path of [...files.keys()]) {
      const m = /^assets\/minecraft\/models\/item\/([^/]+)\.json$/.exec(path);
      if (!m) continue;
      const overrides = parse(files.get(path))?.overrides;
      const defPath = `assets/minecraft/items/${m[1]}.json`;
      const vanillaDef = parse(vanilla.get(defPath));
      if (!Array.isArray(overrides) || !overrides.length || files.has(defPath) || !vanillaDef?.model) continue;
      const { model, unknown } = convertOverrides(overrides, vanillaDef.model, m[1]);
      if (model === vanillaDef.model) continue;
      files.set(defPath, json({ ...vanillaDef, model }));
      groups.items.push({ from: path, to: [defPath], note: unknown.length ? unknown.join(', ') : undefined });
    }
  };

  // the game's changes in the order they happened
  type Event = { version: string; run: () => void | Promise<void> };
  const events: Event[] = [
    ...data.renames.map((s) => ({ version: s.version, run: () => renameStep(s) })),
    ...Object.entries(data.slices.stages).map(([stage, inputs]) => ({ version: stage, run: () => sliceStage(stage, inputs) })),
    // after the flattening's own renames, before the 1.14 slicer
    { version: '1.13.3', run: legacyFolders },
    { version: '1.21.4', run: itemDefinitions },
  ];
  events.sort((a, b) => compareVersions(a.version, b.version));
  for (const e of events) await e.run();

  // models follow the renamed textures (also vanilla ones the pack doesn't replace)
  if (enabled.has('refs') && refRenames.size) {
    for (const [path, bytes] of [...files]) {
      if (!/^assets\/[^/]+\/models\/.+\.json$/.test(path)) continue;
      const model = parse(bytes);
      if (!model?.textures || typeof model.textures !== 'object') continue;
      let changed = 0;
      const textures = Object.fromEntries(
        Object.entries<unknown>(model.textures).map(([k, v]) => {
          if (typeof v !== 'string' || v.startsWith('#')) return [k, v];
          const ns = v.includes(':') ? v.slice(0, v.indexOf(':')) : 'minecraft';
          if (ns !== 'minecraft') return [k, v];
          const id = v.slice(v.indexOf(':') + 1);
          const next = refRenames.get(id) ?? (older(4) ? legacyFolder(id) : id);
          if (next === id) return [k, v];
          changed++;
          return [k, v.includes(':') ? `minecraft:${next}` : next];
        }),
      );
      if (!changed) continue;
      files.set(path, json({ ...model, textures }));
      groups.refs.push({ from: path, note: String(changed) });
    }
  }

  // pack.mcmeta: the loaded game's format
  if (enabled.has('format') && packFormat !== gameFormat) {
    const raw = parse(files.get('pack.mcmeta')) ?? {};
    const pack = { ...(raw.pack ?? {}) };
    pack.pack_format = gameFormat;
    // 1.21.9 (format 65) reads min/max_format; older versions ignore them
    if (gameFormat >= 65 || pack.min_format !== undefined) {
      pack.min_format = gameFormat;
      pack.max_format = gameFormat;
    }
    delete pack.supported_formats;
    if (pack.description === undefined) pack.description = '';
    files.set('pack.mcmeta', json({ ...raw, pack }));
    groups.format.push({ from: 'pack.mcmeta', note: `${packFormat ?? '?'} → ${gameFormat}` });
  }

  const changes = new Map<string, Uint8Array | null>();
  for (const [path, bytes] of files) if (!sameBytes(original.get(path), bytes)) changes.set(path, bytes);
  for (const path of original.keys()) if (!files.has(path)) changes.set(path, null);

  // textures the game dropped or redrew in another layout, still in the pack
  const redraw: UpgradePlan['redraw'] = [];
  for (const step of data.renames) {
    if (!older(step.format)) continue;
    for (const id of step.dropped) {
      const path = tex(id);
      if (files.has(path) && !stillRead(path)) redraw.push({ path, version: step.version });
    }
  }
  return { packFormat, groups, changes, redraw };
}
