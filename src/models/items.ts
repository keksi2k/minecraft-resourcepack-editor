import type { AssetStore, Source } from '../assets/AssetStore';
import { legacyTints, resolveItemModel, type ModelRef } from './itemDefinition';
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
  /** Every file the item's appearance depends on. */
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

export function resolveItemModels(store: AssetStore, id: string, context: DisplayContext = 'gui'): ResolvedItemModel[] {
  const { path } = parseRL(id);
  let refs: ModelRef[];
  if (store.has(itemDefinitionPath(id))) {
    refs = resolveItemModel(store.json<any>(itemDefinitionPath(id))?.model, context);
  } else {
    const { ns } = parseRL(id);
    refs = [{ model: `${ns}:item/${path}`, tints: legacyTints(path) }];
  }
  return refs.map((ref) => ({ ref, model: resolveModel(store, ref.model) }));
}

const RANK: Record<Source, number> = { vanilla: 0, pack: 1, edited: 2 };

function buildEntry(store: AssetStore, id: string, defPath: string, lang: Record<string, string>): ItemEntry {
  const models = resolveItemModels(store, id);
  const textures = [...new Set(models.flatMap((m) => modelTextures(m.model)))];
  const deps = [defPath, ...models.flatMap((m) => m.model.chain.map(modelPath))];
  for (const t of textures) deps.push(texturePath(t), `${texturePath(t)}.mcmeta`);

  let source: Source = 'vanilla';
  for (const d of deps) {
    const s = store.source(d);
    if (s && RANK[s] > RANK[source]) source = s;
  }
  const { ns, path } = parseRL(id);
  const name = lang[`item.${ns}.${path}`] ?? lang[`block.${ns}.${path}`] ?? path.replace(/_/g, ' ');
  return { id, name, defPath, models, textures, deps, source, depsKey: deps.map((d) => store.rev(d)).join('.') };
}

export function listItems(store: AssetStore): ItemEntry[] {
  const lang = store.json<Record<string, string>>('assets/minecraft/lang/en_us.json') ?? {};
  const pattern = usesItemDefinitions(store) ? NEW_DEF : OLD_DEF;
  const out: ItemEntry[] = [];
  for (const p of store.list('assets/')) {
    const m = pattern.exec(p);
    if (m && !(m[1] === 'minecraft' && m[2] === 'air')) out.push(buildEntry(store, `${m[1]}:${m[2]}`, p, lang));
  }
  return out;
}
