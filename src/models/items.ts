import type { AssetStore, Source } from '../assets/AssetStore';
import { specialLayers } from '../entities/specials';
import { allItemModels, itemStatePaths, legacyTints, resolveItemModel, type ItemState, type ModelRef, type StateSwitch } from './itemDefinition';
import { modelTextures, resolveModel, type DisplayContext, type ResolvedModel } from './modelResolver';
import { itemDefinitionPath, modelPath, parseRL, texturePath } from './resourceLocation';

export interface ResolvedItemModel {
  ref: ModelRef;
  model: ResolvedModel;
}

export interface ItemEntry {
  id: string;
  name: string;
  /** Item definition file (1.21.4+) or the item model file (older versions). */
  defPath: string;
  models: ResolvedItemModel[];
  /** Texture ids drawn by the item's (GUI) models. */
  textures: string[];
  /** Every file the item's appearance depends on, in any state. */
  deps: string[];
  /** Strongest source among deps: edited > pack > vanilla. */
  source: Source;
  /** Changes whenever any dependency is edited; used as render cache key. */
  depsKey: string;
}

const NEW_DEF = /^assets\/([^/]+)\/items\/(.+)\.json$/;
const OLD_DEF = /^assets\/([^/]+)\/models\/item\/(.+)\.json$/;

export function usesItemDefinitions(store: AssetStore): boolean {
  return store.list('assets/minecraft/items/').length > 0;
}

/**
 * The models an item shows in a display context and state (see `resolveItemModel`);
 * the dynamic switches on the way are added to `found`.
 */
export function resolveItemModels(
  store: AssetStore,
  id: string,
  context: DisplayContext = 'gui',
  state: ItemState = {},
  found?: StateSwitch[],
): ResolvedItemModel[] {
  const { path } = parseRL(id);
  let refs: ModelRef[];
  if (store.has(itemDefinitionPath(id))) {
    refs = resolveItemModel(store.json<any>(itemDefinitionPath(id))?.model, context, state, found);
  } else {
    const { ns } = parseRL(id);
    refs = [{ model: `${ns}:item/${path}`, tints: legacyTints(path) }];
  }
  return refs.map((ref) => ({ ref, model: resolveModel(store, ref.model) }));
}

const RANK: Record<Source, number> = { vanilla: 0, pack: 1, edited: 2 };

const texturesOf = (models: ResolvedItemModel[]) => [
  ...new Set(
    models.flatMap((m) => {
      const special = m.ref.special && specialLayers(m.ref.special);
      return special ? special.map((l) => l.texture) : modelTextures(m.model);
    }),
  ),
];

function buildEntry(store: AssetStore, id: string, defPath: string, lang: Record<string, string>): ItemEntry {
  const models = resolveItemModels(store, id);
  const textures = texturesOf(models);
  // models of other states and contexts count too, so editing e.g. a bow pulling texture marks the bow
  const others = store.has(itemDefinitionPath(id))
    ? [...allItemModels(store.json<any>(itemDefinitionPath(id))?.model)].filter((m) => !models.some((r) => r.ref.model === m))
    : [];
  const otherModels = others.map((m) => resolveModel(store, m));
  const deps = [defPath, ...[...models.map((m) => m.model), ...otherModels].flatMap((m) => m.chain.map(modelPath))];
  for (const t of new Set([...textures, ...otherModels.flatMap(modelTextures)])) deps.push(texturePath(t), `${texturePath(t)}.mcmeta`);

  let source: Source = 'vanilla';
  for (const d of deps) {
    const s = store.source(d);
    if (s && RANK[s] > RANK[source]) source = s;
  }
  const { ns, path } = parseRL(id);
  const name = lang[`item.${ns}.${path}`] ?? lang[`block.${ns}.${path}`] ?? path.replace(/_/g, ' ');
  return { id, name, defPath, models, textures, deps, source, depsKey: deps.map((d) => store.rev(d)).join('.') };
}

/** The item as it looks in `state`: models and textures of that state, same name and dependencies. */
export function itemVariant(store: AssetStore, item: ItemEntry, state: ItemState): ItemEntry {
  if (Object.keys(state).length === 0) return item;
  const models = resolveItemModels(store, item.id, 'gui', state);
  return { ...item, models, textures: texturesOf(models), depsKey: `${item.depsKey}|${JSON.stringify(state)}` };
}

/** What an item shows, for telling stages apart: models with tints and special settings. */
export const appearanceKey = (models: ResolvedItemModel[]) =>
  JSON.stringify(models.map((m) => [m.ref.model, m.ref.tints, m.ref.special ?? null]));

export interface ItemStage {
  state: ItemState;
  item: ItemEntry;
  key: string;
}

/**
 * Every distinct look of an item in the inventory (bow, bow pulling 0–2; clock 00–63 …), resting
 * state first, then in the order of the item definition. Empty for items without dynamic states.
 */
export function itemStages(store: AssetStore, item: ItemEntry): ItemStage[] {
  if (!store.has(itemDefinitionPath(item.id))) return [];
  const restKey = appearanceKey(item.models);
  const seen = new Set<string>();
  const out: ItemStage[] = [];
  for (const state of itemStatePaths(store.json<any>(itemDefinitionPath(item.id))?.model)) {
    const variant = itemVariant(store, item, state);
    const key = appearanceKey(variant.models);
    if (variant.models.length === 0 || seen.has(key)) continue;
    seen.add(key);
    const stage = { state: key === restKey ? {} : state, item: key === restKey ? item : variant, key };
    if (key === restKey) out.unshift(stage);
    else out.push(stage);
  }
  return out.length > 1 ? out : [];
}

/** The dynamic switches (in use, pull, angle …) an item passes in `state`, in display context `context`. */
export function itemStateSwitches(store: AssetStore, id: string, state: ItemState, context: DisplayContext = 'gui'): StateSwitch[] {
  const found: StateSwitch[] = [];
  resolveItemModels(store, id, context, state, found);
  return found;
}

/** Display names: English from the jar, overlaid with a translation (Minecraft language file) if given. */
export function gameNames(store: AssetStore, translated?: Record<string, string>): Record<string, string> {
  return { ...(store.json<Record<string, string>>('assets/minecraft/lang/en_us.json') ?? {}), ...translated };
}

export function listItems(store: AssetStore, lang: Record<string, string> = gameNames(store)): ItemEntry[] {
  const pattern = usesItemDefinitions(store) ? NEW_DEF : OLD_DEF;
  const out: ItemEntry[] = [];
  for (const p of store.list('assets/')) {
    const m = pattern.exec(p);
    if (m && !(m[1] === 'minecraft' && m[2] === 'air')) out.push(buildEntry(store, `${m[1]}:${m[2]}`, p, lang));
  }
  return out;
}
