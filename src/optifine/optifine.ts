import type { AssetStore } from '../assets/AssetStore';
import type { FaceDir } from '../models/modelResolver';
import { fileTextureId, mixTextureId, normalizeRL } from '../models/resourceLocation';

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

export type CtmMethod =
  | 'ctm'
  | 'ctm_compact'
  | 'horizontal'
  | 'vertical'
  | 'horizontal+vertical'
  | 'vertical+horizontal'
  | 'top'
  | 'random'
  | 'repeat'
  | 'fixed'
  | 'overlay'
  | 'overlay_ctm'
  | 'overlay_random'
  | 'overlay_repeat'
  | 'overlay_fixed'
  | string;

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
  /** Overlays: the neighbours they connect to (blocks, or blocks showing one of these textures). */
  connectBlocks?: Set<string>;
  connectTiles?: Set<string>;
  /** Overlays: tinted like `tintBlock` when `tintIndex` is 0 or more. */
  tintIndex: number;
  tintBlock?: string;
  /** ctm_compact: whole tiles for some of the 47 cases (`ctm.<case>=<tile>`). */
  compactTiles?: Map<number, number>;
}

/** Methods the sandbox draws; others are listed but not drawn. */
export const SHOWN_METHODS = new Set([
  'ctm',
  'ctm_compact',
  'horizontal',
  'vertical',
  'horizontal+vertical',
  'vertical+horizontal',
  'top',
  'random',
  'repeat',
  'fixed',
  'overlay',
  'overlay_ctm',
  'overlay_random',
  'overlay_repeat',
  'overlay_fixed',
]);

/** Overlay methods draw on top of a face instead of replacing its texture. */
export const isOverlay = (rule: CtmRule) => rule.method.startsWith('overlay');

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
  const compactTiles = new Map<number, number>();
  for (const [k, v] of Object.entries(props)) {
    const m = /^ctm\.(\d+)$/.exec(k);
    if (m && /^\d+$/.test(v)) compactTiles.set(+m[1], +v);
  }
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
    connectBlocks: props.connectBlocks !== undefined ? new Set(words(props.connectBlocks).map(blockOf)) : undefined,
    connectTiles: props.connectTiles !== undefined ? new Set(words(props.connectTiles).map((w) => tileOf(w, path))) : undefined,
    tintIndex: /^-?\d+$/.test(props.tintIndex ?? '') ? Number(props.tintIndex) : -1,
    tintBlock: props.tintBlock ? blockOf(props.tintBlock) : undefined,
    compactTiles: compactTiles.size ? compactTiles : undefined,
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

const applies = (r: CtmRule, block: string, texture: string, face: FaceDir) =>
  (!r.faces || r.faces.has(face)) && (r.matchTiles ? r.matchTiles.has(texture) : !!r.matchBlocks?.has(block));

/** The first rule that replaces the texture of a block face showing `texture` (overlays aside). */
export function ruleFor(rules: CtmRule[], block: string, texture: string, face: FaceDir): CtmRule | undefined {
  return rules.find((r) => !isOverlay(r) && applies(r, block, texture, face));
}

/** The overlay rules for a block face, in order; each may draw a layer on top of the face. */
export function overlayRulesFor(rules: CtmRule[], block: string, texture: string, face: FaceDir): CtmRule[] {
  return rules.filter((r) => isOverlay(r) && applies(r, block, texture, face));
}

export type V3 = [number, number, number];
export const NORMAL: Record<FaceDir, V3> = { up: [0, 1, 0], down: [0, -1, 0], north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0] };
/** Left and up of each face's texture, as seen from outside (for a face drawn without rotation). */
export const AXES: Record<FaceDir, [left: V3, up: V3]> = {
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

/** ctm_compact's five tiles, used per quarter of the face. */
const COMPACT = { none: 0, all: 1, vertical: 2, horizontal: 3, corners: 4 };

/** A number per position that looks random; the same position always gives the same one. */
function hash(x: number, y: number, z: number, salt: number): number {
  let h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791) ^ Math.imul(salt, 2654435761)) | 0;
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return (h ^ (h >>> 13)) >>> 0;
}

/**
 * The tile a rule gives a face at `pos` (a texture id), or undefined to keep the block's own
 * texture (no rule, `<default>`, `<skip>`, or a method the sandbox doesn't draw). `axes` are the
 * left and up of the face's texture in the world, when the model turns the texture.
 * Overlay methods give the tile to draw on top of the face instead.
 */
export function ctmTile(rule: CtmRule, world: CtmWorld, pos: V3, face: FaceDir, block: string, texture: string, axes = AXES[face]): string | undefined {
  if (rule.method === 'overlay') return overlayTile(rule, world, pos, face, block, axes);
  const method = rule.method.replace(/^overlay_/, '');
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
  const [left, up] = axes;
  const right = neg(left);
  const down = neg(up);
  const horizontal = () => {
    const l = connected(left);
    const r = connected(right);
    return l && r ? 1 : r ? 0 : l ? 2 : 3;
  };
  const vertical = () => {
    const u = connected(up);
    const d = connected(down);
    return u && d ? 1 : u ? 0 : d ? 2 : 3;
  };
  let index: number | undefined;
  switch (method) {
    case 'ctm':
    case 'ctm_compact': {
      const U = connected(up);
      const R = connected(right);
      const D = connected(down);
      const L = connected(left);
      const ul = U && L && connected(add(up, left));
      const ur = U && R && connected(add(up, right));
      const dr = D && R && connected(add(down, right));
      const dl = D && L && connected(add(down, left));
      const corners = [ul && 'ul', ur && 'ur', dr && 'dr', dl && 'dl'].filter(Boolean);
      const edges = `${U ? 'U' : ''}${R ? 'R' : ''}${D ? 'D' : ''}${L ? 'L' : ''}`;
      index = CTM_INDEX.get(corners.length ? `${edges}|${corners.join(',')}` : edges);
      if (method === 'ctm') break;
      // compact: a whole tile where the pack names one for this case, else the face in four quarters
      const whole = index === undefined ? undefined : rule.compactTiles?.get(index);
      if (whole !== undefined) {
        index = whole;
        break;
      }
      const quarter = (v: boolean, h: boolean, corner: boolean) =>
        v && h ? (corner ? COMPACT.all : COMPACT.corners) : h ? COMPACT.horizontal : v ? COMPACT.vertical : COMPACT.none;
      const tiles = [quarter(U, L, ul), quarter(U, R, ur), quarter(D, L, dl), quarter(D, R, dr)].map((i) => rule.tiles[i]);
      if (tiles.some((t) => !t || t === 'default')) return undefined;
      return mixTextureId(tiles.map((t, q) => ({ texture: t as string, quarter: q as 0 | 1 | 2 | 3 })));
    }
    case 'horizontal':
      index = horizontal();
      break;
    case 'vertical':
      index = vertical();
      break;
    case 'horizontal+vertical': {
      // horizontal first; a face without horizontal neighbours connects vertically with tiles 4–6
      const h = horizontal();
      const v = h === 3 ? vertical() : 3;
      index = h !== 3 ? h : v === 3 ? 3 : v + 4;
      break;
    }
    case 'vertical+horizontal': {
      const v = vertical();
      const h = v === 3 ? horizontal() : 3;
      index = v !== 3 ? v : h === 3 ? 3 : h + 4;
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

/**
 * method=overlay: a fringe drawn on a face next to blocks it connects to (`connectBlocks` /
 * `connectTiles`, else any other block), e.g. grass spilling onto the dirt beside it. The 17 tiles
 * form OptiFine's overlay template; which ones a face gets follows the neighbours to its left,
 * down, right and up, plus the diagonal ones (as Continuity does it). Several tiles are stacked.
 */
function overlayTile(rule: CtmRule, world: CtmWorld, pos: V3, face: FaceDir, block: string, axes: [V3, V3]): string | undefined {
  const normal = NORMAL[face];
  const [left, up] = axes;
  // left, down, right, up: mask bits 1, 2, 4, 8
  const dirs: V3[] = [left, neg(up), neg(left), up];
  const source = (p: V3) => {
    const other = world.blockAt(p);
    if (!other || other === block) return false;
    if (rule.connectBlocks && !rule.connectBlocks.has(other)) return false;
    if (rule.connectTiles && ![...world.texturesOf(other)].some((t) => rule.connectTiles!.has(t))) return false;
    // its face on this side must be visible
    return !world.blockAt(add(p, normal));
  };
  const same = (p: V3) => world.blockAt(p) === block && !world.blockAt(add(p, normal));
  const edge = dirs.map((d) => source(add(pos, d)));
  // a corner tile: the diagonal block connects, and both sides next to it continue this face
  const corner = (i: number) => {
    const j = (i + 1) % 4;
    return !edge[i] && !edge[j] && source(add(pos, dirs[i], dirs[j])) && same(add(pos, dirs[i])) && same(add(pos, dirs[j]));
  };
  const CORNER_TILE = [2, 0, 14, 16]; // between dirs i and i+1
  const mask = edge.reduce((m, e, i) => m | (e ? 1 << i : 0), 0);
  const EDGE_TILES: Record<number, number[]> = {
    0b1111: [8],
    0b0111: [5],
    0b1011: [6],
    0b1101: [13],
    0b1110: [12],
    0b0101: [9, 7],
    0b1010: [1, 15],
    0b0011: [4],
    0b0110: [3],
    0b1100: [10],
    0b1001: [11],
    0b0001: [9],
    0b0010: [1],
    0b0100: [7],
    0b1000: [15],
    0b0000: [],
  };
  const indices = [...EDGE_TILES[mask], ...[0, 1, 2, 3].filter(corner).map((i) => CORNER_TILE[i])];
  const tiles = indices.map((i) => rule.tiles[i]).filter((t): t is string => !!t && t !== 'default');
  if (!tiles.length) return undefined;
  return tiles.length === 1 ? tiles[0] : mixTextureId(tiles.map((texture) => ({ texture })));
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
