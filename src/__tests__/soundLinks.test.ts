import { describe, expect, it } from 'vitest';
import { blockSoundEvents, eventsLinkedTo, linkSounds } from '../sounds/soundLinks';
import type { SoundEvent } from '../sounds/soundsJson';

const event = (id: string): SoundEvent => ({ id: `minecraft:${id}`, files: [], refs: [], fromPack: false });
const events = [
  'block.stone.break',
  'block.stone.step',
  'block.gravel.break',
  'block.chest.open',
  'item.trident.throw',
  'entity.creeper.primed',
  'entity.chicken.ambient',
  'entity.ghast.scream',
  'entity.generic.hurt',
  'entity.wolf_angry.growl',
  'entity.baby_chicken.hurt',
  'music_disc.cat',
  'ui.button.click',
].map(event);
const items = ['minecraft:cobblestone', 'minecraft:gravel', 'minecraft:chest', 'minecraft:trident', 'minecraft:chicken', 'minecraft:music_disc_cat'];
const links = linkSounds(events, items, ['minecraft:creeper', 'minecraft:chicken', 'minecraft:wolf'], (id) => id === 'minecraft:ghast');
const ids = (eventId: string) => (links.get(`minecraft:${eventId}`) ?? []).map((l) => `${l.kind}:${l.id}`);

describe('sound links', () => {
  it('knows the sound type of vanilla blocks', () => {
    expect(blockSoundEvents('minecraft:cobblestone')).toContain('minecraft:block.stone.break');
    expect(blockSoundEvents('minecraft:gravel')).toContain('minecraft:block.gravel.step');
    expect(blockSoundEvents('minecraft:not_a_block')).toEqual([]);
    // doors, buttons … take their open/close/click sounds from their material
    expect(blockSoundEvents('minecraft:bamboo_door')).toContain('minecraft:block.bamboo_wood_door.open');
    expect(blockSoundEvents('minecraft:oak_fence_gate')).toContain('minecraft:block.fence_gate.close');
  });

  it('links block sounds to every block using them, as items where there is one', () => {
    expect(ids('block.stone.break')).toContain('item:minecraft:cobblestone');
    // stone bricks have no item in this test, so they stay a plain block
    expect(ids('block.stone.break')).toContain('block:minecraft:stone_bricks');
    expect(ids('block.gravel.break')).toContain('item:minecraft:gravel');
    expect(ids('block.gravel.break')).not.toContain('item:minecraft:cobblestone');
    expect(ids('block.stone.break')).not.toContain('block:minecraft:air');
  });

  it('links by name to items, mobs and other entities', () => {
    expect(ids('block.chest.open')).toContain('item:minecraft:chest');
    expect(ids('item.trident.throw')).toEqual(['item:minecraft:trident']);
    expect(ids('entity.creeper.primed')).toEqual(['mob:minecraft:creeper']);
    expect(ids('entity.ghast.scream')).toEqual(['entity:minecraft:ghast']);
    expect(ids('entity.generic.hurt')).toEqual([]);
    expect(ids('ui.button.click')).toEqual([]);
    expect(ids('music_disc.cat')).toEqual(['item:minecraft:music_disc_cat']);
  });

  it('links sound variants to their mob', () => {
    expect(ids('entity.wolf_angry.growl')).toEqual(['mob:minecraft:wolf']);
    expect(ids('entity.baby_chicken.hurt')).toEqual(['mob:minecraft:chicken']);
  });

  it("keeps a mob's sounds away from the item named after it", () => {
    expect(ids('entity.chicken.ambient')).toEqual(['mob:minecraft:chicken']);
  });

  it('finds the events of one item or mob', () => {
    expect(eventsLinkedTo(events, links, 'minecraft:cobblestone').map((e) => e.id)).toEqual([
      'minecraft:block.stone.break',
      'minecraft:block.stone.step',
    ]);
    expect(eventsLinkedTo(events, links, 'minecraft:creeper').map((e) => e.id)).toEqual(['minecraft:entity.creeper.primed']);
  });
});
