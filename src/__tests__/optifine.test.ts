import { describe, expect, it } from 'vitest';
import { AssetStore } from '../assets/AssetStore';
import { mixTextureId, parseMixTexture, textureLabel, texturePath } from '../models/resourceLocation';
import {
  blockOf,
  ctmTile,
  emissiveOf,
  emissiveSuffix,
  isOverlay,
  loadCitRules,
  loadCtmRules,
  parseCtmRule,
  overlayRulesFor,
  parseProperties,
  ruleFor,
  type CtmWorld,
} from '../optifine/optifine';
import type { ResolvedItemModel } from '../models/items';
import { ctmModels, emissiveModels, faceAxes, turnedFace } from '../scenes/sandbox';

const enc = (s: string) => new TextEncoder().encode(s);
const D = 'assets/minecraft/optifine/ctm/glass/';
const tile = (n: number | string) => `__file:${D}${n}.png`;

/** A world of glass blocks at the given positions. */
function world(cells: [number, number, number][], block = 'minecraft:glass'): CtmWorld {
  const set = new Set(cells.map((c) => c.join(',')));
  return { blockAt: (p) => (set.has(p.join(',')) ? block : undefined), texturesOf: () => new Set(['minecraft:block/glass']) };
}

describe('properties files', () => {
  it('reads Java properties', () => {
    expect(parseProperties('# comment\n! also\nmethod=ctm\ntiles: 0-46\nkey value\nlong=a \\\n  b\nname=\\u00e9t\\u00e9')).toEqual({ method: 'ctm', tiles: '0-46', key: 'value', long: 'a b', name: 'été' });
  });

  it('infers what a rule matches from the file name', () => {
    expect(parseCtmRule(`${D}glass.properties`, { method: 'ctm', tiles: '0-46' })!.matchTiles).toEqual(new Set(['minecraft:block/glass']));
    const r = parseCtmRule(`${D}block_white_stained_glass.properties`, { method: 'ctm', tiles: '0-46' })!;
    expect([...r.matchBlocks!]).toEqual(['minecraft:white_stained_glass']);
    expect(r.connect).toBe('block');
    expect(r.tiles).toHaveLength(47);
    expect(r.tiles[3]).toBe(tile(3));
    expect(texturePath(r.tiles[3] as string)).toBe(`${D}3.png`);
    expect(textureLabel(r.tiles[3] as string)).toBe('minecraft:optifine/ctm/glass/3.png');
    expect(textureLabel('minecraft:block/glass')).toBe('minecraft:block/glass');
    expect(blockOf('minecraft:oak_stairs:facing=east')).toBe('minecraft:oak_stairs');
    expect(parseCtmRule(`${D}x.properties`, { method: 'fixed', tiles: '<skip> <default> textures/block/stone minecraft:block/dirt' })!.tiles).toEqual([
      null,
      'default',
      'minecraft:block/stone',
      '__file:assets/minecraft/block/dirt.png',
    ]);
  });
});

describe('connected textures', () => {
  const ctm = parseCtmRule(`${D}glass.properties`, { method: 'ctm', tiles: '0-46' })!;

  it('picks the template tile from the neighbours', () => {
    // alone
    expect(ctmTile(ctm, world([[0, 0, 0]]), [0, 0, 0], 'north', 'minecraft:glass', 'minecraft:block/glass')).toBe(tile(0));
    // a 3×3 wall facing north: the middle connects everywhere, corners filled
    const wall: [number, number, number][] = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) wall.push([x, y, 0]);
    expect(ctmTile(ctm, world(wall), [0, 0, 0], 'north', 'minecraft:glass', 'minecraft:block/glass')).toBe(tile(26));
    // seen from the north, east (+x) is on the left: the left end of a row of three is at +x
    const row = world([[-1, 0, 0], [0, 0, 0], [1, 0, 0]]);
    expect(ctmTile(ctm, row, [1, 0, 0], 'north', 'minecraft:glass', 'minecraft:block/glass')).toBe(tile(1));
    expect(ctmTile(ctm, row, [0, 0, 0], 'north', 'minecraft:glass', 'minecraft:block/glass')).toBe(tile(2));
    // an inner corner: up and right connected, but not the block up-right
    const l = world([[0, 0, 0], [0, 1, 0], [-1, 0, 0]]);
    expect(ctmTile(ctm, l, [0, 0, 0], 'north', 'minecraft:glass', 'minecraft:block/glass')).toBe(tile(16));
  });

  it('does not connect across a covered face', () => {
    // the neighbour has a block in front of it, so its north face isn't visible
    const w = world([[0, 0, 0], [1, 0, 0], [1, 0, -1]]);
    expect(ctmTile(ctm, w, [0, 0, 0], 'north', 'minecraft:glass', 'minecraft:block/glass')).toBe(tile(0));
  });

  it('connects bookshelves horizontally and pillars vertically', () => {
    const h = parseCtmRule(`${D}block_bookshelf.properties`, { method: 'horizontal', tiles: '0-3' })!;
    const row = world([[0, 0, 0], [1, 0, 0]], 'minecraft:bookshelf');
    expect(ctmTile(h, row, [1, 0, 0], 'north', 'minecraft:bookshelf', 'x')).toBe(tile(0)); // left end
    expect(ctmTile(h, row, [0, 0, 0], 'north', 'minecraft:bookshelf', 'x')).toBe(tile(2)); // right end
    // on the top face west is on the left: the neighbour at +x is to the right
    expect(ctmTile(h, row, [0, 0, 0], 'up', 'minecraft:bookshelf', 'x')).toBe(tile(0));
    const v = parseCtmRule(`${D}block_quartz_pillar.properties`, { method: 'vertical', tiles: '0-3' })!;
    const col = world([[0, 0, 0], [0, 1, 0]], 'minecraft:quartz_pillar');
    expect(ctmTile(v, col, [0, 0, 0], 'south', 'minecraft:quartz_pillar', 'x')).toBe(tile(0));
    expect(ctmTile(v, col, [0, 1, 0], 'south', 'minecraft:quartz_pillar', 'x')).toBe(tile(2));
    expect(ctmTile(v, world([[0, 0, 0]], 'minecraft:quartz_pillar'), [0, 0, 0], 'south', 'minecraft:quartz_pillar', 'x')).toBe(tile(3));
  });

  it('repeats patterns and picks random tiles by position', () => {
    const r = parseCtmRule(`${D}block_stone.properties`, { method: 'repeat', width: '2', height: '2', tiles: '0-3' })!;
    const w = world([]);
    expect(ctmTile(r, w, [0, 0, 0], 'up', 'minecraft:stone', 'x')).toBe(tile(0));
    expect(ctmTile(r, w, [1, 0, 0], 'up', 'minecraft:stone', 'x')).toBe(tile(1));
    expect(ctmTile(r, w, [0, 0, 1], 'up', 'minecraft:stone', 'x')).toBe(tile(2));
    expect(ctmTile(r, w, [2, 0, 2], 'up', 'minecraft:stone', 'x')).toBe(tile(0));
    const rnd = parseCtmRule(`${D}block_dirt.properties`, { method: 'random', tiles: '0-2', weights: '1 0 1' })!;
    const seen = new Set<string | undefined>();
    for (let x = 0; x < 40; x++) seen.add(ctmTile(rnd, w, [x, 0, 0], 'up', 'minecraft:dirt', 'x'));
    expect(seen).toEqual(new Set([tile(0), tile(2)]));
    expect(ctmTile(rnd, w, [5, 0, 3], 'up', 'minecraft:dirt', 'x')).toBe(ctmTile(rnd, w, [5, 0, 3], 'up', 'minecraft:dirt', 'x'));
  });

  it('finds the rule for a face: tile rules first, faces respected', () => {
    const store = new AssetStore(
      new Map(),
      new Map([
        [`${D}block_glass.properties`, enc('method=random\ntiles=a b')],
        [`${D}glass.properties`, enc('method=ctm\ntiles=0-46\nfaces=sides')],
      ]),
    );
    const rules = loadCtmRules(store);
    expect(ruleFor(rules, 'minecraft:glass', 'minecraft:block/glass', 'north')?.method).toBe('ctm');
    expect(ruleFor(rules, 'minecraft:glass', 'minecraft:block/glass', 'up')?.method).toBe('random');
    expect(ruleFor(rules, 'minecraft:stone', 'minecraft:block/stone', 'up')).toBeUndefined();
  });
});

describe('emissive textures and CIT', () => {
  const store = new AssetStore(
    new Map(),
    new Map([
      ['assets/minecraft/optifine/emissive.properties', enc('suffix.emissive=_e')],
      ['assets/minecraft/textures/block/redstone_lamp_on_e.png', enc('png')],
      ['assets/minecraft/optifine/cit/swords/excalibur.properties', enc('type=item\nitems=diamond_sword\nnbt.display.Name=Excalibur')],
      ['assets/minecraft/optifine/cit/swords/excalibur.png', enc('png')],
      ['assets/minecraft/optifine/cit/fancy.properties', enc('items=minecraft:stick\ntexture=wand\nnbt.display.Name=ipattern:*wand*\ndamage=0')],
    ]),
  );

  it('finds emissive overlays', () => {
    expect(emissiveSuffix(store)).toBe('_e');
    expect(emissiveOf(store, 'minecraft:block/redstone_lamp_on', '_e')).toBe('minecraft:block/redstone_lamp_on_e');
    expect(emissiveOf(store, 'minecraft:block/stone', '_e')).toBeUndefined();
  });

  it('reads CIT rules with their textures and conditions', () => {
    const [fancy, excalibur] = loadCitRules(store).sort((a, b) => a.file.localeCompare(b.file));
    expect(excalibur).toMatchObject({ items: ['minecraft:diamond_sword'], texture: '__file:assets/minecraft/optifine/cit/swords/excalibur.png', exactName: 'Excalibur' });
    expect(fancy.texture).toBe('__file:assets/minecraft/optifine/cit/wand.png');
    expect(fancy.exactName).toBeUndefined();
    expect(fancy.conditions).toEqual([
      ['nbt.display.Name', 'ipattern:*wand*'],
      ['damage', '0'],
    ]);
  });
});

describe('connected textures in the sandbox', () => {
  it('chooses tiles for where the faces of rotated variants point', () => {
    expect(turnedFace('north', 0, 90)).toBe('east');
    expect(turnedFace('north', 0, 180)).toBe('south');
    expect(turnedFace('north', 90, 0)).toBe('down');
    expect(turnedFace('up', 90, 90)).toBe('east');
    expect(turnedFace('west', 0, -90)).toBe('south');

    // a bookshelf row along x; the variant is turned 180°, so its model's north face is seen from the south
    const h = parseCtmRule(`${D}block_bookshelf.properties`, { method: 'horizontal', tiles: '0-3' })!;
    const row = world([[0, 0, 0], [1, 0, 0]], 'minecraft:bookshelf');
    const face = { texture: '#all', uv: [0, 0, 16, 16] };
    const model = {
      ref: { model: 'minecraft:block/bookshelf', tints: [] },
      model: { kind: 'elements', textures: { all: 'minecraft:block/bookshelf' }, elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { north: face } }] },
    } as unknown as ResolvedItemModel;
    const tileOf = (y: number) => {
      const { models } = ctmModels([model], [[{ model: 'minecraft:block/bookshelf', y }]], [0], [h], row, [0, 0, 0], 'minecraft:bookshelf');
      const m = models[0].model as unknown as { textures: Record<string, string>; elements: { faces: { north: { texture: string } } }[] };
      return m.textures[m.elements[0].faces.north.texture.slice(1)];
    };
    expect(tileOf(0)).toBe(ctmTile(h, row, [0, 0, 0], 'north', 'minecraft:bookshelf', 'minecraft:block/bookshelf'));
    expect(tileOf(180)).toBe(ctmTile(h, row, [0, 0, 0], 'south', 'minecraft:bookshelf', 'minecraft:block/bookshelf'));
    expect(tileOf(0)).not.toBe(tileOf(180));
  });
});

describe('more connected-texture methods', () => {
  const G = 'minecraft:block/glass';
  const g = 'minecraft:glass';
  const quarters = (id: string | undefined) => parseMixTexture(id!)!.map((l) => l.texture);

  it('puts compact tiles together from quarters, or takes a whole tile where the pack names one', () => {
    const c = parseCtmRule(`${D}glass.properties`, { method: 'ctm_compact', tiles: '0-4' })!;
    const row = world([[-1, 0, 0], [0, 0, 0], [1, 0, 0]]);
    // the middle connects left and right: every quarter shows the horizontal tile
    expect(ctmTile(c, row, [0, 0, 0], 'north', g, G)).toBe(mixTextureId([0, 1, 2, 3].map((q) => ({ texture: tile(3), quarter: q as 0 | 1 | 2 | 3 }))));
    // seen from the north the end at +x connects only to its right: left quarters unconnected
    expect(quarters(ctmTile(c, row, [1, 0, 0], 'north', g, G))).toEqual([tile(0), tile(3), tile(0), tile(3)]);
    // the top left block of a 2×2 wall: connected right and down with the corner between them
    const wall = world([[0, 0, 0], [-1, 0, 0], [0, -1, 0], [-1, -1, 0]]);
    expect(quarters(ctmTile(c, wall, [0, 0, 0], 'north', g, G))).toEqual([tile(0), tile(3), tile(2), tile(1)]);
    // without the corner block the bottom right quarter shows the unconnected corner
    const ring = world([[0, 0, 0], [-1, 0, 0], [0, -1, 0]]);
    expect(quarters(ctmTile(c, ring, [0, 0, 0], 'north', g, G))[3]).toBe(tile(4));
    // ctm.1 (connected to the right only) as a whole tile
    const o = parseCtmRule(`${D}glass.properties`, { method: 'ctm_compact', tiles: '0-4', 'ctm.1': '4' })!;
    expect(ctmTile(o, row, [1, 0, 0], 'north', g, G)).toBe(tile(4));
  });

  it('connects horizontally first, then vertically (and the other way round)', () => {
    const hv = parseCtmRule(`${D}glass.properties`, { method: 'horizontal+vertical', tiles: '0-6' })!;
    const vh = parseCtmRule(`${D}glass.properties`, { method: 'vertical+horizontal', tiles: '0-6' })!;
    const col = world([[0, 0, 0], [0, 1, 0]]);
    expect(ctmTile(hv, col, [0, 0, 0], 'south', g, G)).toBe(tile(4)); // vertical bottom (0) + 4
    expect(ctmTile(vh, col, [0, 0, 0], 'south', g, G)).toBe(tile(0));
    const row = world([[0, 0, 0], [1, 0, 0]]);
    expect(ctmTile(hv, row, [1, 0, 0], 'north', g, G)).toBe(tile(0));
    expect(ctmTile(vh, row, [1, 0, 0], 'north', g, G)).toBe(tile(4));
    expect(ctmTile(hv, world([[0, 0, 0]]), [0, 0, 0], 'north', g, G)).toBe(tile(3));
  });

  describe('overlays', () => {
    const rule = parseCtmRule(`${D}stone.properties`, {
      method: 'overlay',
      tiles: '0-16',
      matchBlocks: 'stone',
      connectBlocks: 'grass_block',
      tintIndex: '0',
      tintBlock: 'grass_block',
    })!;
    const at = (cells: Record<string, string | undefined>): CtmWorld => ({ blockAt: (p) => cells[p.join(',')], texturesOf: () => new Set() });
    const S = 'minecraft:stone';
    const grass = 'minecraft:grass_block';

    it('reads what overlays connect to and how they are tinted', () => {
      expect(rule.connectBlocks).toEqual(new Set([grass]));
      expect(rule).toMatchObject({ tintIndex: 0, tintBlock: grass });
      expect(isOverlay(rule)).toBe(true);
      expect(ruleFor([rule], S, 'minecraft:block/stone', 'north')).toBeUndefined();
      expect(overlayRulesFor([rule], S, 'minecraft:block/stone', 'north')).toEqual([rule]);
    });

    it('picks the fringe from the neighbours to the left, down, right and up', () => {
      // seen from the north, +x is on the left
      expect(ctmTile(rule, at({ '0,0,0': S, '1,0,0': grass }), [0, 0, 0], 'north', S, 'x')).toBe(tile(9));
      expect(ctmTile(rule, at({ '0,0,0': S, '0,1,0': grass }), [0, 0, 0], 'north', S, 'x')).toBe(tile(15));
      // grass on both sides: two tiles stacked
      expect(ctmTile(rule, at({ '0,0,0': S, '1,0,0': grass, '-1,0,0': grass }), [0, 0, 0], 'north', S, 'x')).toBe(
        mixTextureId([{ texture: tile(9) }, { texture: tile(7) }]),
      );
      // only blocks it connects to, and only where their face shows
      expect(ctmTile(rule, at({ '0,0,0': S, '1,0,0': 'minecraft:dirt' }), [0, 0, 0], 'north', S, 'x')).toBeUndefined();
      expect(ctmTile(rule, at({ '0,0,0': S, '1,0,0': grass, '1,0,-1': S }), [0, 0, 0], 'north', S, 'x')).toBeUndefined();
    });

    it('draws a corner when the grass is diagonal and the face goes on beside it', () => {
      const cells = { '0,0,0': S, '1,0,0': S, '0,1,0': S, '1,1,0': grass };
      expect(ctmTile(rule, at(cells), [0, 0, 0], 'north', S, 'x')).toBe(tile(16));
      expect(ctmTile(rule, at({ ...cells, '1,0,0': undefined }), [0, 0, 0], 'north', S, 'x')).toBeUndefined();
    });

    it('gives the sandbox an extra tinted layer for overlaid faces', () => {
      const face = { texture: '#all' };
      const model = {
        ref: { model: 'minecraft:block/stone', tints: [] },
        model: { kind: 'elements', textures: { all: 'minecraft:block/stone' }, elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { north: face, up: face } }] },
      } as unknown as ResolvedItemModel;
      const res = ctmModels([model], [[{ model: 'minecraft:block/stone' }]], [0], [rule], at({ '0,0,0': S, '1,0,0': grass }), [0, 0, 0], S, (b) =>
        b === grass ? 0x55aa33 : undefined,
      );
      expect(res.models[0]).toBe(model);
      const over = res.overlays![0];
      expect(over.ref.tints).toEqual([0x55aa33]);
      const m = over.model as unknown as { textures: Record<string, string>; elements: { faces: Record<string, { texture: string; tintindex?: number }> }[] };
      // the top borders the grass block's top too
      expect(Object.keys(m.elements[0].faces)).toEqual(['north', 'up']);
      expect(m.textures[m.elements[0].faces.north.texture.slice(1)]).toBe(tile(9));
      expect(m.elements[0].faces.north.tintindex).toBe(0);
    });
  });

  it('follows the texture when a variant or the UV turns it', () => {
    const clean = (v: number[][]) => v.map((a) => a.map((n) => n + 0)); // no -0
    expect(clean(faceAxes('up', { texture: '#all' }, 0, 180))).toEqual([[1, 0, 0], [0, 0, 1]]);
    expect(clean(faceAxes('north', { texture: '#all', rotation: 90 }))).toEqual([[0, 1, 0], [-1, 0, 0]]);
    expect(clean(faceAxes('north', { texture: '#all', uv: [16, 0, 0, 16] }))[0]).toEqual([-1, 0, 0]);
    // the top of a turned block: the tile's ends follow the turned texture
    const h = parseCtmRule(`${D}glass.properties`, { method: 'horizontal', tiles: '0-3' })!;
    const row = world([[0, 0, 0], [1, 0, 0]]);
    expect(ctmTile(h, row, [0, 0, 0], 'up', g, G)).toBe(tile(0));
    expect(ctmTile(h, row, [0, 0, 0], 'up', g, G, faceAxes('up', { texture: '#all' }, 0, 180))).toBe(tile(2));
  });
});

describe('emissive items', () => {
  it('lets the layers of flat items glow', () => {
    const store = new AssetStore(
      new Map(),
      new Map([
        ['assets/minecraft/optifine/emissive.properties', enc('suffix.emissive=_e')],
        ['assets/minecraft/textures/item/apple_e.png', enc('png')],
      ]),
    );
    const apple = {
      ref: { model: 'minecraft:item/apple', tints: [0xff0000] },
      model: { kind: 'generated', layers: ['minecraft:item/apple', 'minecraft:item/leaf'], elements: [], textures: {} },
    } as unknown as ResolvedItemModel;
    const [glow] = emissiveModels(store, [apple], emissiveSuffix(store))!;
    expect(glow.model.layers).toEqual(['minecraft:item/apple_e']);
    expect(glow.ref.tints).toEqual([]);
    expect(emissiveModels(store, [{ ...apple, model: { ...apple.model, layers: ['minecraft:item/leaf'] } }], '_e')).toBeUndefined();
  });

  it('names mixed textures and reads them back', () => {
    const layers = [{ texture: '__file:assets/minecraft/optifine/ctm/a/0.png', quarter: 2 as const }, { texture: 'minecraft:block/stone' }];
    expect(parseMixTexture(mixTextureId(layers))).toEqual([layers[0], { texture: 'minecraft:block/stone', quarter: undefined }]);
    expect(parseMixTexture('minecraft:block/stone')).toBeUndefined();
  });
});
