import { stripNs } from './itemDefinition';
import { parseRL } from './resourceLocation';

/**
 * Item textures by custom name (anvil rename), 1.21.5+: the item definition's model is wrapped in a
 * `select` on the `custom_name` component. Every case shows its own model; the original model
 * becomes the fallback, so unnamed items look as before.
 */

/** Pack format of 1.21.5, the first version with the `component` select property. */
export const CUSTOM_NAME_FORMAT = 55;

type Json = Record<string, any>;

export interface NameRule {
  /** Names that show this model (exact match, case-sensitive). */
  names: string[];
  /** The model shown for these names. */
  model: string;
}

export interface NameRules {
  /** The item's own model node (shown without a matching name). */
  base: Json | undefined;
  rules: NameRule[];
  /** Cases this editor can't show (not a plain model), kept as they are. */
  other: Json[];
}

const isNameSelect = (node: Json | undefined) =>
  !!node && stripNs(node.type) === 'select' && stripNs(node.property) === 'component' && stripNs(node.component) === 'custom_name';

/** The name rules of an item definition, if its model is wrapped in a custom-name select. */
export function readNameRules(def: Json | undefined): NameRules {
  const model = def?.model;
  if (!isNameSelect(model)) return { base: model, rules: [], other: [] };
  const rules: NameRule[] = [];
  const other: Json[] = [];
  for (const c of model.cases ?? []) {
    const names = [c?.when].flat().filter((n): n is string => typeof n === 'string');
    if (names.length && stripNs(c.model?.type) === 'model' && typeof c.model.model === 'string' && Object.keys(c.model).length === 2) {
      rules.push({ names, model: c.model.model });
    } else other.push(c);
  }
  return { base: model.fallback, rules, other };
}

/** The item definition with these rules; without any, just the item's own model again. */
export function writeNameRules(def: Json | undefined, { base, rules, other }: NameRules): Json {
  const next: Json = { ...def };
  const cases = [
    ...rules
      .filter((r) => r.names.length)
      .map((r) => ({ when: r.names.length === 1 ? r.names[0] : r.names, model: { type: 'minecraft:model', model: r.model } })),
    ...other,
  ];
  next.model = cases.length
    ? { type: 'minecraft:select', property: 'minecraft:component', component: 'minecraft:custom_name', cases, ...(base ? { fallback: base } : {}) }
    : base;
  return next;
}

/** A file-name-safe version of a name: lower case, a–z 0–9 and _. */
export function slugify(name: string): string {
  const s = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s || 'named';
}

/** Model and texture id for a named variant, e.g. `minecraft:item/named/diamond_sword/excalibur`. */
export function namedId(itemId: string, name: string, taken: (id: string) => boolean): string {
  const { ns, path } = parseRL(itemId);
  const base = `${ns}:item/named/${path}/${slugify(name)}`;
  let id = base;
  for (let i = 2; taken(id); i++) id = `${base}_${i}`;
  return id;
}

/** A flat item model showing one texture, held like the original (tools are held diagonally). */
export function namedModelJson(textureId: string, handheld: boolean): Json {
  return { parent: handheld ? 'minecraft:item/handheld' : 'minecraft:item/generated', textures: { layer0: textureId } };
}

/** Splits user input like "Excalibur | Sword of Light" into names (names may contain commas, rarely a bar). */
export const parseNames = (text: string) => [...new Set(text.split('|').map((n) => n.trim()).filter(Boolean))];
export const joinNames = (names: string[]) => names.join(' | ');
