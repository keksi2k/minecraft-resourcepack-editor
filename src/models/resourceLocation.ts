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

export const texturePath = (id: string) => {
  const { ns, path } = parseRL(id);
  return `assets/${ns}/textures/${path}.png`;
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
