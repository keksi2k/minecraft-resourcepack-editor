import { describe, expect, it } from 'vitest';
import { AssetStore } from '../assets/AssetStore';
import { matchScore } from '../ui/CommandPalette';

describe('command palette search', () => {
  it('needs every word and prefers matches at the start of words', () => {
    expect(matchScore('Diamond Sword', ['sword'])).toBeGreaterThan(0);
    expect(matchScore('Diamond Sword', ['dia', 'sw'])).toBeGreaterThan(matchScore('Diamond Sword', ['mond']));
    expect(matchScore('Diamond Sword', ['axe'])).toBe(-1);
    expect(matchScore('stone', ['stone'])).toBeGreaterThan(matchScore('minecraft:block/cobblestone', ['stone']));
  });
});

describe('edit notifications for undo', () => {
  it('reports each edit with the state before and after', () => {
    const store = new AssetStore(new Map(), new Map());
    const seen: [string, unknown, unknown][] = [];
    store.onEdit = (p, b, a) => seen.push([p, b, a]);
    const x = new Uint8Array([1]);
    store.setEdit('a', x);
    store.setEdit('a', null);
    store.clearEdit('a');
    store.clearEdit('never');
    expect(seen).toEqual([
      ['a', undefined, x],
      ['a', x, null],
      ['a', null, undefined],
    ]);
  });
});
