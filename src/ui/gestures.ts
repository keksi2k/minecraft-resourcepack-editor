/**
 * Two-finger gestures for touch screens: pinch to zoom, drag with two fingers to pan. One finger
 * (or a pen, or the mouse) keeps doing what it does on that surface.
 */

export interface PinchStep {
  /** How much the distance between the fingers grew (1 = unchanged). */
  scale: number;
  /** How far the point between the fingers moved, in pixels. */
  dx: number;
  dy: number;
  /** The point between the fingers, in client pixels. */
  x: number;
  y: number;
}

export class PinchTracker {
  private touches = new Map<number, { x: number; y: number }>();

  /** Fingers on the surface. */
  get count() {
    return this.touches.size;
  }

  /** A finger went down; true if a gesture (two or more fingers) starts or goes on. */
  down(id: number, x: number, y: number): boolean {
    this.touches.set(id, { x, y });
    return this.touches.size >= 2;
  }

  /** A finger moved; the zoom and pan since the last move while two fingers are down. */
  move(id: number, x: number, y: number): PinchStep | undefined {
    const t = this.touches.get(id);
    if (!t) return undefined;
    if (this.touches.size < 2) {
      t.x = x;
      t.y = y;
      return undefined;
    }
    const [a, b] = [...this.touches.values()];
    const before = { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    t.x = x;
    t.y = y;
    const after = { d: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return { scale: before.d > 0 ? after.d / before.d : 1, dx: after.x - before.x, dy: after.y - before.y, x: after.x, y: after.y };
  }

  up(id: number) {
    this.touches.delete(id);
  }
}

/** The eraser end of a pen (or its eraser button). */
export const isPenEraser = (e: { pointerType: string; button: number; buttons: number }) => e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) !== 0);
