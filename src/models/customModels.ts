import { stripNs } from './itemDefinition';
import { parseRL } from './resourceLocation';
import { slugify } from './customNames';

/**
 * Own 3D models for items: a Blockbench project (.bbmodel, "Java Block/Item" format, textures
 * inside) or a Java model JSON with its PNGs is turned into a model with textures in the pack,
 * which then replaces the item, shows when it's renamed, or shows for a `custom_model_data` string
 * (1.21.4+, `/give @s stick[custom_model_data={strings:["name"]}]`).
 */

type Json = Record<string, any>;

export interface ImportedTexture {
  /** The texture's key in the model (`0`, `layer0`, `particle` …). */
  key: string;
  /** Name it came with, for the file name. */
  name: string;
  png?: Uint8Array;
  /** A texture the model refers to that already exists (vanilla), kept as it is. */
  ref?: string;
}

export interface ImportedModel {
  model: Json;
  textures: ImportedTexture[];
  warnings: ImportWarning[];
}

export type ImportWarning =
  | { code: 'mesh'; name: string }
  | { code: 'rotation'; name: string; from: number; to: number }
  | { code: 'twoAxes'; name: string }
  | { code: 'missingTexture'; name: string }
  | { code: 'format'; name: string };

const ANGLES = [-45, -22.5, 0, 22.5, 45];
const nearestAngle = (a: number) => ANGLES.reduce((best, x) => (Math.abs(x - a) < Math.abs(best - a) ? x : best), 0);

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** A Blockbench project in a Java model's terms. */
export function bbmodelToJava(bb: Json): ImportedModel {
  const warnings: ImportWarning[] = [];
  const format = String(bb?.meta?.model_format ?? '');
  if (format && !/java|free|generic/.test(format)) warnings.push({ code: 'format', name: format });
  const res = { width: Number(bb?.resolution?.width) || 16, height: Number(bb?.resolution?.height) || 16 };
  const texList: Json[] = Array.isArray(bb?.textures) ? bb.textures : [];
  const textures: ImportedTexture[] = texList.map((tex, i) => {
    const m = typeof tex?.source === 'string' ? /^data:image\/png;base64,(.+)$/.exec(tex.source) : null;
    const name = String(tex?.name ?? `texture_${i}`).replace(/\.png$/i, '');
    if (!m) warnings.push({ code: 'missingTexture', name });
    return { key: String(i), name, png: m ? base64ToBytes(m[1]) : undefined };
  });
  // a texture's own size (per-texture UV size in newer Blockbench), else the project's resolution
  const sizeOf = (i: number) => ({ w: Number(texList[i]?.uv_width) || res.width, h: Number(texList[i]?.uv_height) || res.height });

  const elements: Json[] = [];
  for (const el of Array.isArray(bb?.elements) ? bb.elements : []) {
    const name = String(el?.name ?? 'cube');
    if (el?.type && el.type !== 'cube') {
      warnings.push({ code: 'mesh', name });
      continue;
    }
    const out: Json = { from: el.from.map(round), to: el.to.map(round) };
    if (name) out.name = name;
    const rot: number[] = Array.isArray(el.rotation) ? el.rotation.map(Number) : [0, 0, 0];
    const axes = rot.map((a, i) => [a, i] as const).filter(([a]) => a !== 0);
    if (axes.length > 1) warnings.push({ code: 'twoAxes', name });
    if (axes.length) {
      const [angle, i] = axes[0];
      const snapped = nearestAngle(angle);
      if (snapped !== angle) warnings.push({ code: 'rotation', name, from: angle, to: snapped });
      out.rotation = { angle: snapped, axis: 'xyz'[i], origin: (el.origin ?? [8, 8, 8]).map(round) };
      if (el.rescale) out.rotation.rescale = true;
    }
    if (el.shade === false) out.shade = false;
    const faces: Json = {};
    for (const [dir, f] of Object.entries<any>(el.faces ?? {})) {
      if (!f || f.texture === null || f.texture === undefined) continue;
      const i = Number(f.texture);
      const { w, h } = sizeOf(i);
      const face: Json = { uv: [0, 1, 2, 3].map((k) => round((Number(f.uv?.[k]) * 16) / (k % 2 ? h : w))), texture: `#${i}` };
      if (f.rotation) face.rotation = f.rotation;
      if (f.tint !== undefined && f.tint >= 0) face.tintindex = f.tint;
      if (f.cullface) face.cullface = f.cullface;
      faces[dir] = face;
    }
    out.faces = faces;
    elements.push(out);
  }
  const model: Json = { textures: Object.fromEntries(textures.map((t) => [t.key, `#${t.key}`])), elements };
  if (textures.length) model.textures.particle = '#0';
  if (bb?.display && typeof bb.display === 'object') model.display = bb.display;
  if (bb?.front_gui_light === true || bb?.meta?.front_gui_light) model.gui_light = 'front';
  if (bb?.ambientocclusion === false) model.ambientocclusion = false;
  return { model, textures, warnings };
}

/**
 * A Java model JSON with the PNGs picked with it: textures are matched by file name; one that
 * matches no PNG but exists (`has`) is kept, otherwise it's reported missing.
 */
export function javaModelImport(model: Json, pngs: Map<string, Uint8Array>, has: (textureId: string) => boolean): ImportedModel {
  const warnings: ImportWarning[] = [];
  const textures: ImportedTexture[] = [];
  const byName = new Map([...pngs].map(([name, bytes]) => [name.toLowerCase().replace(/\.png$/, ''), bytes]));
  const next: Json = { ...model, textures: { ...(model.textures ?? {}) } };
  for (const [key, value] of Object.entries<any>(next.textures)) {
    if (typeof value !== 'string' || value.startsWith('#')) continue;
    const name = value
      .split('/')
      .pop()!
      .replace(/\.png$/, '');
    const png =
      byName.get(name.toLowerCase()) ??
      (pngs.size === 1 && Object.keys(next.textures).filter((k) => !String(next.textures[k]).startsWith('#')).length === 1 ? [...pngs.values()][0] : undefined);
    if (png) {
      textures.push({ key, name, png });
      next.textures[key] = `#${key}`;
    } else if (has(value.includes(':') ? value : `minecraft:${value}`)) {
      textures.push({ key, name, ref: value });
    } else {
      warnings.push({ code: 'missingTexture', name: value });
    }
  }
  return { model: next, textures, warnings };
}

/** Puts the model's textures under `textureBase` (… `/<name>`) and returns the final JSON. */
export function placeTextures(imported: ImportedModel, textureBase: string): { model: Json; files: [textureId: string, png: Uint8Array][] } {
  const files: [string, Uint8Array][] = [];
  const used = new Set<string>();
  const ids = new Map<string, string>();
  for (const t of imported.textures) {
    if (t.ref) {
      ids.set(t.key, t.ref);
      continue;
    }
    if (!t.png) continue;
    let slug = slugify(t.name);
    for (let i = 2; used.has(slug); i++) slug = `${slugify(t.name)}_${i}`;
    used.add(slug);
    const id = `${textureBase}/${slug}`;
    ids.set(t.key, id);
    files.push([id, t.png]);
  }
  const textures: Json = {};
  for (const [key, value] of Object.entries<any>(imported.model.textures ?? {})) {
    const ref = typeof value === 'string' && value.startsWith('#') ? value.slice(1) : undefined;
    textures[key] = ref !== undefined && ids.has(ref) ? ids.get(ref) : value;
  }
  return { model: { ...imported.model, textures }, files };
}

/** Model id for an imported model of an item, e.g. `minecraft:item/custom/diamond_sword/ruby_blade`. */
export function customModelId(itemId: string, name: string, taken: (id: string) => boolean): string {
  const { ns, path } = parseRL(itemId);
  const base = `${ns}:item/custom/${path}/${slugify(name)}`;
  let id = base;
  for (let i = 2; taken(id); i++) id = `${base}_${i}`;
  return id;
}

/* custom_model_data cases ------------------------------------------------------------------- */

export interface CmdCase {
  /** The string that selects it. */
  value: string;
  model: string;
}

const isCmdSelect = (node: Json | undefined) => !!node && stripNs(node.type) === 'select' && stripNs(node.property) === 'custom_model_data';

/** The `custom_model_data` cases of an item definition (a select around the item's model). */
export function readCmdCases(def: Json | undefined): { base: Json | undefined; cases: CmdCase[]; other: Json[] } {
  const model = def?.model;
  if (!isCmdSelect(model)) return { base: model, cases: [], other: [] };
  const cases: CmdCase[] = [];
  const other: Json[] = [];
  for (const c of model.cases ?? []) {
    const values = [c?.when].flat().filter((v): v is string => typeof v === 'string');
    if (values.length === 1 && stripNs(c.model?.type) === 'model' && typeof c.model.model === 'string' && Object.keys(c.model).length === 2)
      cases.push({ value: values[0], model: c.model.model });
    else other.push(c);
  }
  return { base: model.fallback, cases, other };
}

export function writeCmdCases(def: Json | undefined, base: Json | undefined, cases: CmdCase[], other: Json[] = []): Json {
  const all = [...cases.map((c) => ({ when: c.value, model: { type: 'minecraft:model', model: c.model } })), ...other];
  return {
    ...def,
    model: all.length ? { type: 'minecraft:select', property: 'minecraft:custom_model_data', cases: all, ...(base ? { fallback: base } : {}) } : base,
  };
}

/** The command that gives an item with this custom_model_data string. */
export const giveCommand = (itemId: string, value: string) => `/give @s ${itemId}[minecraft:custom_model_data={strings:[${JSON.stringify(value)}]}]`;
