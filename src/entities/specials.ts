import { stripNs, type SpecialModel } from '../models/itemDefinition';

/** One model layer of a special item model, drawn with one texture. */
export interface SpecialLayer {
  /** Key into entityModels.json. */
  model: string;
  /** Texture id, e.g. `minecraft:entity/chest/normal`. */
  texture: string;
  tint?: number;
}

/** DyeColor texture colours, used to tint banner flags. */
const DYE: Record<string, number> = {
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

/**
 * The model layers the game draws for a special item model, or undefined if it isn't supported
 * (those fall back to a cube with the particle texture).
 */
export function specialLayers(s: SpecialModel): SpecialLayer[] | undefined {
  switch (s.type) {
    case 'chest':
      return [layer('chest', `chest/${stripNs(s.texture) || 'normal'}`)];
    case 'shield':
      return [layer('shield', 'shield/shield_base_nopattern')];
    case 'banner': {
      const color = DYE[stripNs(s.color)] ?? DYE.white;
      // Pole and flag use the banner base texture; the flag's colour is the tinted "base" pattern on top.
      return [
        layer('standing_banner', 'banner/banner_base'),
        { model: 'minecraft:standing_banner#flag', texture: 'minecraft:entity/banner/banner_base' },
        { model: 'minecraft:standing_banner#flag', texture: 'minecraft:entity/banner/base', tint: color },
      ];
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
