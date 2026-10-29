import { parseRL } from '../models/resourceLocation';
import blockSounds from './blockSounds.json';
import type { SoundEvent } from './soundsJson';

/**
 * Something in the game that plays a sound event: an item (incl. block items), a mob from the
 * catalog (by entity id, so all variants share it), or a block / entity the editor can't show.
 */
export interface SoundLink {
  kind: 'item' | 'mob' | 'block' | 'entity';
  id: string;
}

/** Sound event id → what plays it. */
export type SoundLinks = Map<string, SoundLink[]>;

const BLOCKS = blockSounds as { types: string[][]; blocks: Record<string, number[]>; extra: Record<string, string[]> };
const AIR = new Set(['minecraft:air', 'minecraft:cave_air', 'minecraft:void_air']);

/**
 * Sound events a vanilla block plays (break, step, place, hit, fall, plus open/close/click for doors,
 * buttons and the like), from scripts/DumpBlockSounds.java.
 */
export function blockSoundEvents(blockId: string): string[] {
  return [...new Set([...(BLOCKS.blocks[blockId] ?? []).flatMap((i) => BLOCKS.types[i]), ...(BLOCKS.extra[blockId] ?? [])])];
}

/**
 * Links sound events to what plays them. Blocks come from the game's sound types (so cobblestone gets
 * block.stone.*); otherwise by name: `entity.<entity>.*` to that mob, and events naming an item
 * (`item.trident.throw`, `block.chest.open`) to the item.
 */
export function linkSounds(
  events: SoundEvent[],
  itemIds: Iterable<string>,
  mobEntities: Iterable<string>,
  isEntity: (id: string) => boolean,
): SoundLinks {
  const items = new Set(itemIds);
  const mobs = new Set(mobEntities);
  const known = new Set(events.map((e) => e.id));
  const links: SoundLinks = new Map();
  const add = (event: string, link: SoundLink) => {
    if (!known.has(event)) return;
    const list = links.get(event) ?? [];
    if (!list.some((l) => l.id === link.id)) list.push(link);
    links.set(event, list);
  };

  for (const block of Object.keys(BLOCKS.blocks)) {
    // air has the stone sound type in code but never plays it
    if (AIR.has(block)) continue;
    const link: SoundLink = { kind: items.has(block) ? 'item' : 'block', id: block };
    for (const e of blockSoundEvents(block)) add(e, link);
  }
  for (const e of events) {
    const { ns, path } = parseRL(e.id);
    const parts = path.split('.');
    let mob: string | undefined;
    if (parts[0] === 'entity' && parts[1]) {
      // sound variants name the entity with a prefix or suffix: baby_cat, wolf_angry, copper_golem_oxidized
      const words = parts[1].replace(/^baby_/, '').split('_');
      for (let n = words.length; n > 0; n--) {
        const entity = `${ns}:${words.slice(0, n).join('_')}`;
        if (mobs.has(entity)) add(e.id, { kind: 'mob', id: (mob = entity) });
        else if (isEntity(entity)) add(e.id, { kind: 'entity', id: entity });
        else continue;
        break;
      }
    }
    if (parts[0] === 'music_disc' && items.has(`${ns}:music_disc_${parts[1]}`)) add(e.id, { kind: 'item', id: `${ns}:music_disc_${parts[1]}` });
    // a mob's own sounds don't belong to the item named after it (entity.chicken.* vs. raw chicken)
    for (const part of parts) {
      const id = `${ns}:${part}`;
      if (items.has(id) && id !== mob) add(e.id, { kind: 'item', id });
    }
  }
  return links;
}

/** Events linked to `id` (an item id or a mob's entity id), sorted by event id. */
export function eventsLinkedTo(events: SoundEvent[], links: SoundLinks, id: string): SoundEvent[] {
  return events.filter((e) => links.get(e.id)?.some((l) => l.id === id));
}
