import { stripNs, type SpecialModel } from '../models/itemDefinition';

/** One model layer of a special item model, drawn with one texture. */
export interface SpecialLayer {
  /** Key into entityModels.json. */
  model: string;
  /** Texture id, e.g. `minecraft:entity/chest/normal`. */
  texture: string;
  tint?: number;
  /** Only draw this child part of the model (e.g. the shield's `plate` for patterns). */
  part?: string;
  /** Root pose overrides set by the game's model code. */
  rootPose?: { y?: number; zRot?: number };
}

/** One banner pattern layer: pattern id (texture name) and dye colour. */
export interface PatternLayer {
  pattern: string;
  color: string;
}

/** Item component data the game passes to some special renderers; here it comes from the preview UI. */
export interface SpecialOptions {
  patterns?: PatternLayer[];
  /** Shield base colour (`base_color` component). */
  baseColor?: string;
  /** Decorated pot sides (`pot_decorations` component): pattern texture name per side. */
  sherds?: Partial<Record<PotSide, string>>;
}

export const POT_SIDES = ['front', 'back', 'left', 'right'] as const;
export type PotSide = (typeof POT_SIDES)[number];

/** Special model types whose item data can be previewed. */
export const PATTERNED = new Set(['banner', 'shield', 'decorated_pot']);

/** DyeColor texture colours, used to tint banners and their patterns. */
export const DYE: Record<string, number> = {
  white: 0xf9fffe,
  orange: 0xf9801d,
  magenta: 0xc74ebd,
  light_blue: 0x3ab3da,
  yellow: 0xfed83d,
  lime: 0x80c71f,
  pink: 0xf38baa,
  gray: 0x474f52,
  light_gray: 0x9d9d97,
  cyan: 0x169c9c,
  purple: 0x8932b8,
  blue: 0x3c44aa,
  brown: 0x835432,
  green: 0x5e7c16,
  red: 0xb02e26,
  black: 0x1d1d21,
};

/** Skull kind → [model layer, texture] as in SkullBlockRenderer. */
const HEADS: Record<string, [string, string]> = {
  skeleton: ['skeleton_skull', 'skeleton/skeleton'],
  wither_skeleton: ['wither_skeleton_skull', 'skeleton/wither_skeleton'],
  zombie: ['zombie_head', 'zombie/zombie'],
  creeper: ['creeper_head', 'creeper/creeper'],
  dragon: ['dragon_skull', 'enderdragon/dragon'],
  piglin: ['piglin_head', 'piglin/piglin'],
  player: ['player_head', 'player/wide/steve'],
};

const layer = (model: string, texture: string, tint?: number): SpecialLayer => ({
  model: `minecraft:${model}#main`,
  texture: `minecraft:entity/${texture}`,
  ...(tint !== undefined ? { tint } : {}),
});

const COPPER_GOLEM_POSES: Record<string, string> = {
  standing: 'copper_golem',
  sitting: 'copper_golem_sitting',
  running: 'copper_golem_running',
  star: 'copper_golem_star',
};

/** `minecraft:textures/entity/x.png` → `minecraft:entity/x` */
function textureFromPath(path: unknown): string {
  const [ns, p] = String(path ?? '').includes(':') ? String(path).split(':', 2) : ['minecraft', String(path ?? '')];
  return `${ns}:${p.replace(/^textures\//, '').replace(/\.png$/, '')}`;
}

/** Base colour plus pattern layers, drawn on `model` (and `part`) like BannerRenderer.submitPatterns. */
function patternLayers(model: string, part: string | undefined, dir: string, base: string, patterns: PatternLayer[]): SpecialLayer[] {
  return [{ pattern: 'base', color: base }, ...patterns].map((p) => ({
    model,
    texture: `minecraft:entity/${dir}/${p.pattern}`,
    tint: DYE[p.color] ?? DYE.white,
    ...(part ? { part } : {}),
  }));
}

/** Texture ids of all banner (or shield) patterns available in the store, without the base ones. */
export function availablePatterns(paths: string[], kind: 'banner' | 'shield'): string[] {
  const re = new RegExp(`^assets/minecraft/textures/entity/${kind}/([a-z0-9_]+)\.png$`);
  const skip = new Set(['base', 'banner_base', 'shield_base', 'shield_base_nopattern']);
  return paths.map((p) => re.exec(p)?.[1]).filter((p): p is string => !!p && !skip.has(p)).sort();
}

/** Pottery pattern textures (`*_pottery_pattern`) available in the store. */
export function availableSherds(paths: string[]): string[] {
  const re = /^assets\/minecraft\/textures\/entity\/decorated_pot\/([a-z0-9_]+_pottery_pattern)\.png$/;
  return paths.map((p) => re.exec(p)?.[1]).filter((p): p is string => !!p).sort();
}

/**
 * The model layers the game draws for a special item model, or undefined if it isn't supported
 * (those fall back to a cube with the particle texture).
 */
export function specialLayers(s: SpecialModel, opts: SpecialOptions = {}): SpecialLayer[] | undefined {
  const patterns = opts.patterns ?? [];
  switch (s.type) {
    case 'chest':
      return [layer('chest', `chest/${stripNs(s.texture) || 'normal'}`)];
    case 'shield':
      if (!patterns.length && !opts.baseColor) return [layer('shield', 'shield/shield_base_nopattern')];
      return [layer('shield', 'shield/shield_base'), ...patternLayers('minecraft:shield#main', 'plate', 'shield', opts.baseColor ?? 'white', patterns)];
    case 'banner':
      // Pole and flag use the banner base texture; the flag's colour is the tinted "base" pattern on top.
      return [
        layer('standing_banner', 'banner/banner_base'),
        { model: 'minecraft:standing_banner#flag', texture: 'minecraft:entity/banner/banner_base' },
        ...patternLayers('minecraft:standing_banner#flag', undefined, 'banner', stripNs(s.color) || 'white', patterns),
      ];
    case 'shulker_box':
      return [layer('shulker_box', `shulker/${stripNs(s.texture) || 'shulker'}`)];
    case 'decorated_pot':
      return [
        layer('decorated_pot_base', 'decorated_pot/decorated_pot_base'),
        ...POT_SIDES.map((part) => ({
          model: 'minecraft:decorated_pot_sides#main',
          texture: `minecraft:entity/decorated_pot/${opts.sherds?.[part] ?? 'decorated_pot_side'}`,
          part,
        })),
      ];
    case 'conduit':
      return [{ model: 'minecraft:conduit#shell', texture: 'minecraft:entity/conduit/base' }];
    case 'trident':
      return [layer('trident', 'trident/trident')];
    case 'copper_golem_statue': {
      const model = COPPER_GOLEM_POSES[stripNs(s.pose) || 'standing'];
      // CopperGolemStatueModel.setupAnim: root.y = 0, root.zRot = π
      return model ? [{ model: `minecraft:${model}#main`, texture: textureFromPath(s.texture), rootPose: { y: 0, zRot: Math.PI } }] : undefined;
    }
    case 'head': {
      const head = HEADS[stripNs(s.kind)];
      return head ? [layer(head[0], head[1])] : undefined;
    }
    case 'player_head':
      return [layer(...HEADS.player)];
    default:
      return undefined;
  }
}
