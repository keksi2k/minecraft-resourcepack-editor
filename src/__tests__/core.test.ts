import { describe, expect, it } from 'vitest';
import { AssetStore, parseLenientJson } from '../assets/AssetStore';
import { colorValue, resolveItemModel, tintColor } from '../models/itemDefinition';
import { gameNames, listItems } from '../models/items';
import { modelTextures, resolveModel } from '../models/modelResolver';
import { findPackRoot, parsePackMeta, textComponentToString } from '../pack/loadPack';
import { mergeSounds, soundsForItem } from '../sounds/soundsJson';

const enc = (v: unknown) => new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v));
const files = (o: Record<string, unknown>) => new Map(Object.entries(o).map(([k, v]) => [k, enc(v)]));

const vanilla = files({
  'assets/minecraft/models/item/generated.json': { parent: 'builtin/generated', display: { ground: { scale: [0.5, 0.5, 0.5] } } },
  'assets/minecraft/models/item/handheld.json': { parent: 'item/generated', display: { thirdperson_righthand: { rotation: [0, -90, 55] } } },
  'assets/minecraft/models/item/diamond_sword.json': { parent: 'minecraft:item/handheld', textures: { layer0: 'minecraft:item/diamond_sword' } },
  'assets/minecraft/models/block/block.json': { display: { gui: { rotation: [30, 225, 0], scale: [0.625, 0.625, 0.625] } } },
  'assets/minecraft/models/block/cube_all.json': {
    parent: 'block/block',
    textures: { particle: '#all' },
    elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: { texture: '#all' }, north: { texture: '#all' } } }],
  },
  'assets/minecraft/models/block/stone.json': { parent: 'block/cube_all', textures: { all: 'block/stone' } },
  'assets/minecraft/items/diamond_sword.json': { model: { type: 'minecraft:model', model: 'minecraft:item/diamond_sword' } },
  'assets/minecraft/items/stone.json': { model: { type: 'model', model: 'block/stone' } },
  'assets/minecraft/textures/item/diamond_sword.png': 'png',
  'assets/minecraft/textures/block/stone.png': 'png',
  'assets/minecraft/lang/en_us.json': { 'item.minecraft.diamond_sword': 'Diamond Sword', 'block.minecraft.stone': 'Stone' },
});

describe('parseLenientJson', () => {
  it('accepts BOM, comments and trailing commas', () => {
    expect(parseLenientJson('﻿{ // hi\n "a": [1, 2,], /* x */ "b": "http://x",}')).toEqual({ a: [1, 2], b: 'http://x' });
  });
});

describe('AssetStore layering', () => {
  it('prefers edits over pack over vanilla, and null edits reveal vanilla', () => {
    const s = new AssetStore(files({ a: 'v', b: 'v' }), files({ a: 'p' }));
    expect(s.source('a')).toBe('pack');
    s.setEdit('a', enc('e'));
    expect(s.source('a')).toBe('edited');
    s.setEdit('a', null);
    expect(s.source('a')).toBe('vanilla');
    expect(s.exportFiles().has('a')).toBe(false);
    s.setEdit('b', enc('e'));
    expect([...s.exportFiles().keys()]).toEqual(['b']);
    expect(s.rev('a')).toBe(2);
  });
});

describe('model resolver', () => {
  const store = new AssetStore(vanilla, new Map());
  it('resolves generated items through the parent chain', () => {
    const m = resolveModel(store, 'item/diamond_sword');
    expect(m.kind).toBe('generated');
    expect(m.chain).toEqual(['minecraft:item/diamond_sword', 'minecraft:item/handheld', 'minecraft:item/generated']);
    expect(m.layers).toEqual(['minecraft:item/diamond_sword']);
    expect(m.display.thirdperson_righthand?.rotation).toEqual([0, -90, 55]);
    expect(m.display.ground?.scale).toEqual([0.5, 0.5, 0.5]);
  });
  it('resolves #texture variables and inherited elements', () => {
    const m = resolveModel(store, 'minecraft:block/stone');
    expect(m.kind).toBe('elements');
    expect(m.textures.all).toBe('minecraft:block/stone');
    expect(m.textures.particle).toBe('minecraft:block/stone');
    expect(modelTextures(m)).toEqual(['minecraft:block/stone']);
    expect(m.display.gui?.rotation).toEqual([30, 225, 0]);
  });
  it('flags missing models', () => {
    expect(resolveModel(store, 'item/nope').kind).toBe('missing');
  });
});

describe('item definitions', () => {
  it('handles composite, condition and special', () => {
    const def = {
      type: 'composite',
      models: [
        { type: 'condition', property: 'using_item', on_false: { type: 'model', model: 'item/bow' }, on_true: { type: 'model', model: 'item/bow_pulling_0' } },
        { type: 'special', base: 'item/chest', model: { type: 'minecraft:chest', texture: 'minecraft:normal' } },
      ],
    };
    expect(resolveItemModel(def)).toEqual([
      { model: 'minecraft:item/bow', tints: [] },
      { model: 'minecraft:item/chest', tints: [], special: 'chest' },
    ]);
  });
  it('honours display_context selects', () => {
    const def = {
      type: 'select',
      property: 'minecraft:display_context',
      cases: [{ when: ['gui', 'ground', 'fixed'], model: { type: 'model', model: 'item/trident' } }],
      fallback: { type: 'special', base: 'item/trident_in_hand', model: { type: 'trident' } },
    };
    expect(resolveItemModel(def, 'gui')[0].model).toBe('minecraft:item/trident');
    expect(resolveItemModel(def, 'firstperson_righthand')[0].model).toBe('minecraft:item/trident_in_hand');
  });
  it('decodes tint colours', () => {
    expect(colorValue(-12012264)).toBe(0x48b518);
    expect(colorValue([1, 0, 0.5])).toBe(0xff0080);
    expect(tintColor({ type: 'minecraft:dye', default: -6265536 })).toBe(-6265536 & 0xffffff);
  });
});

describe('listItems', () => {
  it('lists items with names and pack source', () => {
    const pack = files({ 'assets/minecraft/textures/block/stone.png': 'png2' });
    const items = listItems(new AssetStore(vanilla, pack));
    expect(items.map((i) => [i.id, i.name, i.source])).toEqual([
      ['minecraft:diamond_sword', 'Diamond Sword', 'vanilla'],
      ['minecraft:stone', 'Stone', 'pack'],
    ]);
  });
});

describe('gameNames', () => {
  it('overlays a translation on the English names', () => {
    const store = new AssetStore(vanilla, new Map());
    const names = gameNames(store, { 'item.minecraft.diamond_sword': 'Diamantschwert' });
    const items = listItems(store, names);
    expect(items.map((i) => i.name)).toEqual(['Diamantschwert', 'Stone']);
  });
});

describe('pack loading helpers', () => {
  it('finds the pack root inside an enclosing folder', () => {
    expect(findPackRoot(['MyPack/pack.mcmeta', 'MyPack/assets/minecraft/x.png'])).toBe('MyPack/');
    expect(findPackRoot(['pack.mcmeta', 'assets/minecraft/x.png'])).toBe('');
    expect(findPackRoot(['some/mypack.mcmeta'])).toBe('');
  });
  it('parses pack.mcmeta in old and new formats', () => {
    expect(parsePackMeta(enc({ pack: { pack_format: 34, description: '§aHi' } }))).toMatchObject({ format: 34, description: 'Hi' });
    expect(parsePackMeta(enc({ pack: { min_format: [69, 0], max_format: 70, description: [{ text: 'a' }, 'b'] } }))).toMatchObject({
      format: 69,
      description: 'ab',
    });
    expect(textComponentToString({ text: 'x', extra: [{ text: 'y' }] })).toBe('xy');
  });
});

describe('sounds.json merge', () => {
  const v = {
    'block.stone.break': { sounds: ['dig/stone1', { name: 'dig/stone2', volume: 0.5 }], subtitle: 'subtitles.block.generic.break' },
    'item.trident.throw': { sounds: ['item/trident/throw1'] },
  };
  it('appends unless replace is set, and supports other namespaces', () => {
    const events = mergeSounds(v, {
      minecraft: {
        'block.stone.break': { sounds: ['custom/stone'] },
        'item.trident.throw': { replace: true, sounds: [{ name: 'x', type: 'event' }] },
      },
      mypack: { 'magic.zap': { sounds: ['zap'] } },
    });
    const byId = Object.fromEntries(events.map((e) => [e.id, e]));
    expect(byId['minecraft:block.stone.break'].files.map((f) => f.key)).toEqual([
      'minecraft/sounds/dig/stone1.ogg',
      'minecraft/sounds/dig/stone2.ogg',
      'minecraft/sounds/custom/stone.ogg',
    ]);
    expect(byId['minecraft:block.stone.break'].fromPack).toBe(true);
    expect(byId['minecraft:item.trident.throw'].files).toEqual([]);
    expect(byId['minecraft:item.trident.throw'].refs).toEqual(['minecraft:x']);
    expect(byId['mypack:magic.zap'].files[0].path).toBe('assets/mypack/sounds/zap.ogg');
    expect(soundsForItem(events, 'minecraft:trident').map((e) => e.id)).toEqual(['minecraft:item.trident.throw']);
  });
});
