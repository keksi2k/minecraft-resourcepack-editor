import type { AssetStore } from '../assets/AssetStore';
import type { FaceDir } from '../models/modelResolver';
import { fileTextureId, normalizeRL } from '../models/resourceLocation';

/**
 * OptiFine's resource pack extras, which Continuity, CIT Resewn and others read too: connected and
 * random textures (CTM), custom item textures (CIT) and emissive textures. The vanilla game ignores
 * them; the editor shows them in the block sandbox and the item details.
 *
 * Tile semantics follow OptiFine's documentation (OptiFineDoc/doc/ctm.properties) and its CTM
 * template; positions for `repeat` and the neighbour checks match what OptiFine does.
 */

const decoder = new TextDecoder();

/** Java `.properties`: `key=value`, `key: value` or `key value`, `#`/`!` comments, `\` continues a line. */
export function parseProperties(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].replace(/^\s+/, '');
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    while (/(^|[^\\])(\\\\)*\\$/.test(line) && i + 1 < lines.length) line = line.slice(0, -1) + lines[++i].replace(/^\s+/, '');
    const m = /^((?:[^=:\s\\]|\\.)+)\s*[=:\s]\s*(.*)$/.exec(line);
    const key = (m ? m[1] : line).replace(/\\(.)/g, '$1');
    const value = (m ? m[2] : '').replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\(.)/g, '$1');
    out[key] = value.trim();
  }
  return out;
}

const words = (v: string | undefined) => (v ?? '').split(/\s+/).filter(Boolean);
const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/'));
const baseName = (path: string) => path.slice(path.lastIndexOf('/') + 1).replace(/\.properties$/, '');

/** Texture id for an image path: a normal one inside textures/, else a file id. */
export function imageId(path: string): string {
  const m = /^assets\/([^/]+)\/textures\/(.+)\.png$/.exec(path);
  return m ? `${m[1]}:${m[2]}` : fileTextureId(path);
}

/** Where a tile or texture name in a properties file points: same folder, assets/minecraft/…, or ns:path. */
export function resolveImage(name: string, propertiesPath: string): string {
  let path: string;
  if (name.includes(':')) {
    const [ns, p] = name.split(':', 2);
    path = `assets/${ns}/${p}`;
  } else if (name.includes('/')) path = name.startsWith('assets/') ? name : `assets/minecraft/${name.replace(/^\.\//, '')}`;
  else path = `${dirOf(propertiesPath)}/${name}`;
  return path.endsWith('.png') ? path : `${path}.png`;
}

/* CTM -------------------------------------------------------------------------------------------- */

export type CtmMethod = 'ctm' | 'ctm_compact' | 'horizontal' | 'vertical' | 'horizontal+vertical' | 'vertical+horizontal' | 'top' | 'random' | 'repeat' | 'fixed' | string;

export interface CtmRule {
  file: string;
  method: CtmMethod;
  /** Texture ids; `null` = `<skip>`, `'default'` = the block's own texture. */
  tiles: (string | null | 'default')[];
  matchBlocks?: Set<string>;
  matchTiles?: Set<string>;
  faces?: Set<FaceDir>;
  connect: 'block' | 'tile' | 'state';
  weight: number;
  weights?: number[];
  width: number;
  height: number;
  innerSeams: boolean;
}

/** Methods the sandbox can show; others (overlays, compact) are listed but not drawn. */
export const SHOWN_METHODS = new Set(['ctm', 'horizontal', 'vertical', 'top', 'random', 'repeat', 'fixed']);

/** `oak_stairs`, `minecraft:oak_stairs`, `minecraft:oak_stairs:facing=east` → `minecraft:oak_stairs`. */
export function blockOf(token: string): string {
  const parts = token.split(':');
  return parts.length > 1 && !parts[1].includes('=') ? `${parts[0]}:${parts[1]}` : `minecraft:${parts[0]}`;
}

/** A tile name of `matchTiles` as a texture id: names refer to textures/block. */
export function tileOf(token: string, propertiesPath: string): string {
  if (token.includes('/')) return imageId(resolveImage(token, propertiesPath));
  const [ns, name] = token.includes(':') ? token.split(':', 2) : ['minecraft', token];
  return `${ns}:block/${name}`;
}

const FACES: Record<string, FaceDir[]> = {
  bottom: ['down'],
  top: ['up'],
  north: ['north'],
  south: ['south'],
  east: ['east'],
  west: ['west'],
  sides: ['north', 'south', 'east', 'west'],
  all: ['north', 'south', 'east', 'west', 'up', 'down'],
};

export function parseTiles(value: string | undefined, propertiesPath: string): CtmRule['tiles'] {
  const out: CtmRule['tiles'] = [];
  for (const w of words(value)) {
    const range = /^(\d+)-(\d+)$/.exec(w);
    if (range) for (let i = +range[1]; i <= +range[2]; i++) out.push(imageId(resolveImage(String(i), propertiesPath)));
    else if (w === '<skip>') out.push(null);
    else if (w === '<default>') out.push('default');
    else out.push(imageId(resolveImage(w, propertiesPath)));
  }
  return out;
}

export function parseCtmRule(path: string, props: Record<string, string>): CtmRule | undefined {
  if (!props.method) return undefined;
  const name = baseName(path);
  let matchBlocks = props.matchBlocks !== undefined ? new Set(words(props.matchBlocks).map(blockOf)) : undefined;
  let matchTiles = props.matchTiles !== undefined ? new Set(words(props.matchTiles).map((w) => tileOf(w, path))) : undefined;
  // inferred from the file name: block_<name> → matchBlocks, else matchTiles
  if (!matchBlocks && !matchTiles) {
    if (name.startsWith('block_')) matchBlocks = new Set([blockOf(name.slice(6))]);
    else matchTiles = new Set([tileOf(name, path)]);
  }
  const faces = props.faces ? new Set(words(props.faces).flatMap((f) => FACES[f] ?? [])) : undefined;
  const connect = (['block', 'tile', 'state'].includes(props.connect) ? props.connect : matchBlocks && !matchTiles ? 'block' : 'tile') as CtmRule['connect'];
  return {
    file: path,
    method: props.method.trim(),
    tiles: parseTiles(props.tiles, path),
    matchBlocks,
    matchTiles,
    faces,
    connect,
    weight: Number(props.weight) || 0,
    weights: props.weights ? words(props.weights).map(Number) : undefined,
    width: Number(props.width) || 1,
    height: Number(props.height) || 1,
    innerSeams: props.innerSeams === 'true',
  };
}

const propertiesFiles = (store: AssetStore, kind: 'ctm' | 'cit') =>
  store.list('assets/').filter((p) => new RegExp(`^assets/[^/]+/(optifine|mcpatcher)/${kind}/.+\\.properties$`).test(p));

const readProps = (store: AssetStore, path: string) => parseProperties(decoder.decode(store.get(path)!));

/** Every CTM rule in the pack, in the order OptiFine checks them. */
export function loadCtmRules(store: AssetStore): CtmRule[] {
  const rules = propertiesFiles(store, 'ctm')
    .map((p) => parseCtmRule(p, readProps(store, p)))
    .filter((r): r is CtmRule => !!r);
  // tile rules before block rules, then the highest weight, then by file name
  return rules.sort((a, b) => Number(!a.matchTiles) - Number(!b.matchTiles) || b.weight - a.weight || baseName(a.file).localeCompare(baseName(b.file)));
}

/** The first rule for a block face showing `texture`. */
export function ruleFor(rules: CtmRule[], block: string, texture: string, face: FaceDir): CtmRule | undefined {
  return rules.find((r) => (!r.faces || r.faces.has(face)) && (r.matchTiles ? r.matchTiles.has(texture) : r.matchBlocks?.has(block)));
}

type V3 = [number, number, number];
const NORMAL: Record<FaceDir, V3> = { up: [0, 1, 0], down: [0, -1, 0], north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0] };
/** Left and up of each face's texture, as seen from outside. */
const AXES: Record<FaceDir, [left: V3, up: V3]> = {
  north: [[1, 0, 0], [0, 1, 0]],
  south: [[-1, 0, 0], [0, 1, 0]],
  east: [[0, 0, 1], [0, 1, 0]],
  west: [[0, 0, -1], [0, 1, 0]],
  up: [[-1, 0, 0], [0, 0, -1]],
  down: [[-1, 0, 0], [0, 0, 1]],
};
const add = (a: V3, ...bs: V3[]): V3 => bs.reduce<V3>((p, b) => [p[0] + b[0], p[1] + b[1], p[2] + b[2]], a);
const neg = (a: V3): V3 => [-a[0], -a[1], -a[2]];

/**
 * The 47 tiles of the CTM template, each by the edges it connects across (Up, Right, Down, Left)
 * and, after `|`, the corners filled in between two connected edges.
 */
const CTM_TEMPLATE = [
  '', 'R', 'RL', 'L', 'RD', 'DL', 'URD', 'RDL', 'URDL|ur', 'URDL|dr', 'URDL|ul,dl', 'URDL|ul,ur',
  'D', 'RD|dr', 'RDL|dr,dl', 'DL|dl', 'UR', 'UL', 'URL', 'UDL', 'URDL|ul', 'URDL|dl', 'URDL|dr,dl', 'URDL|ur,dr',
  'UD', 'URD|ur,dr', 'URDL|ul,ur,dr,dl', 'UDL|ul,dl', 'URD|dr', 'RDL|dl', 'URD|ur', 'RDL|dr', 'URDL|ul,ur,dl', 'URDL|ul,ur,dr', 'URDL|ur,dl', 'URDL|ul,dr',
  'U', 'UR|ur', 'URL|ul,ur', 'UL|ul', 'URL|ur', 'UDL|ul', 'URL|ul', 'UDL|dl', 'URDL|ul,dr,dl', 'URDL|ur,dr,dl', 'URDL',
];
const CTM_INDEX = new Map(CTM_TEMPLATE.map((k, i) => [k, i]));

/** What the sandbox knows about its blocks. */
export interface CtmWorld {
  blockAt(pos: V3): string | undefined;
  /** Textures a block's model shows (for `connect=tile`). */
  texturesOf(block: string): Set<string>;
}

/** A number per position that looks random; the same position always gives the same one. */
function hash(x: number, y: number, z: number, salt: number): number {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ Math.imul(salt, 2654435761)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return (h ^ (h >>> 13)) >>> 0;
}

/**
 * The tile a rule gives a face at `pos` (a texture id), or undefined to keep the block's own
 * texture (no rule, `<default>`, `<skip>`, or a method the sandbox doesn't draw).
 */
export function ctmTile(rule: CtmRule, world: CtmWorld, pos: V3, face: FaceDir, block: string, texture: string): string | undefined {
  const matches = (p: V3) => {
    const other = world.blockAt(p);
    if (!other) return false;
    return rule.connect === 'tile' ? world.texturesOf(other).has(texture) : other === block;
  };
  const normal = NORMAL[face];
  // a neighbour counts if it shows the same face: not when a matching block covers that face
  const connected = (offset: V3) => {
    const p = add(pos, offset);
    return matches(p) && (rule.innerSeams || !matches(add(p, normal)));
  };
  const [left, up] = AXES[face];
  const right = neg(left);
  const down = neg(up);
  let index: number | undefined;
  switch (rule.method) {
    case 'ctm': {
      const U = connected(up);
      const R = connected(right);
      const D = connected(down);
      const L = connected(left);
      const corners = [
        U && L && connected(add(up, left)) && 'ul',
        U && R && connected(add(up, right)) && 'ur',
        D && R && connected(add(down, right)) && 'dr',
        D && L && connected(add(down, left)) && 'dl',
      ].filter(Boolean);
      const edges = `${U ? 'U' : ''}${R ? 'R' : ''}${D ? 'D' : ''}${L ? 'L' : ''}`;
      index = CTM_INDEX.get(corners.length ? `${edges}|${corners.join(',')}` : edges);
      break;
    }
    case 'horizontal': {
      const l = connected(left);
      const r = connected(right);
      index = l && r ? 1 : r ? 0 : l ? 2 : 3;
      break;
    }
    case 'vertical': {
      const u = connected(up);
      const d = connected(down);
      index = u && d ? 1 : u ? 0 : d ? 2 : 3;
      break;
    }
    case 'top':
      // side faces under a matching block
      index = face !== 'up' && face !== 'down' && matches(add(pos, [0, 1, 0])) ? 0 : undefined;
      break;
    case 'fixed':
      index = 0;
      break;
    case 'random': {
      const weights = rule.weights?.length === rule.tiles.length ? rule.weights : rule.tiles.map(() => 1);
      const total = weights.reduce((s, w) => s + Math.max(0, w), 0);
      let r = total ? hash(pos[0], pos[1], pos[2], face.length) % total : 0;
      index = 0;
      for (let i = 0; i < weights.length; i++) {
        r -= Math.max(0, weights[i]);
        if (r < 0) {
          index = i;
          break;
        }
      }
      break;
    }
    case 'repeat': {
      const [x, y, z] = pos;
      const [sx, sy] =
        face === 'down' ? [x, -z - 1] : face === 'up' ? [x, z] : face === 'north' ? [-x - 1, -y] : face === 'south' ? [x, -y] : face === 'west' ? [z, -y] : [-z - 1, -y];
      const w = rule.width;
      const h = rule.height;
      index = (((sy % h) + h) % h) * w + (((sx % w) + w) % w);
      break;
    }
  }
  const tile = index === undefined ? undefined : rule.tiles[index];
  return tile && tile !== 'default' ? tile : undefined;
}

/* emissive ---------------------------------------------------------------------------------------- */

/** The suffix of emissive textures (`suffix.emissive` in optifine/emissive.properties), if the pack has one. */
export function emissiveSuffix(store: AssetStore): string | undefined {
  const path = store.list('assets/').find((p) => /^assets\/minecraft\/optifine\/emissive\.properties$/.test(p));
  return path ? readProps(store, path)['suffix.emissive'] || undefined : undefined;
}

/** The emissive overlay of a texture (`block/lamp` → `block/lamp_e`), if the pack has one. */
export function emissiveOf(store: AssetStore, textureId: string, suffix: string | undefined): string | undefined {
  if (!suffix) return undefined;
  const id = normalizeRL(textureId);
  const m = /^([^:]+):(.+)$/.exec(id)!;
  const path = m[1] === '__file' ? m[2].replace(/\.png$/, `${suffix}.png`) : `assets/${m[1]}/textures/${m[2]}${suffix}.png`;
  return store.has(path) ? imageId(path) : undefined;
}

/* CIT --------------------------------------------------------------------------------------------- */

export interface CitRule {
  file: string;
  type: string;
  items: string[];
  /** Replacement texture (texture id) and per-layer ones (`texture.<name>`). */
  texture?: string;
  textures: Record<string, string>;
  model?: string;
  /** Conditions as written (name, damage, enchantments …), for display. */
  conditions: [string, string][];
  /** An item name the rule matches exactly, if that is its only condition. */
  exactName?: string;
  weight: number;
}

const CIT_KEYS = new Set(['type', 'items', 'matchItems', 'texture', 'model', 'weight']);

export function parseCitRule(path: string, props: Record<string, string>): CitRule {
  const type = props.type || 'item';
  const items = words(props.items ?? props.matchItems).map(blockOf);
  const textures: Record<string, string> = {};
  for (const [k, v] of Object.entries(props)) if (k.startsWith('texture.') && v) textures[k.slice(8)] = imageId(resolveImage(v, path));
  // without texture=, OptiFine uses the image named like the properties file
  const own = `${dirOf(path)}/${baseName(path)}.png`;
  const texture = props.texture ? imageId(resolveImage(props.texture, path)) : imageId(own);
  const conditions = Object.entries(props).filter(([k]) => !CIT_KEYS.has(k) && !k.startsWith('texture.') && !k.startsWith('model.'));
  const name = props['nbt.display.Name'] ?? props['components.custom_name'];
  const exact = name !== undefined && conditions.length === 1 && !/^(i?pattern|i?regex):/.test(name) ? name.replace(/^"(.*)"$/, '$1') : undefined;
  return { file: path, type, items, texture, textures, model: props.model, conditions, exactName: exact, weight: Number(props.weight) || 0 };
}

/** Every CIT rule in the pack. */
export function loadCitRules(store: AssetStore): CitRule[] {
  return propertiesFiles(store, 'cit').map((p) => parseCitRule(p, readProps(store, p)));
}
