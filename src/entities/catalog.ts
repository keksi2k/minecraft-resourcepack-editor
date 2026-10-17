/** A model layer drawn with one texture. Several layers make up a mob (e.g. sheep body + wool). */
export interface MobLayer {
  /** Key into entityModels.json, e.g. `minecraft:creeper#main`. */
  model: string;
  /** Texture id, e.g. `minecraft:entity/creeper/creeper`. */
  texture: string;
  /** Rendered fullbright on top (spider/enderman eyes). */
  emissive?: boolean;
}

export interface MobDef {
  id: string;
  /** Entity id used for the display name (`entity.minecraft.<entity>`). */
  entity: string;
  variant?: string;
  layers: MobLayer[];
  /** Extra rotation (radians, x/y/z) per part name for a recognisable resting pose. */
  pose?: Record<string, [number, number, number]>;
}

const tex = (path: string) => `minecraft:entity/${path}`;
const one = (model: string, texture: string): MobLayer[] => [{ model: `minecraft:${model}#main`, texture: tex(texture) }];
const ZOMBIE_ARMS = { right_arm: [-Math.PI / 2, 0, 0], left_arm: [-Math.PI / 2, 0, 0] } as Record<string, [number, number, number]>;

export const MOBS: MobDef[] = [
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
  { id: 'pig', entity: 'pig', variant: 'Gemäßigt', layers: one('pig', 'pig/pig_temperate') },
  { id: 'pig_cold', entity: 'pig', variant: 'Kalt', layers: one('cold_pig', 'pig/pig_cold') },
  { id: 'pig_warm', entity: 'pig', variant: 'Warm', layers: one('pig', 'pig/pig_warm') },
  { id: 'cow', entity: 'cow', variant: 'Gemäßigt', layers: one('cow', 'cow/cow_temperate') },
  { id: 'cow_cold', entity: 'cow', variant: 'Kalt', layers: one('cold_cow', 'cow/cow_cold') },
  { id: 'cow_warm', entity: 'cow', variant: 'Warm', layers: one('warm_cow', 'cow/cow_warm') },
  { id: 'mooshroom', entity: 'mooshroom', variant: 'Rot', layers: one('mooshroom', 'cow/mooshroom_red') },
  { id: 'mooshroom_brown', entity: 'mooshroom', variant: 'Braun', layers: one('mooshroom', 'cow/mooshroom_brown') },
  {
    id: 'sheep',
    entity: 'sheep',
    layers: [
      { model: 'minecraft:sheep#main', texture: tex('sheep/sheep') },
      { model: 'minecraft:sheep#wool', texture: tex('sheep/sheep_wool') },
    ],
  },
  { id: 'chicken', entity: 'chicken', variant: 'Gemäßigt', layers: one('chicken', 'chicken/chicken_temperate') },
  { id: 'chicken_cold', entity: 'chicken', variant: 'Kalt', layers: one('cold_chicken', 'chicken/chicken_cold') },
  { id: 'chicken_warm', entity: 'chicken', variant: 'Warm', layers: one('chicken', 'chicken/chicken_warm') },
  { id: 'wolf', entity: 'wolf', layers: one('wolf', 'wolf/wolf') },
  { id: 'cat', entity: 'cat', variant: 'Tabby', layers: one('cat', 'cat/cat_tabby') },
  { id: 'ocelot', entity: 'ocelot', layers: one('ocelot', 'cat/ocelot') },
  { id: 'fox', entity: 'fox', layers: one('fox', 'fox/fox') },
  { id: 'fox_snow', entity: 'fox', variant: 'Schnee', layers: one('fox', 'fox/fox_snow') },
  { id: 'bee', entity: 'bee', layers: one('bee', 'bee/bee') },
  { id: 'axolotl', entity: 'axolotl', variant: 'Lucy', layers: one('axolotl', 'axolotl/axolotl_lucy') },
  { id: 'frog', entity: 'frog', variant: 'Gemäßigt', layers: one('frog', 'frog/frog_temperate') },
  { id: 'allay', entity: 'allay', layers: one('allay', 'allay/allay') },
  { id: 'iron_golem', entity: 'iron_golem', layers: one('iron_golem', 'iron_golem/iron_golem') },
  { id: 'villager', entity: 'villager', layers: one('villager', 'villager/villager') },
  { id: 'player', entity: 'player', variant: 'Steve (breit)', layers: one('player', 'player/wide/steve') },
  { id: 'player_slim', entity: 'player', variant: 'Alex (schmal)', layers: one('player_slim', 'player/slim/alex') },
];

/** Mobs (and their layer) that use a texture, for the UV overlay in the texture view. */
export function mobsForTexture(textureId: string): { mob: MobDef; layer: MobLayer }[] {
  return MOBS.flatMap((mob) => mob.layers.filter((l) => l.texture === textureId).map((layer) => ({ mob, layer })));
}
