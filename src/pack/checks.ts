import { frameSize, parseLenientJson, pngSize, type AssetStore } from '../assets/AssetStore';
import { isAtlasTexture } from '../models/atlasMembership';
import { texturePermutation } from '../models/atlasPermutations';
import { allItemModels } from '../models/itemDefinition';
import { modelPath, normalizeRL, texturePath } from '../models/resourceLocation';
import { readOverlays, splitOverlayPath, VALID_DIRECTORY } from './overlays';

/**
 * Checks a pack before export for things Minecraft would reject or silently ignore: broken JSON,
 * invalid paths, textures whose animation doesn't fit, missing models and textures, files in
 * places the game never reads, and a pack format that doesn't match the game version.
 */

export type IssueLevel = 'error' | 'warning' | 'info';

export type IssueCode =
  | 'noMeta'
  | 'formatMismatch'
  | 'badJson'
  | 'badPath'
  | 'outsideAssets'
  | 'legacyFolder'
  | 'wrongType'
  | 'orphanMeta'
  | 'sizeMismatch'
  | 'animBadSize'
  | 'animBadFrames'
  | 'animIgnored'
  | 'missingTexture'
  | 'missingModel'
  | 'missingSound'
  | 'iconNotSquare'
  | 'badOverlayDir'
  | 'emptyOverlay';

export interface Issue {
  level: IssueLevel;
  code: IssueCode;
  path?: string;
  vars?: Record<string, string | number>;
}

export const LEVEL: Record<IssueCode, IssueLevel> = {
  noMeta: 'info',
  formatMismatch: 'warning',
  badJson: 'error',
  badPath: 'error',
  outsideAssets: 'info',
  legacyFolder: 'warning',
  wrongType: 'warning',
  orphanMeta: 'warning',
  sizeMismatch: 'warning',
  animBadSize: 'error',
  animBadFrames: 'error',
  animIgnored: 'warning',
  missingTexture: 'warning',
  missingModel: 'warning',
  missingSound: 'warning',
  iconNotSquare: 'warning',
  badOverlayDir: 'error',
  emptyOverlay: 'info',
};


const ROOT_FILES = new Set(['pack.mcmeta', 'pack.png']);
/** Characters Minecraft allows in resource paths. */
const VALID_PATH = /^assets\/[a-z0-9_.-]+\/[a-z0-9_.\-/]+$/;
const decoder = new TextDecoder();

/** pack_format, supported_formats and min/max_format all as one range of formats. */
export function supportedFormats(raw: any): [number, number][] {
  const pack = raw?.pack ?? {};
  const num = (v: unknown) => (typeof v === 'number' ? v : Array.isArray(v) && typeof v[0] === 'number' ? v[0] : undefined);
  const out: [number, number][] = [];
  const pf = num(pack.pack_format);
  if (pf !== undefined) out.push([pf, pf]);
  const sf = pack.supported_formats;
  if (typeof sf === 'number') out.push([sf, sf]);
  else if (Array.isArray(sf) && sf.length === 2) out.push([sf[0], sf[1]]);
  else if (sf && typeof sf === 'object') out.push([sf.min_inclusive, sf.max_inclusive]);
  const min = num(pack.min_format);
  const max = num(pack.max_format);
  if (min !== undefined || max !== undefined) out.push([min ?? max!, max ?? min!]);
  return out.filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
}

export interface CheckOptions {
  gameFormat?: number;
  /** Whether a vanilla sound file exists (asset index key like `minecraft/sounds/x.ogg`); unknown if absent. */
  vanillaSound?: (key: string) => boolean;
}

export function checkPack(store: AssetStore, files: Map<string, Uint8Array>, opts: CheckOptions = {}): Issue[] {
  const issues: Issue[] = [];
  const add = (code: IssueCode, path?: string, vars?: Issue['vars']) => issues.push({ level: LEVEL[code], code, path, vars });
  const json = new Map<string, any>();
  const parsed = (path: string): any => {
    if (json.has(path)) return json.get(path);
    const bytes = files.get(path);
    let v: any;
    try {
      v = bytes ? parseLenientJson(decoder.decode(bytes)) : undefined;
    } catch {
      v = undefined;
    }
    json.set(path, v);
    return v;
  };
  /** The .mcmeta that applies to a texture in the exported pack (pack's own, else none). */
  const metaOf = (png: string) => (files.has(`${png}.mcmeta`) ? parsed(`${png}.mcmeta`) : undefined);
  const exists = (path: string) => files.has(path) || store.vanilla.has(path);

  // pack.mcmeta and pack.png
  if (!files.has('pack.mcmeta')) add('noMeta');
  else if (opts.gameFormat !== undefined) {
    const ranges = supportedFormats(parsed('pack.mcmeta'));
    if (ranges.length && !ranges.some(([a, b]) => opts.gameFormat! >= a && opts.gameFormat! <= b)) {
      add('formatMismatch', 'pack.mcmeta', { format: ranges.map(([a, b]) => (a === b ? a : `${a}–${b}`)).join(', '), game: opts.gameFormat });
    }
  }
  const icon = files.get('pack.png');
  const iconSize = icon && pngSize(icon);
  if (iconSize && iconSize[0] !== iconSize[1]) add('iconNotSquare', 'pack.png', { w: iconSize[0], h: iconSize[1] });

  // overlays: folders beside assets/ for some game versions
  const overlays = readOverlays(parsed('pack.mcmeta'));
  const dirs = overlays.map((o) => o.directory);
  for (const o of overlays) {
    if (!VALID_DIRECTORY.test(o.directory)) add('badOverlayDir', 'pack.mcmeta', { dir: o.directory });
    else if (![...files.keys()].some((p) => p.startsWith(`${o.directory}/`))) add('emptyOverlay', 'pack.mcmeta', { dir: o.directory });
  }

  for (const [path, bytes] of files) {
    if (ROOT_FILES.has(path)) {
      if (path === 'pack.mcmeta' && parsed(path) === undefined) add('badJson', path);
      continue;
    }
    // a file in an overlay is checked like the file it stands for
    const inner = splitOverlayPath(path, dirs)?.inner ?? path;
    if (!inner.startsWith('assets/')) {
      add('outsideAssets', path);
      continue;
    }
    if (!VALID_PATH.test(inner)) {
      add('badPath', path);
      continue;
    }
    const m = /^assets\/([^/]+)\/([^/]+)\/(.*)$/.exec(inner);
    const [, , kind, rest] = m ?? [];
    if (/\.(json|mcmeta)$/.test(path) && parsed(path) === undefined) {
      add('badJson', path);
      continue;
    }
    if (kind === 'textures') {
      if (/^(blocks|items)\//.test(rest)) add('legacyFolder', path, { folder: rest.split('/')[0] });
      if (!/\.(png|mcmeta)$/.test(path)) add('wrongType', path, { expected: '.png' });
      if (path.endsWith('.png.mcmeta') && !exists(path.slice(0, -'.mcmeta'.length))) add('orphanMeta', path);
      if (path.endsWith('.png')) checkTexture(path, bytes);
    } else if (kind === 'sounds' && !/\.ogg$/.test(path)) add('wrongType', path, { expected: '.ogg' });
    else if (kind === 'models' && path.endsWith('.json')) checkModel(path, parsed(path));
    else if (kind === 'items' && path.endsWith('.json')) {
      for (const model of allItemModels(parsed(path)?.model)) if (!exists(modelPath(model))) add('missingModel', path, { model });
    } else if (kind === 'blockstates' && path.endsWith('.json')) {
      for (const model of blockstateModels(parsed(path))) if (!exists(modelPath(model))) add('missingModel', path, { model });
    }
    if (/^assets\/[^/]+\/sounds\.json$/.test(path) && opts.vanillaSound) checkSounds(path, parsed(path));
  }

  function checkTexture(path: string, bytes: Uint8Array) {
    // only textures stitched into an atlas can be animated
    const atlas = isAtlasTexture(store, path);
    const size = pngSize(bytes);
    if (!size) return;
    const meta = metaOf(path);
    const anim = meta?.animation;
    if (anim && typeof anim === 'object') {
      if (!atlas) add('animIgnored', path);
      else {
        const [fw, fh] = frameSize(anim, ...size);
        if (!fw || !fh || size[0] % fw || size[1] % fh) add('animBadSize', path, { w: size[0], h: size[1], fw, fh });
        else if (Array.isArray(anim.frames)) {
          const count = (size[0] / fw) * (size[1] / fh);
          const bad = anim.frames.map((f: any) => (typeof f === 'number' ? f : f?.index)).filter((i: unknown) => !Number.isInteger(i) || (i as number) < 0 || (i as number) >= count);
          if (bad.length) add('animBadFrames', path, { frames: bad.map((i: number) => i + 1).join(', '), count });
        }
      }
    }
    // compared with the vanilla texture, the image should be scaled evenly (frames compared with frames)
    const vanilla = store.vanilla.get(path);
    const vSize = vanilla && pngSize(vanilla);
    if (!vSize) return;
    const vMeta = store.vanilla.get(`${path}.mcmeta`);
    let vAnim: any;
    try {
      vAnim = vMeta ? (parseLenientJson(decoder.decode(vMeta)) as any)?.animation : undefined;
    } catch {
      vAnim = undefined;
    }
    const own = anim && atlas ? frameSize(anim, ...size) : vAnim && atlas ? [size[0], size[0]] : size;
    const base = vAnim && atlas ? frameSize(vAnim, ...vSize) : vSize;
    if (Math.abs(own[0] / base[0] - own[1] / base[1]) > 1e-6) {
      add('sizeMismatch', path, { w: own[0], h: own[1], vw: base[0], vh: base[1] });
    }
  }

  function checkModel(path: string, model: any) {
    const textures = model?.textures;
    for (const v of textures && typeof textures === 'object' ? Object.values(textures) : []) {
      const ref = typeof v === 'string' ? v : (v as any)?.sprite;
      if (typeof ref !== 'string' || ref.startsWith('#')) continue;
      const id = normalizeRL(ref);
      if (!exists(texturePath(id)) && !texturePermutation(store, id)) add('missingTexture', path, { texture: id });
    }
    if (typeof model?.parent === 'string' && !model.parent.startsWith('builtin/') && !/^minecraft:builtin\//.test(model.parent)) {
      const parent = normalizeRL(model.parent);
      if (!exists(modelPath(parent))) add('missingModel', path, { model: parent });
    }
  }

  function checkSounds(path: string, sounds: any) {
    if (!sounds || typeof sounds !== 'object') return;
    const ns = path.split('/')[1];
    for (const event of Object.values<any>(sounds)) {
      for (const s of event?.sounds ?? []) {
        const entry = typeof s === 'string' ? { name: s } : s;
        if (!entry || typeof entry.name !== 'string' || entry.type === 'event') continue;
        const [sns, name] = entry.name.includes(':') ? entry.name.split(':') : [ns, entry.name];
        const file = `assets/${sns}/sounds/${name}.ogg`;
        if (!files.has(file) && !opts.vanillaSound!(`${sns}/sounds/${name}.ogg`)) add('missingSound', path, { sound: `${sns}:${name}` });
      }
    }
  }

  const order: Record<IssueLevel, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.level] - order[b.level] || (a.path ?? '').localeCompare(b.path ?? ''));
}

/** Every model a blockstate uses (variants and multipart). */
export function blockstateModels(bs: any): Set<string> {
  const out = new Set<string>();
  const addAll = (v: any) => {
    for (const e of [v].flat()) if (e && typeof e.model === 'string') out.add(normalizeRL(e.model));
  };
  if (bs?.variants && typeof bs.variants === 'object') for (const v of Object.values(bs.variants)) addAll(v);
  if (Array.isArray(bs?.multipart)) for (const part of bs.multipart) addAll(part?.apply);
  return out;
}
