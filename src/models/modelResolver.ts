import { modelPath, normalizeRL } from './resourceLocation';

export type FaceDir = 'north' | 'south' | 'east' | 'west' | 'up' | 'down';
export type Vec3 = [number, number, number];

export interface ModelFace {
  texture: string;
  uv?: [number, number, number, number];
  rotation?: number;
  tintindex?: number;
}

export interface ModelElement {
  from: Vec3;
  to: Vec3;
  rotation?: { origin: Vec3; axis?: 'x' | 'y' | 'z'; angle?: number; x?: number; y?: number; z?: number; rescale?: boolean };
  faces: Partial<Record<FaceDir, ModelFace>>;
  shade?: boolean;
}

export interface DisplayTransform {
  rotation?: Vec3;
  translation?: Vec3;
  scale?: Vec3;
}

export type DisplayContext =
  | 'gui'
  | 'ground'
  | 'fixed'
  | 'head'
  | 'thirdperson_righthand'
  | 'firstperson_righthand'
  | 'none';

export interface ModelJson {
  parent?: string;
  textures?: Record<string, string | { sprite: string }>;
  elements?: ModelElement[];
  display?: Record<string, DisplayTransform>;
  gui_light?: 'front' | 'side';
}

export interface ResolvedModel {
  id: string;
  /** The model itself followed by its parents; model files that exist in the store. */
  chain: string[];
  kind: 'generated' | 'elements' | 'builtin' | 'missing';
  /** Texture variables, each resolved to a texture id (or left as an unresolved `#ref`). */
  textures: Record<string, string>;
  elements: ModelElement[];
  /** Texture ids of `layer0..n` for item/generated models. */
  layers: string[];
  display: Partial<Record<DisplayContext, DisplayTransform>>;
}

interface JsonSource {
  json<T>(path: string): T | undefined;
}

const textureValue = (v: string | { sprite: string }) => (typeof v === 'string' ? v : v?.sprite);

export function resolveTextureRef(textures: Record<string, string>, ref: string): string | undefined {
  let cur: string | undefined = ref;
  for (let i = 0; i < 16 && cur?.startsWith('#'); i++) cur = textures[cur.slice(1)];
  if (!cur || cur.startsWith('#')) return undefined;
  return normalizeRL(cur);
}

/** Face textures are always variable references, with or without the leading `#`. */
export function resolveFaceTexture(textures: Record<string, string>, ref: string): string | undefined {
  return resolveTextureRef(textures, ref.startsWith('#') ? ref : `#${ref}`) ?? (ref.includes('/') ? normalizeRL(ref) : undefined);
}

export function resolveModel(store: JsonSource, id: string): ResolvedModel {
  const rootId = normalizeRL(id);
  const chain: string[] = [];
  const rawTextures: Record<string, string> = {};
  const display: ResolvedModel['display'] = {};
  let elements: ModelElement[] | undefined;
  let generated = false;

  let cur: string | undefined = rootId;
  for (let depth = 0; cur && depth < 32; depth++) {
    if (cur === 'minecraft:builtin/generated') {
      generated = true;
      break;
    }
    if (cur === 'minecraft:builtin/entity') break;
    const json: ModelJson | undefined = store.json<ModelJson>(modelPath(cur));
    if (!json) break;
    chain.push(cur);
    for (const [k, v] of Object.entries(json.textures ?? {})) {
      const tex = textureValue(v);
      if (!(k in rawTextures) && typeof tex === 'string') rawTextures[k] = tex;
    }
    for (const [k, v] of Object.entries(json.display ?? {})) {
      if (!(k in display)) display[k as DisplayContext] = v;
    }
    if (!elements && Array.isArray(json.elements)) elements = json.elements;
    cur = json.parent ? normalizeRL(json.parent) : undefined;
  }

  const textures: Record<string, string> = {};
  for (const k of Object.keys(rawTextures)) {
    textures[k] = resolveTextureRef(rawTextures, `#${k}`) ?? rawTextures[k];
  }

  const layers: string[] = [];
  if (generated && !elements) {
    for (let i = 0; textures[`layer${i}`]; i++) layers.push(textures[`layer${i}`]);
  }

  let kind: ResolvedModel['kind'];
  if (chain.length === 0) kind = 'missing';
  else if (elements) kind = 'elements';
  else if (generated) kind = 'generated';
  else kind = 'builtin'; // builtin/entity or a model without geometry (rendered by code in-game)

  return { id: rootId, chain, kind, textures, elements: elements ?? [], layers, display };
}

/** Texture ids a resolved model actually draws with (plus the particle texture as fallback). */
export function modelTextures(model: ResolvedModel): string[] {
  const out = new Set<string>(model.layers);
  for (const el of model.elements) {
    for (const face of Object.values(el.faces)) {
      const tex = face && resolveFaceTexture(model.textures, face.texture);
      if (tex) out.add(tex);
    }
  }
  if (out.size === 0 && model.textures.particle && !model.textures.particle.startsWith('#')) {
    out.add(model.textures.particle);
  }
  return [...out];
}
