import { describe, expect, it } from 'vitest';
import { extraFolders, mergeKindOf, stackChanges, stackPacks, type StackLayer } from '../pack/stack';

const enc = (s: string) => new TextEncoder().encode(s);
const json = (o: unknown) => enc(JSON.stringify(o));
const read = (b: Uint8Array | undefined) => JSON.parse(new TextDecoder().decode(b));
const layer = (name: string, files: Record<string, Uint8Array>): StackLayer => ({ name, files: new Map(Object.entries(files)) });

const STONE = 'assets/minecraft/textures/block/stone.png';
const LANG = 'assets/minecraft/lang/en_us.json';
const SOUNDS = 'assets/minecraft/sounds.json';

describe('stacking packs', () => {
  it('lets the higher pack win for ordinary files and counts what it hides', () => {
    const r = stackPacks([layer('top', { [STONE]: enc('top') }), layer('bottom', { [STONE]: enc('bottom'), 'assets/minecraft/textures/block/dirt.png': enc('dirt') })]);
    expect(new TextDecoder().decode(r.files.get(STONE))).toBe('top');
    expect(r.origin.get(STONE)).toBe(0);
    expect(r.origin.get('assets/minecraft/textures/block/dirt.png')).toBe(1);
    expect(r.hidden).toEqual([0, 1]);
  });

  it('only stacks assets/', () => {
    const r = stackPacks([layer('a', { 'pack.mcmeta': enc('{}'), 'pack.png': enc('x'), 'overlay_1/assets/minecraft/x.json': enc('{}') })]);
    expect(r.files.size).toBe(0);
    expect(extraFolders(new Map([['overlay_1/assets/x', enc('')], ['assets/minecraft/x', enc('')], ['pack.mcmeta', enc('')]]))).toEqual(['overlay_1']);
  });

  it('combines language files key by key', () => {
    const r = stackPacks([layer('top', { [LANG]: json({ a: 'top', c: 'only top' }) }), layer('bottom', { [LANG]: json({ a: 'bottom', b: 'only bottom' }) })]);
    expect(read(r.files.get(LANG))).toEqual({ a: 'top', b: 'only bottom', c: 'only top' });
    expect(r.origin.get(LANG)).toBe('merged');
    expect(r.merged.get(LANG)).toEqual([0, 1]);
  });

  it('adds sounds of the same event unless a pack replaces them', () => {
    const r = stackPacks([
      layer('top', { [SOUNDS]: json({ 'block.stone.break': { sounds: ['top/break'], subtitle: 'top.sub' }, 'entity.cow.ambient': { replace: true, sounds: ['moo'] } }) }),
      layer('bottom', { [SOUNDS]: json({ 'block.stone.break': { replace: true, sounds: ['bottom/break'] }, 'entity.cow.ambient': { sounds: ['old'] } }) }),
    ]);
    expect(read(r.files.get(SOUNDS))).toEqual({
      // the bottom pack replaced vanilla's sounds; the top one adds to them
      'block.stone.break': { replace: true, sounds: ['bottom/break', 'top/break'], subtitle: 'top.sub' },
      'entity.cow.ambient': { replace: true, sounds: ['moo'] },
    });
  });

  it('puts atlas sources and font providers one after another, lowest pack first', () => {
    const atlas = 'assets/minecraft/atlases/blocks.json';
    const font = 'assets/minecraft/font/default.json';
    const r = stackPacks([
      layer('top', { [atlas]: json({ sources: [{ type: 'directory', source: 'top' }] }), [font]: json({ providers: [{ type: 'bitmap', file: 'top.png' }] }) }),
      layer('bottom', { [atlas]: json({ sources: [{ type: 'directory', source: 'bottom' }] }), [font]: json({ providers: [{ type: 'bitmap', file: 'bottom.png' }] }) }),
    ]);
    expect(read(r.files.get(atlas)).sources.map((s: any) => s.source)).toEqual(['bottom', 'top']);
    expect(read(r.files.get(font)).providers.map((p: any) => p.file)).toEqual(['bottom.png', 'top.png']);
    expect(mergeKindOf('assets/minecraft/font/include/space.json')).toBeUndefined();
  });

  it('takes the highest file when one can’t be combined, and doesn’t combine equal ones', () => {
    const r = stackPacks([layer('top', { [LANG]: enc('{ broken') }), layer('bottom', { [LANG]: json({ a: 'b' }) })]);
    expect(r.unreadable).toEqual([LANG]);
    expect(r.origin.get(LANG)).toBe(0);
    const same = stackPacks([layer('top', { [LANG]: json({ a: 'b' }) }), layer('bottom', { [LANG]: json({ a: 'b' }) })]);
    expect(same.origin.get(LANG)).toBe(0);
    expect(same.merged.size).toBe(0);
  });

  it('changes only files that differ from what the pack shows', () => {
    const r = stackPacks([layer('a', { [STONE]: enc('new'), [LANG]: json({ a: 1 }) })]);
    const shown = new Map([[LANG, json({ a: 1 })]]);
    expect([...stackChanges(r, (p) => shown.get(p)).keys()]).toEqual([STONE]);
  });
});
