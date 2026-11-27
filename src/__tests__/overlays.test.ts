import { describe, expect, it } from 'vitest';
import { AssetStore } from '../assets/AssetStore';
import { checkPack } from '../pack/checks';
import { activeOverlays, readOverlays, splitOverlayPath, writeOverlays } from '../pack/overlays';

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b?: Uint8Array) => (b ? new TextDecoder().decode(b) : undefined);
const STONE = 'assets/minecraft/textures/block/stone.png';

describe('overlay entries', () => {
  it('reads every range form and picks the ones for a format, later ones last', () => {
    const raw = {
      overlays: {
        entries: [
          { directory: 'old', formats: [15, 34] },
          { directory: 'mid', formats: { min_inclusive: 30, max_inclusive: 60 } },
          { directory: 'new', min_format: 55, max_format: [99, 0] },
          { directory: 'Bad Name', formats: 40 },
        ],
      },
    };
    expect(readOverlays(raw).map((o) => [o.directory, o.min, o.max])).toEqual([
      ['old', 15, 34],
      ['mid', 30, 60],
      ['new', 55, 99],
      ['Bad Name', 40, 40],
    ]);
    expect(activeOverlays(raw, 32)).toEqual(['old', 'mid']);
    expect(activeOverlays(raw, 57)).toEqual(['mid', 'new']);
    expect(activeOverlays(raw, 40)).toEqual(['mid']);
    expect(activeOverlays(raw, undefined)).toEqual([]);
  });

  it('writes both the old and the new range fields', () => {
    const next = writeOverlays({ pack: { pack_format: 34 } }, [{ directory: 'x', min: 34, max: 40 }]);
    expect(next.overlays.entries[0]).toEqual({ directory: 'x', formats: [34, 40], min_format: 34, max_format: 40 });
    expect(writeOverlays(next, []).overlays).toBeUndefined();
    expect(splitOverlayPath('x/assets/a.png', ['x'])).toEqual({ directory: 'x', inner: 'assets/a.png' });
  });
});

describe('the store with overlays', () => {
  const make = () =>
    new AssetStore(
      new Map([[STONE, enc('vanilla')]]),
      new Map([
        [STONE, enc('pack')],
        [`new/${STONE}`, enc('overlay')],
        ['new/assets/minecraft/textures/block/only.png', enc('only')],
      ]),
    );

  it('shows an active overlay’s files over the pack’s own', () => {
    const store = make();
    expect(dec(store.get(STONE))).toBe('pack');
    const rev = store.rev(STONE);
    store.setOverlays(['new']);
    expect(store.rev(STONE)).toBeGreaterThan(rev);
    expect(dec(store.get(STONE))).toBe('overlay');
    expect(store.source(STONE)).toBe('pack');
    expect(store.list('assets/minecraft/textures/block/')).toContain('assets/minecraft/textures/block/only.png');
    expect(store.canRevertToVanilla(STONE)).toBe(false);
  });

  it('edits the overlay copy, where the game reads it', () => {
    const store = make();
    store.setOverlays(['new']);
    const target = store.writePath(STONE);
    expect(target).toBe(`new/${STONE}`);
    store.setEdit(target, enc('edited'));
    expect(dec(store.get(STONE))).toBe('edited');
    expect(store.source(STONE)).toBe('edited');
    expect(store.editPath(STONE)).toBe(`new/${STONE}`);
    expect(dec(store.exportFiles().get(`new/${STONE}`))).toBe('edited');
    expect(dec(store.exportFiles().get(STONE))).toBe('pack');
  });

  it('checks files in overlays like the files they stand for', () => {
    const meta = enc(JSON.stringify({ pack: { pack_format: 34, description: '' }, overlays: { entries: [{ directory: 'new', formats: [34, 99] }, { directory: 'Bad!', formats: 1 }] } }));
    const store = make();
    const files = new Map([...store.exportFiles(), ['pack.mcmeta', meta], ['stray/readme.txt', enc('x')]]);
    const codes = checkPack(store, files).map((i) => `${i.code}:${i.path}`);
    expect(codes).toContain('badOverlayDir:pack.mcmeta');
    expect(codes).toContain('outsideAssets:stray/readme.txt');
    expect(codes.some((c) => c.startsWith('outsideAssets:new/'))).toBe(false);
  });
});
