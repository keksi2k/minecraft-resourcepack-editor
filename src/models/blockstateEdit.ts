import type { BlockVariant } from './blockVariants';

/**
 * Editing blockstate files: the properties a block has, which `variants` entry or `multipart`
 * cases apply in a state, and conditions (`when`) as plain lists the editor can show.
 */

type Json = Record<string, any>;
export type State = Record<string, string>;

/** Values of one property that a condition accepts. */
export type Group = Record<string, string[]>;
/** Any of the groups (OR); a group needs all of its properties (AND). No groups: always. */
export type Condition = Group[];

export interface Case {
  when?: Json;
  apply: BlockVariant | BlockVariant[];
}

const values = (v: unknown) => String(v).split('|');

/** A `variants` key as properties: `facing=north,half=top`. */
export const parseKey = (key: string): State =>
  Object.fromEntries(
    key
      .split(',')
      .filter(Boolean)
      .map((p) => p.split('=') as [string, string]),
  );

/** The `variants` key of a state, properties in name order like the game writes them. */
export const keyOf = (state: State): string =>
  Object.keys(state)
    .sort()
    .map((k) => `${k}=${state[k]}`)
    .join(',');

function mergeGroups(a: Group, b: Group): Group {
  const out: Group = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = out[k] ? out[k].filter((x) => v.includes(x)) : v;
  return out;
}

/** A `when` as OR-ed groups; AND-ed parts are merged into one group. */
export function parseWhen(when: Json | undefined): Condition {
  if (!when || typeof when !== 'object') return [];
  if (Array.isArray(when.OR)) return when.OR.flatMap((w: Json) => parseWhen(w));
  if (Array.isArray(when.AND)) {
    let groups: Condition = [{}];
    for (const part of when.AND) {
      const next = parseWhen(part);
      groups = next.length ? groups.flatMap((g) => next.map((n) => mergeGroups(g, n))) : groups;
    }
    return groups;
  }
  return [Object.fromEntries(Object.entries(when).map(([k, v]) => [k, values(v)]))];
}

const groupJson = (g: Group): Json => Object.fromEntries(Object.entries(g).filter(([, v]) => v.length).map(([k, v]) => [k, v.join('|')]));

/** A condition as the game reads it: nothing, one object, or `{ "OR": [...] }`. */
export function writeWhen(c: Condition): Json | undefined {
  const groups = c.map(groupJson).filter((g) => Object.keys(g).length);
  if (!groups.length) return undefined;
  return groups.length === 1 ? groups[0] : { OR: groups };
}

export function whenMatches(when: Json | undefined, state: State): boolean {
  const groups = parseWhen(when);
  return !groups.length || groups.some((g) => Object.entries(g).every(([k, v]) => v.includes(state[k] ?? '')));
}

const order = (a: string, b: string) => {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  if ((a === 'false' || a === 'true') && (b === 'false' || b === 'true')) return a === 'false' ? -1 : 1;
  return a.localeCompare(b);
};

/** Every property the file mentions, with all the values it mentions, sorted. */
export function blockProperties(def: Json | undefined): Record<string, string[]> {
  const found: Record<string, Set<string>> = {};
  const add = (k: string, v: string) => (found[k] ??= new Set()).add(v);
  if (def?.variants && typeof def.variants === 'object') for (const key of Object.keys(def.variants)) for (const [k, v] of Object.entries(parseKey(key))) add(k, v);
  if (Array.isArray(def?.multipart)) for (const c of def.multipart) for (const g of parseWhen(c?.when)) for (const [k, vs] of Object.entries(g)) vs.forEach((v) => add(k, v));
  // a yes/no property has both values, even if the file only ever names one
  for (const vs of Object.values(found)) if ([...vs].every((v) => v === 'true' || v === 'false')) vs.add('true').add('false');
  return Object.fromEntries(
    Object.keys(found)
      .sort()
      .map((k) => [k, [...found[k]].sort(order)]),
  );
}

/** How a block usually stands, so a fresh preview shows something familiar. */
const USUAL: State = { facing: 'north', axis: 'y', half: 'bottom', type: 'bottom', face: 'floor', shape: 'straight', part: 'foot', hinge: 'left', attachment: 'floor' };

export function defaultState(props: Record<string, string[]>): State {
  return Object.fromEntries(Object.entries(props).map(([k, vs]) => [k, vs.includes(USUAL[k]) ? USUAL[k] : vs.includes('false') ? 'false' : vs[0]]));
}

/** The `variants` key that applies in a state (it may name only some properties). */
export function variantKeyFor(def: Json | undefined, state: State): string | undefined {
  if (!def?.variants) return undefined;
  return Object.keys(def.variants).find((key) => Object.entries(parseKey(key)).every(([k, v]) => state[k] === v));
}

/** Indices of the multipart cases that apply in a state. */
export function matchingCases(def: Json | undefined, state: State): number[] {
  if (!Array.isArray(def?.multipart)) return [];
  return def.multipart.flatMap((c: Case, i: number) => (whenMatches(c?.when, state) ? [i] : []));
}

const list = (v: unknown): BlockVariant[] => (Array.isArray(v) ? v : v ? [v] : []).filter((x): x is BlockVariant => typeof x?.model === 'string');

/** The models a block shows in a state: one part per variants entry or matching case. */
export function stateParts(def: Json | undefined, state: State): BlockVariant[][] {
  if (def?.variants) {
    const key = variantKeyFor(def, state);
    return key === undefined ? [] : [list(def.variants[key])].filter((p) => p.length);
  }
  return matchingCases(def, state)
    .map((i) => list(def!.multipart[i].apply))
    .filter((p) => p.length);
}

/** The first model of an `apply` / variants entry, with the others (random picks) kept as they are. */
export const firstOf = (v: BlockVariant | BlockVariant[]): BlockVariant => (Array.isArray(v) ? v[0] : v) ?? { model: '' };

export function withFirst(v: BlockVariant | BlockVariant[], first: BlockVariant): BlockVariant | BlockVariant[] {
  const clean: BlockVariant = { model: first.model };
  if (first.x) clean.x = first.x;
  if (first.y) clean.y = first.y;
  if (first.uvlock) clean.uvlock = true;
  if (first.weight !== undefined && first.weight !== 1) clean.weight = first.weight;
  return Array.isArray(v) && v.length > 1 ? [clean, ...v.slice(1)] : clean;
}

/** Turns a `variants` file into `multipart` cases (one per key), which can then be combined freely. */
export function toMultipart(def: Json): Json {
  if (!def?.variants) return def;
  const multipart = Object.entries(def.variants).map(([key, apply]) => {
    const when = writeWhen([Object.fromEntries(Object.entries(parseKey(key)).map(([k, v]) => [k, [v]]))]);
    return when ? { when, apply } : { apply };
  });
  const { variants: _, ...rest } = def;
  return { ...rest, multipart };
}
