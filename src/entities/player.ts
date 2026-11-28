import type { AssetStore } from '../assets/AssetStore';
import { parseRL } from '../models/resourceLocation';
import type { MobDef, MobLayer } from './catalog';

/**
 * The player preview: which skin (one of the game's default skins, the pack's, or a picture you
 * load), a cape, an elytra, and items in the hands. Skins and capes aren't part of resource packs
 * (they come with the account), so pictures you load stay in this browser; the elytra, armour and
 * items come from the pack.
 */

export interface PlayerOptions {
  /** Texture id of the skin; the default is the mob's own (Steve or Alex). */
  skin?: string;
  /** Texture id of a cape (a picture you loaded). */
  cape?: string;
  elytra?: boolean;
  /** Item ids in the right (main) and left (off) hand. */
  mainHand?: string;
  offHand?: string;
}

/** The skin texture ids the game (and the pack) has for wide or slim arms. */
export function playerSkins(store: AssetStore, slim: boolean): string[] {
  const dir = `assets/minecraft/textures/entity/player/${slim ? 'slim' : 'wide'}/`;
  return store
    .list(dir)
    .filter((p) => p.endsWith('.png') && !p.slice(dir.length).includes('/'))
    .map((p) => `minecraft:entity/player/${slim ? 'slim' : 'wide'}/${p.slice(dir.length, -4)}`)
    .sort();
}

export const skinName = (id: string) => parseRL(id).path.split('/').pop()!.replace(/_/g, ' ');

/** The cape sits 2 px behind the body and swings out a little, as the game's cape layer does at rest. */
export const CAPE_TILT = (6 * Math.PI) / 180;

/**
 * The player's layers: skin, then the cape or the elytra. An elytra takes the chest slot (no
 * chestplate) and uses the cape's picture when there is a cape, like in the game.
 */
export function playerLayers(layers: MobLayer[], o: PlayerOptions, elytraTexture: string | undefined): MobLayer[] {
  const [main, ...rest] = layers;
  const out: MobLayer[] = [{ ...main, texture: o.skin ?? main.texture }, ...rest];
  const elytra = o.elytra && (o.cape ?? elytraTexture);
  if (elytra) return [...out.filter((l) => !l.model.endsWith('#chestplate')), { model: 'minecraft:elytra#main', texture: elytra, rootPose: { z: 2 } }];
  if (o.cape) out.push({ model: 'minecraft:player#cape', texture: o.cape, matchAspect: true });
  return out;
}

/** Whether a mob is a player (wide or slim arms). */
export const isPlayer = (mob: MobDef) => mob.entity === 'player';
export const isSlim = (mob: MobDef) => mob.layers[0]?.model.startsWith('minecraft:player_slim') ?? false;
