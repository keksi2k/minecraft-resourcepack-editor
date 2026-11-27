import { describe, expect, it } from 'vitest';
import { bytesEqual, comparePacks, folderOf, kindOf } from '../pack/compare';

const b = (...n: number[]) => new Uint8Array(n);

describe('comparing packs', () => {
  it('lists new and changed files, not equal ones', () => {
    const mine = new Map([
      ['assets/minecraft/textures/block/stone.png', b(1)],
      ['assets/minecraft/sounds/x.ogg', b(2)],
    ]);
    const other = new Map([
      ['assets/minecraft/textures/block/stone.png', b(9)],
      ['assets/minecraft/sounds/x.ogg', b(2)],
      ['assets/minecraft/models/block/new.json', b(3)],
    ]);
    const diff = comparePacks((p) => mine.get(p), other);
    expect(diff.map((d) => [d.path, d.status, d.kind])).toEqual([
      ['assets/minecraft/models/block/new.json', 'new', 'model'],
      ['assets/minecraft/textures/block/stone.png', 'changed', 'texture'],
    ]);
  });

  it('sorts files into kinds and folders', () => {
    expect(kindOf('assets/a/textures/b.png.mcmeta')).toBe('texture');
    expect(kindOf('assets/a/sounds.json')).toBe('sound');
    expect(kindOf('assets/a/lang/de_de.json')).toBe('text');
    expect(kindOf('credits.txt')).toBe('misc');
    expect(folderOf('assets/minecraft/textures/block/stone.png')).toBe('minecraft/textures/block');
    expect(bytesEqual(b(1, 2), b(1, 2))).toBe(true);
    expect(bytesEqual(b(1, 2), b(1, 3))).toBe(false);
  });
});
