/** A model layer drawn with one texture. Several layers make up a mob (e.g. sheep body + wool). */
export interface MobLayer {
  /** Key into entityModels.json, e.g. `minecraft:creeper#main`. */
  model: string;
  /** Texture id, e.g. `minecraft:entity/creeper/creeper`. */
  texture: string;
  /** Rendered fullbright on top (spider/enderman eyes). */
  emissive?: boolean;
}

/** Variant labels are translated (i18n key `mobs.variant.<name>`). */
export type MobVariant = 'temperate' | 'cold' | 'warm' | 'red' | 'brown' | 'snow' | 'tabby' | 'lucy' | 'steve' | 'alex';

export interface MobDef {
  id: string;
  /** Entity id used for the display name (`entity.minecraft.<entity>` in Minecraft's language files). */
  entity: string;
  variant?: MobVariant;
  /** Baby variant of the adult mob with this id (listed right after it). */
  babyOf?: string;
  layers: MobLayer[];
  /** Extra rotation (radians, x/y/z) per part name for a recognisable resting pose. */
  pose?: Record<string, [number, number, number]>;
}

const tex = (path: string) => `minecraft:entity/${path}`;
const one = (model: string, texture: string): MobLayer[] => [{ model: `minecraft:${model}#main`, texture: tex(texture) }];
const ZOMBIE_ARMS = { right_arm: [-Math.PI / 2, 0, 0], left_arm: [-Math.PI / 2, 0, 0] } as Record<string, [number, number, number]>;

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
  { id: 'wolf', entity: 'wolf', layers: one('wolf', 'wolf/wolf') },
  { id: 'cat', entity: 'cat', variant: 'tabby', layers: one('cat', 'cat/cat_tabby') },
  { id: 'ocelot', entity: 'ocelot', layers: one('ocelot', 'cat/ocelot') },
  { id: 'fox', entity: 'fox', layers: one('fox', 'fox/fox') },
  { id: 'fox_snow', entity: 'fox', variant: 'snow', layers: one('fox', 'fox/fox_snow') },
  { id: 'bee', entity: 'bee', layers: one('bee', 'bee/bee') },
  { id: 'axolotl', entity: 'axolotl', variant: 'lucy', layers: one('axolotl', 'axolotl/axolotl_lucy') },
  { id: 'frog', entity: 'frog', variant: 'temperate', layers: one('frog', 'frog/frog_temperate') },
  { id: 'allay', entity: 'allay', layers: one('allay', 'allay/allay') },
  { id: 'iron_golem', entity: 'iron_golem', layers: one('iron_golem', 'iron_golem/iron_golem') },
  { id: 'villager', entity: 'villager', layers: one('villager', 'villager/villager') },
  { id: 'player', entity: 'player', variant: 'steve', layers: one('player', 'player/wide/steve') },
  { id: 'player_slim', entity: 'player', variant: 'alex', layers: one('player_slim', 'player/slim/alex') },
];

/** Babies have their own models and textures since 26.x. */
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
  { id: 'wolf_baby', babyOf: 'wolf', entity: 'wolf', layers: one('wolf_baby', 'wolf/wolf_baby') },
  { id: 'cat_baby', babyOf: 'cat', entity: 'cat', variant: 'tabby', layers: one('cat_baby', 'cat/cat_tabby_baby') },
  { id: 'ocelot_baby', babyOf: 'ocelot', entity: 'ocelot', layers: one('ocelot_baby', 'cat/ocelot_baby') },
  { id: 'fox_baby', babyOf: 'fox', entity: 'fox', layers: one('fox_baby', 'fox/fox_baby') },
  { id: 'fox_snow_baby', babyOf: 'fox_snow', entity: 'fox', variant: 'snow', layers: one('fox_baby', 'fox/fox_snow_baby') },
  { id: 'bee_baby', babyOf: 'bee', entity: 'bee', layers: one('bee_baby', 'bee/bee_baby') },
  { id: 'axolotl_baby', babyOf: 'axolotl', entity: 'axolotl', variant: 'lucy', layers: one('axolotl_baby', 'axolotl/axolotl_lucy_baby') },
  { id: 'villager_baby', babyOf: 'villager', entity: 'villager', layers: one('villager_baby', 'villager/villager_baby') },
];

/** Every mob, each baby right after its adult. */
export const MOBS: MobDef[] = ADULTS.flatMap((m) => [m, ...BABIES.filter((b) => b.babyOf === m.id)]);

/** Mobs (and their layer) that use a texture, for the UV overlay in the texture view. */
export function mobsForTexture(textureId: string): { mob: MobDef; layer: MobLayer }[] {
  return MOBS.flatMap((mob) => mob.layers.filter((l) => l.texture === textureId).map((layer) => ({ mob, layer })));
}
