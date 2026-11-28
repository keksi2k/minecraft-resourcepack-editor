import { describe, expect, it } from 'vitest';
import { compactJson, formatBytes, isJunk, sameAsVanilla, shrinkCandidates } from '../pack/shrink';

const enc = (s: string) => new TextEncoder().encode(s);
const MODEL = 'assets/minecraft/models/block/stone.json';

describe('shrinking a pack', () => {
  it('knows files the game never reads, but keeps the author’s own notes', () => {
    expect(isJunk('assets/minecraft/textures/block/.DS_Store')).toBe(true);
    expect(isJunk('Thumbs.db')).toBe(true);
    expect(isJunk('__MACOSX/assets/x.png')).toBe(true);
    expect(isJunk('assets/minecraft/textures/block/stone.psd')).toBe(true);
    expect(isJunk('assets/minecraft/textures/block/stone.png~')).toBe(true);
    expect(isJunk('assets/minecraft/models/sword.bbmodel')).toBe(true);
    expect(isJunk('README.md')).toBe(false);
    expect(isJunk('LICENSE.txt')).toBe(false);
    expect(isJunk('assets/minecraft/texts/splashes.txt')).toBe(false);
    expect(isJunk('assets/minecraft/textures/block/stone.png')).toBe(false);
  });

  it('finds files that read the same as the game’s', () => {
    expect(sameAsVanilla(MODEL, enc('{"parent":"block/cube_all"}'), enc('{"parent":"block/cube_all"}'))).toBe(true);
    expect(sameAsVanilla(MODEL, enc('{\n  // same\n  "parent": "block/cube_all"\n}'), enc('{"parent":"block/cube_all"}'))).toBe(true);
    expect(sameAsVanilla(MODEL, enc('{"parent":"block/cube"}'), enc('{"parent":"block/cube_all"}'))).toBe(false);
    expect(sameAsVanilla('a.png', enc('x'), undefined)).toBe(false);
  });

  it('writes JSON compactly, but only when that is smaller and never pack.mcmeta', () => {
    expect(new TextDecoder().decode(compactJson(MODEL, enc('{\n  "parent": "block/cube_all" // c\n}')))).toBe('{"parent":"block/cube_all"}');
    expect(compactJson(MODEL, enc('{"a":1}'))).toBeUndefined();
    expect(compactJson('pack.mcmeta', enc('{ "pack": { "pack_format": 97 } }'))).toBeUndefined();
    expect(compactJson(MODEL, enc('{ broken'))).toBeUndefined();
    expect(compactJson('assets/minecraft/textures/a.png', enc('{ }'))).toBeUndefined();
  });

  it('sorts the pack’s files into the steps', () => {
    const files = new Map([
      ['pack.mcmeta', enc('{}')],
      ['pack.png', enc('png!')],
      [MODEL, enc('{"parent":"block/cube_all"}')],
      ['assets/minecraft/models/block/dirt.json', enc('{ "parent": "block/cube" }')],
      ['assets/minecraft/textures/block/stone.png', enc('png')],
      ['assets/minecraft/textures/block/stone.psd', enc('psd')],
      ['assets/minecraft/sounds/x.ogg', enc('ogg')],
    ]);
    const vanilla = new Map([[MODEL, enc('{"parent":"block/cube_all"}')]]);
    const c = shrinkCandidates(files, (p) => vanilla.get(p));
    expect(c.files).toEqual({
      vanilla: [MODEL],
      junk: ['assets/minecraft/textures/block/stone.psd'],
      json: ['assets/minecraft/models/block/dirt.json'],
      png: ['assets/minecraft/textures/block/stone.png', 'pack.png'],
      ogg: ['assets/minecraft/sounds/x.ogg'],
    });
    expect(c.bytes.png).toBe(7);
    expect(formatBytes(1536)).toBe('1.5 KB');
  });
});
