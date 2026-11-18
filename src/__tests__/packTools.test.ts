import { describe, expect, it } from 'vitest';
import { AssetStore } from '../assets/AssetStore';
import { setVariantList, textureVarsOf, variantChances, variantId, variantKeys, variantList, withRotations } from '../models/blockVariants';
import { joinNames, namedId, parseNames, readNameRules, slugify, writeNameRules } from '../models/customNames';
import { resolveModel } from '../models/modelResolver';
import { scaleMeta } from '../pack/batch';
import { isAtlasTexture } from '../models/atlasMembership';
import { blockstateModels, checkPack, supportedFormats } from '../pack/checks';
import { newSince, textureProgress } from '../pack/progress';
import { componentToLegacy, parseFormatted, setLangEntry, splashLines, stripFormatting } from '../texts/formatting';

const enc = (v: unknown) => new TextEncoder().encode(typeof v === 'string' ? v : JSON.stringify(v));
const files = (o: Record<string, unknown>) => new Map(Object.entries(o).map(([k, v]) => [k, v instanceof Uint8Array ? v : enc(v)]));

/** Just enough of a PNG for the IHDR size to be read. */
function png(w: number, h: number, fill = 0): Uint8Array {
  const b = new Uint8Array(25);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const v = new DataView(b.buffer);
  v.setUint32(16, w);
  v.setUint32(20, h);
  b[24] = fill;
  return b;
}

describe('custom name rules', () => {
  const base = { type: 'minecraft:model', model: 'minecraft:item/diamond_sword' };
  it('wraps the model in a custom_name select and unwraps it again', () => {
    const def = writeNameRules({ model: base }, { base, rules: [{ names: ['Excalibur'], model: 'minecraft:item/named/diamond_sword/excalibur' }, { names: ['A', 'B'], model: 'x:item/ab' }], other: [] });
    expect(def.model).toMatchObject({ type: 'minecraft:select', property: 'minecraft:component', component: 'minecraft:custom_name', fallback: base });
    expect(def.model.cases[0]).toEqual({ when: 'Excalibur', model: { type: 'minecraft:model', model: 'minecraft:item/named/diamond_sword/excalibur' } });
    expect(def.model.cases[1].when).toEqual(['A', 'B']);
    const read = readNameRules(def);
    expect(read.base).toEqual(base);
    expect(read.rules.map((r) => r.names)).toEqual([['Excalibur'], ['A', 'B']]);
    expect(writeNameRules(def, { ...read, rules: [] })).toEqual({ model: base });
  });

  it('keeps cases it cannot show', () => {
    const odd = { when: 'Odd', model: { type: 'minecraft:composite', models: [] } };
    const def = { model: { type: 'select', property: 'component', component: 'custom_name', cases: [odd], fallback: base } };
    const read = readNameRules(def);
    expect(read.rules).toEqual([]);
    expect(writeNameRules(def, { ...read, rules: [{ names: ['N'], model: 'm' }] }).model.cases).toHaveLength(2);
  });

  it('makes file-safe ids and parses name lists', () => {
    expect(slugify('Épée, the Great!')).toBe('epee_the_great');
    expect(namedId('minecraft:stick', 'Wand', (id) => id.endsWith('/wand'))).toBe('minecraft:item/named/stick/wand_2');
    expect(parseNames(' Excalibur | Sword, of Light |Excalibur')).toEqual(['Excalibur', 'Sword, of Light']);
    expect(joinNames(['a', 'b'])).toBe('a | b');
  });
});

describe('block variants', () => {
  const bs = { variants: { '': { model: 'minecraft:block/stone' } } };
  it('reads, extends and writes variant lists', () => {
    expect(variantKeys(bs)).toEqual(['']);
    const list = withRotations(variantList(bs, ''), { model: 'minecraft:block/stone' });
    expect(list.map((v) => v.y ?? 0)).toEqual([0, 90, 180, 270]);
    const next = setVariantList(bs, '', [...list.slice(0, 2), { model: 'b', weight: 3 }]);
    expect(next.variants['']).toEqual([{ model: 'minecraft:block/stone' }, { model: 'minecraft:block/stone', y: 90 }, { model: 'b', weight: 3 }]);
    expect(variantChances(variantList(next, ''))).toEqual([0.2, 0.2, 0.6]);
    expect(setVariantList(next, '', [{ model: 'only', weight: 5 }]).variants['']).toEqual({ model: 'only' });
  });

  it('finds the texture variables to swap and free ids', () => {
    const store = new AssetStore(
      files({
        'assets/minecraft/models/block/cube_all.json': { textures: { particle: '#all' } },
        'assets/minecraft/models/block/stone.json': { parent: 'block/cube_all', textures: { all: 'block/stone' } },
      }),
      new Map(),
    );
    expect(textureVarsOf(resolveModel(store, 'block/stone'), 'minecraft:block/stone').sort()).toEqual(['all', 'particle']);
    expect(variantId('minecraft:stone', (id) => id.endsWith('_2'))).toBe('minecraft:block/stone_variant_3');
  });
});

describe('text formatting', () => {
  it('parses § codes like the game', () => {
    expect(parseFormatted('§6Gold §lbold§r plain')).toEqual([
      { text: 'Gold ', color: '#ffaa00' },
      { text: 'bold', color: '#ffaa00', bold: true },
      { text: ' plain' },
    ]);
    expect(stripFormatting('§aHi §kthere')).toBe('Hi there');
  });

  it('turns JSON text components into § text', () => {
    expect(componentToLegacy('plain')).toBe('plain');
    expect(componentToLegacy({ text: 'A', color: 'gold', extra: [{ text: 'B', bold: true }] })).toBe('§6A§6§lB');
    expect(componentToLegacy(['', { text: 'red', color: 'red' }, ' after'])).toBe('§cred§r after');
  });

  it('edits language entries and splash lists', () => {
    expect(setLangEntry({ a: '1' }, 'b', '2')).toEqual({ a: '1', b: '2' });
    expect(setLangEntry({ a: '1' }, 'a', '')).toEqual({});
    expect(splashLines('one\r\n\n two \n')).toEqual(['one', 'two']);
  });
});

describe('export checks', () => {
  const vanilla = files({
    'assets/minecraft/textures/block/stone.png': png(16, 16),
    'assets/minecraft/textures/block/sea_lantern.png': png(16, 80),
    'assets/minecraft/textures/block/sea_lantern.png.mcmeta': { animation: { frametime: 5 } },
    'assets/minecraft/models/block/cube_all.json': {},
  });
  const codes = (pack: Record<string, unknown>, gameFormat = 46) => {
    const store = new AssetStore(vanilla, files(pack));
    return checkPack(store, store.exportFiles(), { gameFormat }).map((i) => `${i.level}:${i.code}${i.path ? `:${i.path}` : ''}`);
  };

  it('accepts a clean pack', () => {
    expect(codes({ 'pack.mcmeta': { pack: { pack_format: 46, description: '' } }, 'assets/minecraft/textures/block/stone.png': png(32, 32) })).toEqual([]);
  });

  it('reports format, JSON, paths and ignored files', () => {
    const out = codes({
      'pack.mcmeta': { pack: { pack_format: 34, description: '' } },
      'assets/minecraft/models/block/broken.json': '{ nope',
      'assets/minecraft/textures/block/Stone.png': png(16, 16),
      'assets/minecraft/textures/blocks/dirt.png': png(16, 16),
      'assets/minecraft/textures/block/dirt.jpg': 'x',
      'readme.txt': 'hi',
    });
    expect(out).toEqual([
      'error:badJson:assets/minecraft/models/block/broken.json',
      'error:badPath:assets/minecraft/textures/block/Stone.png',
      'warning:wrongType:assets/minecraft/textures/block/dirt.jpg',
      'warning:legacyFolder:assets/minecraft/textures/blocks/dirt.png',
      'warning:formatMismatch:pack.mcmeta',
      'info:outsideAssets:readme.txt',
    ]);
  });

  it('checks animations, sizes and references', () => {
    const out = codes({
      'pack.mcmeta': { pack: { pack_format: 40, supported_formats: [40, 50] } },
      'assets/minecraft/textures/block/sea_lantern.png': png(16, 40),
      'assets/minecraft/textures/block/stone.png': png(32, 16),
      'assets/minecraft/textures/entity/pig.png': png(64, 64),
      'assets/minecraft/textures/entity/pig.png.mcmeta': { animation: {} },
      'assets/minecraft/textures/block/glow.png': png(16, 32),
      'assets/minecraft/textures/block/glow.png.mcmeta': { animation: { frames: [0, 5] } },
      'assets/minecraft/textures/block/ghost.png.mcmeta': { animation: {} },
      'assets/minecraft/models/block/x.json': { parent: 'block/cube_all', textures: { all: 'block/nothing', side: '#all' } },
      'assets/minecraft/models/block/y.json': { parent: 'block/gone' },
      'assets/minecraft/blockstates/x.json': { variants: { '': { model: 'block/x' } }, multipart: [{ apply: [{ model: 'block/z' }] }] },
    });
    expect(out).toEqual([
      'error:animBadFrames:assets/minecraft/textures/block/glow.png',
      'warning:missingModel:assets/minecraft/blockstates/x.json',
      'warning:missingTexture:assets/minecraft/models/block/x.json',
      'warning:missingModel:assets/minecraft/models/block/y.json',
      'warning:orphanMeta:assets/minecraft/textures/block/ghost.png.mcmeta',
      'warning:sizeMismatch:assets/minecraft/textures/block/stone.png',
      'warning:animIgnored:assets/minecraft/textures/entity/pig.png',
    ]);
    // the vanilla .mcmeta can't cut 16×40 into frames, so it isn't exported at all; no false alarm
  });

  it('knows which entity textures sit in an atlas', () => {
    const atlas = { 'assets/minecraft/atlases/blocks.json': { sources: [{ type: 'directory', source: 'entity/conduit', prefix: 'entity/conduit/' }, { type: 'single', resource: 'minecraft:entity/bell/bell_body' }] } };
    const store = new AssetStore(files(atlas), new Map());
    expect(isAtlasTexture(store, 'assets/minecraft/textures/entity/conduit/wind.png')).toBe(true);
    expect(isAtlasTexture(store, 'assets/minecraft/textures/entity/bell/bell_body.png')).toBe(true);
    expect(isAtlasTexture(store, 'assets/minecraft/textures/entity/pig/pig.png')).toBe(false);
    const pack = { 'pack.mcmeta': { pack: { pack_format: 46 } }, 'assets/minecraft/textures/entity/conduit/wind.png': png(16, 32), 'assets/minecraft/textures/entity/conduit/wind.png.mcmeta': { animation: {} } };
    const s2 = new AssetStore(files(atlas), files(pack));
    expect(checkPack(s2, s2.exportFiles(), { gameFormat: 46 })).toEqual([]);
  });

  it('flags animations the image cannot be cut into', () => {
    expect(
      codes({ 'pack.mcmeta': { pack: { pack_format: 46 } }, 'assets/minecraft/textures/block/a.png': png(16, 40), 'assets/minecraft/textures/block/a.png.mcmeta': { animation: {} } }),
    ).toEqual(['error:animBadSize:assets/minecraft/textures/block/a.png']);
  });

  it('reads every way of declaring formats', () => {
    expect(supportedFormats({ pack: { pack_format: 15, supported_formats: { min_inclusive: 15, max_inclusive: 20 } } })).toEqual([[15, 15], [15, 20]]);
    expect(supportedFormats({ pack: { min_format: [69, 0], max_format: 70 } })).toEqual([[69, 70]]);
    expect([...blockstateModels({ multipart: [{ apply: { model: 'a' } }] })]).toEqual(['minecraft:a']);
  });

  it('finds sounds that are missing', () => {
    const store = new AssetStore(new Map(), files({ 'pack.mcmeta': { pack: { pack_format: 46 } }, 'assets/minecraft/sounds.json': { a: { sounds: ['mob/cow/say1', 'custom/moo', { name: 'x', type: 'event' }] } } }));
    const issues = checkPack(store, store.exportFiles(), { gameFormat: 46, vanillaSound: (k) => k === 'minecraft/sounds/mob/cow/say1.ogg' });
    expect(issues.map((i) => i.vars?.sound)).toEqual(['minecraft:custom/moo']);
  });
});

describe('progress', () => {
  it('counts replaced textures per category and lists the rest', () => {
    const vanilla = files({
      'assets/minecraft/textures/block/a.png': png(16, 16, 1),
      'assets/minecraft/textures/block/b.png': png(16, 16, 2),
      'assets/minecraft/textures/block/c.png': png(16, 16, 3),
      'assets/minecraft/textures/item/d.png': png(16, 16, 4),
    });
    const store = new AssetStore(vanilla, files({ 'assets/minecraft/textures/block/a.png': png(16, 16, 9), 'assets/minecraft/textures/block/b.png': png(16, 16, 2) }));
    const [block, item] = textureProgress(store);
    expect(block).toMatchObject({ category: 'block', total: 3, changed: 1, untouched: ['assets/minecraft/textures/block/b.png', 'assets/minecraft/textures/block/c.png'] });
    expect(item).toMatchObject({ category: 'item', total: 1, changed: 0 });
    const fresh = newSince(store, new Set(['assets/minecraft/textures/block/b.png']));
    expect(Object.fromEntries(fresh)).toEqual({ block: ['assets/minecraft/textures/block/c.png'], item: ['assets/minecraft/textures/item/d.png'] });
  });
});

describe('batch', () => {
  it('scales explicit animation frame sizes with the texture', () => {
    expect(scaleMeta({ animation: { width: 16, height: 8, frametime: 2 } }, 2)).toEqual({ animation: { width: 32, height: 16, frametime: 2 } });
    expect(scaleMeta({ animation: { frametime: 2 } }, 2)).toBeUndefined();
  });
});
