import { describe, expect, it } from 'vitest';
import { isPenEraser, PinchTracker } from '../ui/gestures';

describe('touch gestures', () => {
  it('only reports a gesture with two fingers', () => {
    const p = new PinchTracker();
    expect(p.down(1, 0, 0)).toBe(false);
    expect(p.move(1, 10, 0)).toBeUndefined();
    expect(p.down(2, 110, 0)).toBe(true);
    expect(p.count).toBe(2);
  });

  it('measures pinch and pan', () => {
    const p = new PinchTracker();
    p.down(1, 0, 0);
    p.down(2, 100, 0);
    // fingers move apart: twice the distance, centre stays
    let s = p.move(2, 200, 0)!;
    expect(s.scale).toBeCloseTo(2);
    expect([s.dx, s.dy]).toEqual([50, 0]);
    // both move down: no zoom, the centre moves
    p.move(1, 0, 30);
    s = p.move(2, 200, 30)!;
    expect(s.scale).toBeCloseTo(1, 1);
    expect(s.dy).toBeCloseTo(15);
    p.up(1);
    expect(p.move(2, 210, 30)).toBeUndefined();
  });

  it('knows a pen eraser', () => {
    expect(isPenEraser({ pointerType: 'pen', button: 5, buttons: 32 })).toBe(true);
    expect(isPenEraser({ pointerType: 'pen', button: 0, buttons: 1 })).toBe(false);
    expect(isPenEraser({ pointerType: 'mouse', button: 5, buttons: 32 })).toBe(false);
  });
});
