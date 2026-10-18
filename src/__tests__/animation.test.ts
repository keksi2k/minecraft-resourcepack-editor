import { describe, expect, it } from 'vitest';
import { frameAt, parseAnimation } from '../render/animation';

describe('texture animations', () => {
  it('uses every frame of a vertical strip by default', () => {
    const a = parseAnimation({ frametime: 2 }, 16, 64)!;
    expect(a).toMatchObject({ fw: 16, fh: 16, columns: 1, total: 8, interpolate: false });
    expect(a.frames.map((f) => f.index)).toEqual([0, 1, 2, 3]);
    expect(frameAt(a, 0).current).toBe(0);
    expect(frameAt(a, 3).current).toBe(1);
    expect(frameAt(a, 9)).toEqual({ current: 0, next: 1, progress: 0.5 });
  });

  it('honours custom frame order, per-frame times and interpolation', () => {
    const a = parseAnimation({ frametime: 1, interpolate: true, frames: [3, { index: 0, time: 4 }, 99] }, 16, 64)!;
    expect(a.frames).toEqual([
      { index: 3, time: 1 },
      { index: 0, time: 4 },
    ]);
    expect(a.total).toBe(5);
    expect(frameAt(a, 3)).toEqual({ current: 0, next: 3, progress: 0.5 });
  });

  it('supports non-square frames and ignores single-frame "animations"', () => {
    expect(parseAnimation({ width: 32, height: 16 }, 32, 64)).toMatchObject({ fw: 32, fh: 16, frames: { length: 4 } });
    expect(parseAnimation({}, 16, 16)).toBeUndefined();
    expect(parseAnimation(undefined, 16, 64)).toBeUndefined();
  });
});
