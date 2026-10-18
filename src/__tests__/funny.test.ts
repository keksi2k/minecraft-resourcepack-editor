import { describe, expect, it } from 'vitest';
import { AssetStore } from '../assets/AssetStore';
import { colorizePixels } from '../funny/colorize';
import { applySoundShuffle, derange, planSoundShuffle, pngSize, rng, soundGroup, textureGroups } from '../funny/shuffle';
import type { SoundEvent } from '../sounds/soundsJson';

/** Just enough of a PNG for its header to be read. */
function png(w: number, h: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  return b;
}

const tex = (p: string) => `assets/minecraft/textures/${p}.png`;

describe('funny shuffle', () => {
  it('is deterministic per seed', () => {
    const a = rng('abc');
    const b = rng('abc');
    const c = rng('abd');
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('pairs every item with a different one', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    const m = derange(items, rng('x'));
    expect([...m.keys()].sort()).toEqual(items);
    expect([...m.values()].sort()).toEqual(items);
    for (const [k, v] of m) expect(k).not.toBe(v);
    expect(derange(['solo'], rng('x')).size).toBe(0);
  });

  it('reads PNG sizes', () => {
    expect(pngSize(png(16, 32))).toEqual([16, 32]);
    expect(pngSize(new Uint8Array(10))).toBeUndefined();
  });

  it('groups textures by kind, size and animation', () => {
    const vanilla = new Map<string, Uint8Array>([
      [tex('item/sword'), png(16, 16)],
      [tex('item/carrot'), png(16, 16)],
      [tex('item/big'), png(32, 32)],
      [tex('block/stone'), png(16, 16)],
      [tex('block/dirt'), png(16, 16)],
      [tex('block/water'), png(16, 512)],
      [`${tex('block/water')}.mcmeta`, new Uint8Array()],
      [tex('block/lava'), png(16, 512)],
      [`${tex('block/lava')}.mcmeta`, new Uint8Array()],
      [tex('block/tall'), png(16, 512)],
      [tex('gui/button'), png(16, 16)],
      [tex('gui/slot'), png(16, 16)],
      [tex('entity/chest/normal'), png(64, 64)],
      [tex('entity/chest/christmas'), png(64, 64)],
      [tex('entity/bed/red'), png(64, 64)],
      [tex('entity/bed/blue'), png(64, 64)],
    ]);
    const store = new AssetStore(vanilla, new Map());
    const groups = (opts: Parameters<typeof textureGroups>[1]) => textureGroups(store, opts).map((g) => g.map((p) => p.split('/textures/')[1].slice(0, -4)).sort()).sort();

    expect(groups({ scopes: ['item', 'block'] })).toEqual([
      ['block/dirt', 'block/stone'],
      ['block/lava', 'block/water'],
      ['item/carrot', 'item/sword'],
    ]);
    // entities stay in their folder unless in chaos mode
    expect(groups({ scopes: ['entity'] })).toEqual([
      ['entity/bed/blue', 'entity/bed/red'],
      ['entity/chest/christmas', 'entity/chest/normal'],
    ]);
    expect(groups({ scopes: ['entity'], mobChaos: true })).toEqual([['entity/bed/blue', 'entity/bed/red', 'entity/chest/christmas', 'entity/chest/normal']]);
    // the user's own edits are left alone
    store.setEdit(tex('item/sword'), png(16, 16));
    expect(groups({ scopes: ['item'], skip: (p) => store.source(p) === 'edited' })).toEqual([]);
  });

  it('groups sound events', () => {
    expect(soundGroup('minecraft:entity.cow.ambient', 'similar')).toBe('entity.ambient');
    expect(soundGroup('minecraft:entity.cow.ambient', 'category')).toBe('entity');
    expect(soundGroup('minecraft:entity.cow.ambient', 'wild')).toBe('all');
    expect(soundGroup('minecraft:music.game', 'wild')).toBe('music');
    expect(soundGroup('minecraft:music_disc.cat', 'similar')).toBe('music');
  });

  it('redirects events to other sounds in sounds.json', () => {
    const ev = (id: string, files: string[], extra: Partial<SoundEvent> = {}): SoundEvent => ({
      id,
      files: files.map((name) => ({ name, path: '', key: '' })),
      refs: [],
      fromPack: false,
      ...extra,
    });
    const events = [
      ev('minecraft:entity.cow.ambient', ['minecraft:mob/cow/say1'], { subtitle: 'subtitles.entity.cow.ambient' }),
      ev('minecraft:entity.ghast.ambient', ['minecraft:mob/ghast/moan1', 'minecraft:mob/ghast/moan2']),
      ev('minecraft:block.stone.step', ['minecraft:step/stone1']),
      ev('minecraft:entity.pig.ambient', []),
      ev('minecraft:music.game', ['minecraft:music/game/calm1']),
      ev('minecraft:music.menu', ['minecraft:music/menu/menu1']),
    ];
    const plan = planSoundShuffle(events, 'similar', rng('s'));
    expect(Object.fromEntries(plan)).toEqual({
      'minecraft:entity.cow.ambient': 'minecraft:entity.ghast.ambient',
      'minecraft:entity.ghast.ambient': 'minecraft:entity.cow.ambient',
      'minecraft:music.game': 'minecraft:music.menu',
      'minecraft:music.menu': 'minecraft:music.game',
    });
    const json = applySoundShuffle({ minecraft: { 'block.stone.step': { sounds: ['custom/x'] } } }, plan, events).minecraft;
    expect(json['entity.cow.ambient']).toEqual({
      replace: true,
      subtitle: 'subtitles.entity.cow.ambient',
      sounds: ['minecraft:mob/ghast/moan1', 'minecraft:mob/ghast/moan2'],
    });
    expect(json['music.game'].sounds).toEqual([{ name: 'minecraft:music/menu/menu1', stream: true }]);
    // untouched entries of the pack are kept
    expect(json['block.stone.step']).toEqual({ sounds: ['custom/x'] });
    expect(planSoundShuffle(events, 'wild', rng('s'), (id) => id.includes('cow')).has('minecraft:entity.cow.ambient')).toBe(false);
  });
});

describe('funny colours', () => {
  const image = () => new Uint8ClampedArray([200, 50, 50, 255, 128, 128, 128, 255, 10, 20, 30, 0, 0, 200, 0, 128]);

  it('keeps alpha and transparent pixels', () => {
    for (const style of ['hue', 'rainbow', 'neon', 'invert'] as const) {
      const px = image();
      colorizePixels(px, 2, 2, style, 1, rng('c'));
      expect([px[3], px[7], px[11], px[15]]).toEqual([255, 255, 0, 128]);
      expect([px[8], px[9], px[10]]).toEqual([10, 20, 30]);
      expect(px).not.toEqual(image());
    }
  });

  it('makes grey pixels colourful', () => {
    const px = image();
    colorizePixels(px, 2, 2, 'hue', 1, rng('c'));
    const [r, g, b] = [px[4], px[5], px[6]];
    expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeGreaterThan(50);
  });

  it('inverts and blends by strength', () => {
    const px = image();
    colorizePixels(px, 2, 2, 'invert', 1, rng('c'));
    expect([px[0], px[1], px[2]]).toEqual([55, 205, 205]);
    const half = image();
    colorizePixels(half, 2, 2, 'invert', 0.5, rng('c'));
    expect([half[0], half[1], half[2]]).toEqual([128, 128, 128]);
  });

  it('is deterministic per seed', () => {
    const a = image();
    const b = image();
    colorizePixels(a, 2, 2, 'rainbow', 1, rng('same'));
    colorizePixels(b, 2, 2, 'rainbow', 1, rng('same'));
    expect(a).toEqual(b);
  });
});
