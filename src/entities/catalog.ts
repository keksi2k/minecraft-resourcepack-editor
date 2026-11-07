/** A model layer drawn with one texture. Several layers make up a mob (e.g. sheep body + wool). */
export interface MobLayer {
  /** Key into entityModels.json, e.g. `minecraft:creeper#main`. */
  model: string;
  /** Texture id, e.g. `minecraft:entity/creeper/creeper`. */
  texture: string;
  /** Rendered fullbright on top (spider/enderman eyes). */
  emissive?: boolean;
  /** Colour the texture is multiplied with (tropical fish). */
  tint?: number;
}

/** Variant labels are translated (i18n key `mobs.variant.<name>`). */
export type MobVariant =
  | 'temperate' | 'cold' | 'warm' | 'snow' | 'steve' | 'alex' | 'coral'
  | 'small' | 'medium' | 'large'
  | 'exposed' | 'weathered' | 'oxidized'
  | 'white' | 'orange' | 'magenta' | 'light_blue' | 'yellow' | 'lime' | 'pink' | 'gray' | 'light_gray'
  | 'cyan' | 'purple' | 'blue' | 'brown' | 'green' | 'red' | 'black' | 'gold'
  | 'tabby' | 'all_black' | 'british_shorthair' | 'calico' | 'jellie' | 'persian' | 'ragdoll' | 'siamese'
  | 'ashen' | 'chestnut' | 'rusty' | 'snowy' | 'spotted' | 'striped' | 'woods'
  | 'lucy' | 'wild' | 'creamy' | 'dark_brown' | 'red_blue' | 'yellow_blue'
  | 'white_splotched' | 'salt' | 'toast' | 'caerbannog'
  | 'aggressive' | 'lazy' | 'playful' | 'weak' | 'worried';

export interface MobDef {
  id: string;
  /** Entity id used for the display name (`entity.minecraft.<entity>` in Minecraft's language files). */
  entity: string;
  variant?: MobVariant;
  /** Variant label from Minecraft's language files, for variants the game names itself. */
  variantLang?: string;
  /** Baby variant of the adult mob with this id (listed right after it). */
  babyOf?: string;
  layers: MobLayer[];
  /** Extra rotation (radians, x/y/z) per part name for a recognisable resting pose. */
  pose?: Record<string, [number, number, number]>;
  /** Parts the game only shows in some states (a llama's chests, the illagers' free arms). */
  hidden?: string[];
}

const tex = (path: string) => `minecraft:entity/${path}`;
const one = (model: string, texture: string): MobLayer[] => [{ model: `minecraft:${model}#main`, texture: tex(texture) }];
const ZOMBIE_ARMS = { right_arm: [-Math.PI / 2, 0, 0], left_arm: [-Math.PI / 2, 0, 0] } as Record<string, [number, number, number]>;

/** The two arms illagers use instead of their crossed `arms` part while fighting. */
const FREE_ARMS = ['left_arm', 'right_arm'];
const CHESTS = ['left_chest', 'right_chest'];

/** Texture, variant label and, where it isn't `<texture>_baby`, the baby's texture. */
type VariantSpec = [texture: string, variant?: MobVariant, babyTexture?: string];

/**
 * A mob with its texture variants, each followed by its baby. The first variant gets the plain
 * entity id, the others `<entity>_<variant>`.
 */
function family(entity: string, variants: VariantSpec[], opts: { model?: string; baby?: string; hidden?: string[] } = {}): MobDef[] {
  const { model = entity, baby, hidden } = opts;
  const extra = hidden ? { hidden } : {};
  return variants.flatMap(([texture, variant, babyTexture], i) => {
    const id = i === 0 ? entity : `${entity}_${variant}`;
    const label = variant ? { variant } : {};
    const adult: MobDef = { id, entity, ...label, layers: one(model, texture), ...extra };
    if (!baby) return [adult];
    return [adult, { id: `${id}_baby`, babyOf: id, entity, ...label, layers: one(baby, babyTexture ?? `${texture}_baby`), ...extra }];
  });
}

/** Variants named after their texture file: `<prefix><variant>`. */
const named = (prefix: string, variants: readonly MobVariant[]): VariantSpec[] => variants.map((v) => [`${prefix}${v}`, v]);

const DYES = ['white', 'orange', 'magenta', 'light_blue', 'yellow', 'lime', 'pink', 'gray', 'light_gray', 'cyan', 'purple', 'blue', 'brown', 'green', 'red', 'black'] as const;

/** Tropical fish are tinted; these colours are one of the combinations found in the game. */
const FISH_BODY = 0xf9801d;
const FISH_PATTERN = 0xf9fffe;
const tropicalFish = (model: string, sheet: string, names: string[]): MobDef[] =>
  names.map((name, i) => ({
    id: `tropical_fish_${name}`,
    entity: 'tropical_fish',
    variantLang: `entity.minecraft.tropical_fish.type.${name}`,
    layers: [
      { model: `minecraft:${model}#main`, texture: tex(`fish/${sheet}`), tint: FISH_BODY },
      { model: `minecraft:${model}#pattern`, texture: tex(`fish/${sheet}_pattern_${i + 1}`), tint: FISH_PATTERN },
    ],
  }));

const copperGolem = (stage?: 'exposed' | 'weathered' | 'oxidized'): MobDef => {
  const suffix = stage ? `_${stage}` : '';
  return {
    id: `copper_golem${suffix}`,
    entity: 'copper_golem',
    ...(stage ? { variant: stage } : {}),
    layers: [
      { model: 'minecraft:copper_golem#main', texture: tex(`copper_golem/copper_golem${suffix}`) },
      { model: 'minecraft:copper_golem#main', texture: tex(`copper_golem/copper_golem_eyes${suffix}`), emissive: true },
    ],
  };
};

const ADULTS: MobDef[] = [
  { id: 'creeper', entity: 'creeper', layers: one('creeper', 'creeper/creeper') },
  { id: 'zombie', entity: 'zombie', layers: one('zombie', 'zombie/zombie'), pose: ZOMBIE_ARMS },
  { id: 'husk', entity: 'husk', layers: one('husk', 'zombie/husk'), pose: ZOMBIE_ARMS },
  {
    id: 'drowned',
    entity: 'drowned',
    layers: [
      { model: 'minecraft:drowned#main', texture: tex('zombie/drowned') },
      { model: 'minecraft:drowned#outer', texture: tex('zombie/drowned_outer_layer') },
    ],
    pose: ZOMBIE_ARMS,
  },
  { id: 'skeleton', entity: 'skeleton', layers: one('skeleton', 'skeleton/skeleton') },
  {
    id: 'stray',
    entity: 'stray',
    layers: [
      { model: 'minecraft:stray#main', texture: tex('skeleton/stray') },
      { model: 'minecraft:stray#outer', texture: tex('skeleton/stray_overlay') },
    ],
  },
  {
    id: 'bogged',
    entity: 'bogged',
    layers: [
      { model: 'minecraft:bogged#main', texture: tex('skeleton/bogged') },
      { model: 'minecraft:bogged#outer', texture: tex('skeleton/bogged_overlay') },
    ],
  },
  { id: 'wither_skeleton', entity: 'wither_skeleton', layers: one('wither_skeleton', 'skeleton/wither_skeleton') },
  {
    id: 'spider',
    entity: 'spider',
    layers: [
      { model: 'minecraft:spider#main', texture: tex('spider/spider') },
      { model: 'minecraft:spider#main', texture: tex('spider/spider_eyes'), emissive: true },
    ],
  },
  {
    id: 'cave_spider',
    entity: 'cave_spider',
    layers: [
      { model: 'minecraft:cave_spider#main', texture: tex('spider/cave_spider') },
      { model: 'minecraft:cave_spider#main', texture: tex('spider/spider_eyes'), emissive: true },
    ],
  },
  {
    id: 'enderman',
    entity: 'enderman',
    layers: [
      { model: 'minecraft:enderman#main', texture: tex('enderman/enderman') },
      { model: 'minecraft:enderman#main', texture: tex('enderman/enderman_eyes'), emissive: true },
    ],
  },
  {
    id: 'slime',
    entity: 'slime',
    layers: [
      { model: 'minecraft:slime#main', texture: tex('slime/slime') },
      { model: 'minecraft:slime#outer', texture: tex('slime/slime') },
    ],
  },
  { id: 'magma_cube', entity: 'magma_cube', layers: one('magma_cube', 'slime/magmacube') },
  { id: 'pig', entity: 'pig', variant: 'temperate', layers: one('pig', 'pig/pig_temperate') },
  { id: 'pig_cold', entity: 'pig', variant: 'cold', layers: one('cold_pig', 'pig/pig_cold') },
  { id: 'pig_warm', entity: 'pig', variant: 'warm', layers: one('pig', 'pig/pig_warm') },
  { id: 'cow', entity: 'cow', variant: 'temperate', layers: one('cow', 'cow/cow_temperate') },
  { id: 'cow_cold', entity: 'cow', variant: 'cold', layers: one('cold_cow', 'cow/cow_cold') },
  { id: 'cow_warm', entity: 'cow', variant: 'warm', layers: one('warm_cow', 'cow/cow_warm') },
  { id: 'mooshroom', entity: 'mooshroom', variant: 'red', layers: one('mooshroom', 'cow/mooshroom_red') },
  { id: 'mooshroom_brown', entity: 'mooshroom', variant: 'brown', layers: one('mooshroom', 'cow/mooshroom_brown') },
  {
    id: 'sheep',
    entity: 'sheep',
    layers: [
      { model: 'minecraft:sheep#main', texture: tex('sheep/sheep') },
      { model: 'minecraft:sheep#wool', texture: tex('sheep/sheep_wool') },
    ],
  },
  { id: 'chicken', entity: 'chicken', variant: 'temperate', layers: one('chicken', 'chicken/chicken_temperate') },
  { id: 'chicken_cold', entity: 'chicken', variant: 'cold', layers: one('cold_chicken', 'chicken/chicken_cold') },
  { id: 'chicken_warm', entity: 'chicken', variant: 'warm', layers: one('chicken', 'chicken/chicken_warm') },
  ...family('wolf', [['wolf/wolf'], ...named('wolf/wolf_', ['ashen', 'black', 'chestnut', 'rusty', 'snowy', 'spotted', 'striped', 'woods'])], { baby: 'wolf_baby' }),
  ...family('cat', named('cat/cat_', ['tabby', 'black', 'red', 'siamese', 'british_shorthair', 'calico', 'persian', 'ragdoll', 'white', 'jellie', 'all_black']), { baby: 'cat_baby' }),
  { id: 'ocelot', entity: 'ocelot', layers: one('ocelot', 'cat/ocelot') },
  { id: 'fox', entity: 'fox', layers: one('fox', 'fox/fox') },
  { id: 'fox_snow', entity: 'fox', variant: 'snow', layers: one('fox', 'fox/fox_snow') },
  { id: 'bee', entity: 'bee', layers: one('bee', 'bee/bee') },
  ...family('axolotl', named('axolotl/axolotl_', ['lucy', 'wild', 'gold', 'cyan', 'blue']), { baby: 'axolotl_baby' }),
  ...family('frog', named('frog/frog_', ['temperate', 'cold', 'warm'])),
  ...family('tadpole', [['tadpole/tadpole']]),
  { id: 'allay', entity: 'allay', layers: one('allay', 'allay/allay') },
  { id: 'iron_golem', entity: 'iron_golem', layers: one('iron_golem', 'iron_golem/iron_golem') },
  { id: 'villager', entity: 'villager', layers: one('villager', 'villager/villager') },
  ...family('zombie_villager', [['zombie_villager/zombie_villager']], { baby: 'zombie_villager_baby' }),
  ...family('wandering_trader', [['wandering_trader/wandering_trader']]),
  ...family('witch', [['witch/witch']]),
  ...family('pillager', [['illager/pillager']], { hidden: FREE_ARMS }),
  ...family('vindicator', [['illager/vindicator']], { hidden: FREE_ARMS }),
  ...family('evoker', [['illager/evoker']], { hidden: FREE_ARMS }),
  ...family('illusioner', [['illager/illusioner']], { hidden: FREE_ARMS }),
  ...family('ravager', [['illager/ravager']]),
  ...family('vex', [['illager/vex']]),
  ...family('giant', [['zombie/zombie']]),
  ...family('parched', [['skeleton/parched']]),
  ...family('blaze', [['blaze/blaze']]),
  {
    id: 'breeze',
    entity: 'breeze',
    layers: [
      { model: 'minecraft:breeze#main', texture: tex('breeze/breeze') },
      { model: 'minecraft:breeze#wind', texture: tex('breeze/breeze_wind') },
      { model: 'minecraft:breeze#eyes', texture: tex('breeze/breeze_eyes'), emissive: true },
    ],
  },
  ...family('ghast', [['ghast/ghast']]),
  ...family('happy_ghast', [['ghast/happy_ghast']], { baby: 'happy_ghast_baby' }),
  ...family('endermite', [['endermite/endermite']]),
  ...family('silverfish', [['silverfish/silverfish']]),
  {
    id: 'phantom',
    entity: 'phantom',
    layers: [
      { model: 'minecraft:phantom#main', texture: tex('phantom/phantom') },
      { model: 'minecraft:phantom#main', texture: tex('phantom/phantom_eyes'), emissive: true },
    ],
  },
  ...family('shulker', [['shulker/shulker'], ...named('shulker/shulker_', DYES)]),
  ...family('guardian', [['guardian/guardian']]),
  ...family('elder_guardian', [['guardian/guardian_elder']]),
  ...family('piglin', [['piglin/piglin']], { baby: 'piglin_baby' }),
  ...family('piglin_brute', [['piglin/piglin_brute']]),
  ...family('zombified_piglin', [['piglin/zombified_piglin']], { baby: 'zombified_piglin_baby' }),
  ...family('hoglin', [['hoglin/hoglin']], { baby: 'hoglin_baby' }),
  ...family('zoglin', [['hoglin/zoglin']], { baby: 'zoglin_baby' }),
  ...family('strider', [['strider/strider'], ['strider/strider_cold', 'cold']], { baby: 'strider_baby' }),
  {
    id: 'creaking',
    entity: 'creaking',
    layers: [
      { model: 'minecraft:creaking#main', texture: tex('creaking/creaking') },
      { model: 'minecraft:creaking#eyes', texture: tex('creaking/creaking_eyes'), emissive: true },
    ],
  },
  {
    id: 'warden',
    entity: 'warden',
    layers: [
      { model: 'minecraft:warden#main', texture: tex('warden/warden') },
      { model: 'minecraft:warden#bioluminescent', texture: tex('warden/warden_bioluminescent_layer'), emissive: true },
      { model: 'minecraft:warden#pulsating_spots', texture: tex('warden/warden_pulsating_spots_1'), emissive: true },
      { model: 'minecraft:warden#pulsating_spots', texture: tex('warden/warden_pulsating_spots_2'), emissive: true },
      { model: 'minecraft:warden#heart', texture: tex('warden/warden_heart'), emissive: true },
    ],
  },
  ...family('wither', [['wither/wither']]),
  {
    id: 'ender_dragon',
    entity: 'ender_dragon',
    layers: [
      { model: 'minecraft:ender_dragon#main', texture: tex('enderdragon/dragon') },
      { model: 'minecraft:ender_dragon#main', texture: tex('enderdragon/dragon_eyes'), emissive: true },
    ],
  },
  {
    id: 'sulfur_cube',
    entity: 'sulfur_cube',
    layers: [
      { model: 'minecraft:sulfur_cube#inner', texture: tex('sulfur_cube/sulfur_cube_inner') },
      { model: 'minecraft:sulfur_cube#main', texture: tex('sulfur_cube/sulfur_cube_outer') },
    ],
  },
  {
    id: 'sulfur_cube_small',
    entity: 'sulfur_cube',
    variant: 'small',
    layers: [
      { model: 'minecraft:sulfur_cube_small#inner', texture: tex('sulfur_cube/sulfur_cube_inner_small') },
      { model: 'minecraft:sulfur_cube_small#main', texture: tex('sulfur_cube/sulfur_cube_outer_small') },
    ],
  },
  ...family('horse', [...named('horse/horse_', ['white', 'creamy', 'chestnut', 'brown', 'black', 'gray']), ['horse/horse_darkbrown', 'dark_brown']], { baby: 'horse_baby' }),
  ...family('donkey', [['horse/donkey']], { baby: 'donkey_baby', hidden: CHESTS }),
  ...family('mule', [['horse/mule']], { baby: 'mule_baby', hidden: CHESTS }),
  ...family('skeleton_horse', [['horse/horse_skeleton']], { baby: 'skeleton_horse_baby' }),
  ...family('zombie_horse', [['horse/horse_zombie']], { baby: 'zombie_horse_baby' }),
  ...family('camel', [['camel/camel']], { baby: 'camel_baby' }),
  ...family('camel_husk', [['camel/camel_husk']], { model: 'camel' }),
  ...family('llama', named('llama/llama_', ['creamy', 'white', 'brown', 'gray']), { baby: 'llama_baby', hidden: CHESTS }),
  {
    id: 'trader_llama',
    entity: 'trader_llama',
    layers: [
      { model: 'minecraft:trader_llama#main', texture: tex('llama/llama_creamy') },
      { model: 'minecraft:llama#decor', texture: tex('equipment/llama_body/trader_llama') },
    ],
    hidden: CHESTS,
  },
  {
    id: 'trader_llama_baby',
    babyOf: 'trader_llama',
    entity: 'trader_llama',
    layers: [
      { model: 'minecraft:trader_llama_baby#main', texture: tex('llama/llama_creamy_baby') },
      { model: 'minecraft:llama_baby#decor', texture: tex('equipment/llama_body/trader_llama_baby') },
    ],
    hidden: CHESTS,
  },
  ...family('rabbit', named('rabbit/rabbit_', ['brown', 'white', 'black', 'white_splotched', 'gold', 'salt', 'toast', 'caerbannog']), { baby: 'rabbit_baby' }),
  ...family(
    'panda',
    [
      ['panda/panda', undefined, 'panda/panda_baby'],
      ...(['aggressive', 'brown', 'lazy', 'playful', 'weak', 'worried'] as const).map((v): VariantSpec => [`panda/panda_${v}`, v, `panda/${v}_panda_baby`]),
    ],
    { baby: 'panda_baby' },
  ),
  ...family('polar_bear', [['bear/polarbear']], { baby: 'polar_bear_baby' }),
  ...family('goat', [['goat/goat']], { baby: 'goat_baby' }),
  ...family('armadillo', [['armadillo/armadillo']], { baby: 'armadillo_baby' }),
  ...family('sniffer', [['sniffer/sniffer', undefined, 'sniffer/snifflet']], { baby: 'sniffer_baby' }),
  ...family('turtle', [['turtle/turtle']], { baby: 'turtle_baby', hidden: ['egg_belly'] }),
  ...family('bat', [['bat/bat']]),
  ...family('parrot', [...named('parrot/parrot_', ['red_blue', 'blue', 'green', 'yellow_blue']), ['parrot/parrot_grey', 'gray']]),
  ...family('dolphin', [['dolphin/dolphin']], { baby: 'dolphin_baby' }),
  ...family('squid', [['squid/squid']], { baby: 'squid_baby' }),
  ...family('glow_squid', [['squid/glow_squid']], { baby: 'glow_squid_baby' }),
  ...family('nautilus', [['nautilus/nautilus']], { baby: 'nautilus_baby' }),
  { id: 'zombie_nautilus', entity: 'zombie_nautilus', layers: one('zombie_nautilus', 'nautilus/zombie_nautilus') },
  { id: 'zombie_nautilus_coral', entity: 'zombie_nautilus', variant: 'coral', layers: one('zombie_nautilus_coral', 'nautilus/zombie_nautilus_coral') },
  ...family('cod', [['fish/cod']]),
  { id: 'salmon', entity: 'salmon', variant: 'medium', layers: one('salmon', 'fish/salmon') },
  { id: 'salmon_small', entity: 'salmon', variant: 'small', layers: one('salmon_small', 'fish/salmon') },
  { id: 'salmon_large', entity: 'salmon', variant: 'large', layers: one('salmon_large', 'fish/salmon') },
  { id: 'pufferfish', entity: 'pufferfish', variant: 'large', layers: one('pufferfish_big', 'fish/pufferfish') },
  { id: 'pufferfish_medium', entity: 'pufferfish', variant: 'medium', layers: one('pufferfish_medium', 'fish/pufferfish') },
  { id: 'pufferfish_small', entity: 'pufferfish', variant: 'small', layers: one('pufferfish_small', 'fish/pufferfish') },
  ...tropicalFish('tropical_fish_small', 'tropical_a', ['kob', 'sunstreak', 'snooper', 'dasher', 'brinely', 'spotty']),
  ...tropicalFish('tropical_fish_large', 'tropical_b', ['flopper', 'stripey', 'glitter', 'blockfish', 'betty', 'clayfish']),
  copperGolem(),
  copperGolem('exposed'),
  copperGolem('weathered'),
  copperGolem('oxidized'),
  ...family('snow_golem', [['snow_golem/snow_golem']]),
  { id: 'player', entity: 'player', variant: 'steve', layers: one('player', 'player/wide/steve') },
  { id: 'player_slim', entity: 'player', variant: 'alex', layers: one('player_slim', 'player/slim/alex') },
];

/** Babies have their own models and textures since 26.x. Babies of a `family` are listed there. */
const BABIES: MobDef[] = [
  { id: 'zombie_baby', babyOf: 'zombie', entity: 'zombie', layers: one('zombie_baby', 'zombie/zombie_baby'), pose: ZOMBIE_ARMS },
  { id: 'husk_baby', babyOf: 'husk', entity: 'husk', layers: one('husk_baby', 'zombie/husk_baby'), pose: ZOMBIE_ARMS },
  {
    id: 'drowned_baby',
    babyOf: 'drowned',
    entity: 'drowned',
    layers: [
      { model: 'minecraft:drowned_baby#main', texture: tex('zombie/drowned_baby') },
      { model: 'minecraft:drowned_baby#outer', texture: tex('zombie/drowned_outer_layer_baby') },
    ],
    pose: ZOMBIE_ARMS,
  },
  { id: 'pig_baby', babyOf: 'pig', entity: 'pig', variant: 'temperate', layers: one('pig_baby', 'pig/pig_temperate_baby') },
  { id: 'pig_cold_baby', babyOf: 'pig_cold', entity: 'pig', variant: 'cold', layers: one('pig_baby', 'pig/pig_cold_baby') },
  { id: 'pig_warm_baby', babyOf: 'pig_warm', entity: 'pig', variant: 'warm', layers: one('pig_baby', 'pig/pig_warm_baby') },
  { id: 'cow_baby', babyOf: 'cow', entity: 'cow', variant: 'temperate', layers: one('cow_baby', 'cow/cow_temperate_baby') },
  { id: 'cow_cold_baby', babyOf: 'cow_cold', entity: 'cow', variant: 'cold', layers: one('cold_cow_baby', 'cow/cow_cold_baby') },
  { id: 'cow_warm_baby', babyOf: 'cow_warm', entity: 'cow', variant: 'warm', layers: one('warm_cow_baby', 'cow/cow_warm_baby') },
  { id: 'mooshroom_baby', babyOf: 'mooshroom', entity: 'mooshroom', variant: 'red', layers: one('mooshroom_baby', 'cow/mooshroom_red_baby') },
  { id: 'mooshroom_brown_baby', babyOf: 'mooshroom_brown', entity: 'mooshroom', variant: 'brown', layers: one('mooshroom_baby', 'cow/mooshroom_brown_baby') },
  {
    id: 'sheep_baby',
    babyOf: 'sheep',
    entity: 'sheep',
    layers: [
      { model: 'minecraft:sheep_baby#main', texture: tex('sheep/sheep_baby') },
      { model: 'minecraft:sheep_baby#wool', texture: tex('sheep/sheep_wool_baby') },
    ],
  },
  { id: 'chicken_baby', babyOf: 'chicken', entity: 'chicken', variant: 'temperate', layers: one('chicken_baby', 'chicken/chicken_temperate_baby') },
  { id: 'chicken_cold_baby', babyOf: 'chicken_cold', entity: 'chicken', variant: 'cold', layers: one('chicken_baby', 'chicken/chicken_cold_baby') },
  { id: 'chicken_warm_baby', babyOf: 'chicken_warm', entity: 'chicken', variant: 'warm', layers: one('chicken_baby', 'chicken/chicken_warm_baby') },
  { id: 'ocelot_baby', babyOf: 'ocelot', entity: 'ocelot', layers: one('ocelot_baby', 'cat/ocelot_baby') },
  { id: 'fox_baby', babyOf: 'fox', entity: 'fox', layers: one('fox_baby', 'fox/fox_baby') },
  { id: 'fox_snow_baby', babyOf: 'fox_snow', entity: 'fox', variant: 'snow', layers: one('fox_baby', 'fox/fox_snow_baby') },
  { id: 'bee_baby', babyOf: 'bee', entity: 'bee', layers: one('bee_baby', 'bee/bee_baby') },
  { id: 'villager_baby', babyOf: 'villager', entity: 'villager', layers: one('villager_baby', 'villager/villager_baby') },
];

/** Every mob, each baby right after its adult. */
export const MOBS: MobDef[] = ADULTS.flatMap((m) => (m.babyOf ? [m] : [m, ...BABIES.filter((b) => b.babyOf === m.id)]));

/** Mobs (and their layer) that use a texture, for the UV overlay in the texture view. */
export function mobsForTexture(textureId: string): { mob: MobDef; layer: MobLayer }[] {
  return MOBS.flatMap((mob) => mob.layers.filter((l) => l.texture === textureId).map((layer) => ({ mob, layer })));
}
