/**
 * A plural message: picked with Intl.PluralRules for the `count` variable.
 * `other` is required; add whichever categories the language uses (zero, one, two, few, many).
 */
export interface Plural {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string;
}

type Leaf = string | Plural;

/** Turns the literal types of the English catalogue into plain strings, keeping its shape. */
export type Shape<T> = T extends string ? string : T extends { other: string } ? Plural : { [K in keyof T]: Shape<T[K]> };

/** A translation may leave out messages; they fall back to English. */
export type PartialShape<T> = T extends string | Plural ? T : { [K in keyof T]?: PartialShape<T[K]> };

/** Dotted paths to every message, e.g. `items.search`. */
export type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends Leaf ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type Vars = Record<string, string | number>;
