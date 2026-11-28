export interface ResourceLocation {
  ns: string;
  path: string;
}

export function parseRL(id: string): ResourceLocation {
  const i = id.indexOf(':');
  return i < 0 ? { ns: 'minecraft', path: id } : { ns: id.slice(0, i), path: id.slice(i + 1) };
}

export function normalizeRL(id: string): string {
  const { ns, path } = parseRL(id);
  return `${ns}:${path}`;
}

export const modelPath = (id: string) => {
  const { ns, path } = parseRL(id);
  return `assets/${ns}/models/${path}.json`;
};

/**
 * Pseudo namespace for images outside `textures/` (OptiFine's CTM and CIT tiles): `__file:` and the
 * full path of the PNG.
 */
export const FILE_NS = '__file';
export const fileTextureId = (path: string) => `${FILE_NS}:${path}`;

/**
 * Pseudo namespace for textures put together from others while drawing (OptiFine's compact CTM
 * quarters, stacked overlay tiles): `__mix:` and the layers, bottom first, each `<quarter>@<id>`
 * with `*` for the whole image or 0–3 for top left, top right, bottom left, bottom right.
 */
export const MIX_NS = '__mix';
export interface MixLayer {
  texture: string;
  quarter?: 0 | 1 | 2 | 3;
}
export const mixTextureId = (layers: MixLayer[]) => `${MIX_NS}:${layers.map((l) => `${l.quarter ?? '*'}@${l.texture}`).join(';')}`;
export function parseMixTexture(id: string): MixLayer[] | undefined {
  if (!id.startsWith(`${MIX_NS}:`)) return undefined;
  return id
    .slice(MIX_NS.length + 1)
    .split(';')
    .map((part) => {
      const at = part.indexOf('@');
      const q = part.slice(0, at);
      return { texture: part.slice(at + 1), quarter: q === '*' ? undefined : (Number(q) as MixLayer['quarter']) };
    });
}

export const texturePath = (id: string) => {
  const { ns, path } = parseRL(id);
  return ns === FILE_NS ? path : `assets/${ns}/textures/${path}.png`;
};

/** A texture id as shown to the user: images outside `textures/` as `namespace:path/inside.png`. */
export const textureLabel = (id: string) => {
  const { ns, path } = parseRL(id);
  if (ns !== FILE_NS) return id;
  const m = /^assets\/([^/]+)\/(.+)$/.exec(path);
  return m ? `${m[1]}:${m[2]}` : path;
};

export const itemDefinitionPath = (id: string) => {
  const { ns, path } = parseRL(id);
  return `assets/${ns}/items/${path}.json`;
};

export const soundPath = (id: string) => {
  const { ns, path } = parseRL(id);
  return `assets/${ns}/sounds/${path}.ogg`;
};

export const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1);
