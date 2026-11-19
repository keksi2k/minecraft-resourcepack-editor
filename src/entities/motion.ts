/**
 * Simple preview animations for mob models, in the spirit of the game's `setupAnim` code: the head
 * looks around, legs and arms swing while walking, wings flap, tails and fins sway. They work on the
 * part names the vanilla models use, so most mobs move plausibly without code of their own; it is
 * a preview, not the exact in-game animation.
 */

export const MOTIONS = ['still', 'look', 'walk'] as const;
export type Motion = (typeof MOTIONS)[number];

type Rot = [number, number, number];

const LEG = /^(right|left)_(?:(front|hind|mid|middle_front|middle_hind)_)?leg$/;
const NUMBERED_LEG = /^leg(\d)$/;

/**
 * Extra rotation (radians x/y/z, added to the model's own pose) for each part name at `ticks`
 * (20 per second).
 */
export function motionPose(parts: Iterable<string>, ticks: number, motion: Motion): Record<string, Rot> {
  const out: Record<string, Rot> = {};
  if (motion === 'still') return out;
  const add = (name: string, x: number, y: number, z: number) => {
    const r = out[name] ?? [0, 0, 0];
    out[name] = [r[0] + x, r[1] + y, r[2] + z];
  };
  const walking = motion === 'walk';
  // the game's limb swing: position advances with speed, amount is how far the limbs swing
  const swing = ticks * 0.55;
  const amount = 0.8;
  const a = Math.cos(swing * 0.6662);
  const b = Math.cos(swing * 0.6662 + Math.PI);

  for (const name of new Set(parts)) {
    if (name === 'head' || name === 'head_parts') {
      add(name, Math.sin(ticks * 0.027) * 0.18, Math.sin(ticks * 0.035) * 0.55, 0);
      continue;
    }
    if (/wing(_base)?$/.test(name) && !/tip/.test(name)) {
      // flying mobs flap all the time
      const side = name.startsWith('left') ? -1 : 1;
      add(name, 0, 0, Math.sin(ticks * 0.8) * 0.45 * side);
      continue;
    }
    if (/fin$/.test(name) && name !== 'top_fin') {
      add(name, 0, Math.sin(ticks * 0.5) * 0.4, 0);
      continue;
    }
    if (/^tentacle\d+$/.test(name)) {
      add(name, Math.sin(ticks * 0.2 + Number(name.slice(8))) * 0.15, 0, 0);
      continue;
    }
    if (!walking) continue;
    const leg = LEG.exec(name);
    const numbered = NUMBERED_LEG.exec(name);
    if (leg || numbered) {
      // diagonal pairs move together: right hind with left front, like the game's quadrupeds
      const first = leg ? (leg[1] === 'right') !== (leg[2]?.includes('front') ?? false) : ['0', '3'].includes(numbered![1]);
      add(name, (first ? a : b) * 1.4 * amount, 0, 0);
    } else if (name === 'right_arm' || name === 'left_arm') {
      add(name, (name === 'right_arm' ? b : a) * amount, 0, 0);
    } else if (/^tail/.test(name)) {
      add(name, 0, a * 0.3 * amount, 0);
    }
  }
  return out;
}

/** Combines a fixed pose with an animation pose (both added to the model's own rotations). */
export function mergePoses(...poses: (Record<string, Rot> | undefined)[]): Record<string, Rot> {
  const out: Record<string, Rot> = {};
  for (const p of poses) {
    if (!p) continue;
    for (const [k, [x, y, z]] of Object.entries(p)) {
      const r = out[k] ?? [0, 0, 0];
      out[k] = [r[0] + x, r[1] + y, r[2] + z];
    }
  }
  return out;
}
