import type { FaceDir, ModelElement, ModelFace } from './modelResolver';

/**
 * Editing block and item models made of cuboids ("elements"): new cubes, copies, and the limits
 * the game puts on them. Positions are in model pixels: 0–16 is one block.
 */

export const DIRS: FaceDir[] = ['north', 'east', 'south', 'west', 'up', 'down'];
/** The game only turns elements by these angles. */
export const ANGLES = [-45, -22.5, 0, 22.5, 45] as const;
/** Elements may reach this far outside the block. */
export const MIN = -16;
export const MAX = 32;

type Json = Record<string, any>;

/** A full-block cube with every face showing `texture` (a `#variable`). */
export function newCube(texture = '#all'): ModelElement {
  return { from: [0, 0, 0], to: [16, 16, 16], faces: Object.fromEntries(DIRS.map((d) => [d, { texture }])) as Partial<Record<FaceDir, ModelFace>> };
}

const clamp = (v: number) => Math.max(MIN, Math.min(MAX, v));

/** An element with its corners in order and inside the limits. */
export function tidyElement(e: ModelElement): ModelElement {
  const from = e.from.map((v, i) => clamp(Math.min(v, e.to[i]))) as [number, number, number];
  const to = e.to.map((v, i) => clamp(Math.max(v, e.from[i]))) as [number, number, number];
  return { ...e, from, to };
}

/** Problems the game would complain about (it refuses to load such a model). */
export function elementProblems(e: ModelElement): ('range' | 'angle' | 'faces')[] {
  const out: ('range' | 'angle' | 'faces')[] = [];
  if ([...e.from, ...e.to].some((v) => v < MIN || v > MAX)) out.push('range');
  const a = e.rotation?.angle;
  if (a !== undefined && !(ANGLES as readonly number[]).includes(a)) out.push('angle');
  if (!Object.keys(e.faces ?? {}).length) out.push('faces');
  return out;
}

/**
 * The model with its own copy of the elements it inherits, so they can be changed; the parent
 * stays for textures and display settings.
 */
export function withOwnElements(json: Json, inherited: ModelElement[]): Json {
  return { ...json, elements: structuredClone(inherited.length ? inherited : [newCube()]) };
}

/** Texture variables faces can use: the model's own and the inherited ones. */
export function textureVariables(own: Json | undefined, resolved: Record<string, string>): string[] {
  return [...new Set([...Object.keys(resolved), ...Object.keys(own ?? {})])].filter((k) => k !== 'particle').sort();
}

/** Moves an element in a list (for drawing order and tidiness). */
export function moveItem<T>(list: T[], i: number, by: -1 | 1): T[] {
  const to = i + by;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[i], next[to]] = [next[to], next[i]];
  return next;
}
