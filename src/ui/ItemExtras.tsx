import { useEffect, useMemo, useState } from 'react';
import { parseLenientJson, type AssetStore } from '../assets/AssetStore';
import { useT } from '../i18n';
import {
  ROTATIONS,
  setVariantList,
  textureVarsOf,
  variantChances,
  variantId,
  variantKeys,
  variantList,
  variantModelJson,
  withRotations,
  type BlockVariant,
} from '../models/blockVariants';
import { CUSTOM_NAME_FORMAT, joinNames, namedId, namedModelJson, parseNames, readNameRules, writeNameRules, type NameRule } from '../models/customNames';
import type { ItemEntry } from '../models/items';
import { modelTextures, resolveModel } from '../models/modelResolver';
import { itemDefinitionPath, modelPath, normalizeRL, parseRL, texturePath } from '../models/resourceLocation';
import { useApp } from '../state/appStore';
import { AssetActions, Btn, ensurePng, pickFile } from './common';
import { Section } from './ItemDetail';
import { NumberField } from './TextureMetaPanel';
import { TextureThumb } from './TexturesView';

const encoder = new TextEncoder();
const json = (o: unknown) => encoder.encode(JSON.stringify(o, null, 2));

/** Removes a file this editor created (in the pack or edited), leaving vanilla files alone. */
function dropOwnFile(store: AssetStore, path: string) {
  const { setFile, resetFile } = useApp.getState();
  if (store.vanilla.has(path)) return;
  if (store.pack.has(path)) setFile(path, null);
  else if (store.edits.has(path)) resetFile(path);
}

async function readPng(file: File): Promise<Uint8Array> {
  return ensurePng(new Uint8Array(await file.arrayBuffer()));
}

/** "Rename the item in an anvil to get another texture" (1.21.5+ item definitions). */
export function CustomNamesSection({ store, item }: { store: AssetStore; item: ItemEntry }) {
  const t = useT();
  const { setFile, resetFile, gameFormat } = useApp();
  useApp((s) => s.revision);
  const defPath = itemDefinitionPath(item.id);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  if (!store.has(defPath)) return null;
  const def = store.json<any>(defPath);
  const state = readNameRules(def);
  const supported = gameFormat === undefined || gameFormat >= CUSTOM_NAME_FORMAT;
  const handheld = item.models.some((m) => m.model.chain.some((c) => /^minecraft:item\/handheld/.test(c)));
  const write = (rules: NameRule[]) => {
    const next = writeNameRules(def, { ...state, rules });
    // back to how the pack (or vanilla) has it: drop the edit instead of keeping an identical copy
    const original = store.pack.get(defPath) ?? store.vanilla.get(defPath);
    let same = false;
    try {
      same = !!original && JSON.stringify(parseLenientJson(new TextDecoder().decode(original))) === JSON.stringify(next);
    } catch {
      same = false;
    }
    if (same && store.edits.has(defPath)) resetFile(defPath);
    else setFile(defPath, json(next));
  };
  const textureOf = (model: string) => {
    const m = resolveModel(store, model);
    return m.layers[0] ?? modelTextures(m)[0];
  };

  const add = async () => {
    const names = parseNames(draft);
    if (!names.length) return;
    const file = await pickFile('image/*');
    if (!file) return;
    setBusy(true);
    try {
      const id = namedId(item.id, names[0], (x) => store.has(modelPath(x)) || store.has(texturePath(x)));
      setFile(texturePath(id), await readPng(file));
      setFile(modelPath(id), json(namedModelJson(id, handheld)));
      write([...state.rules, { names, model: id }]);
      setDraft('');
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = (i: number) => {
    const rule = state.rules[i];
    write(state.rules.filter((_, j) => j !== i));
    // the files made for this name go too, unless another name still uses them
    if (!state.rules.some((r, j) => j !== i && r.model === rule.model) && /\/named\//.test(rule.model)) {
      const tex = textureOf(rule.model);
      dropOwnFile(store, modelPath(rule.model));
      if (tex && /\/named\//.test(tex)) dropOwnFile(store, texturePath(tex));
    }
  };

  return (
    <Section title={t('names.title', { count: state.rules.length })}>
      <div className="flex flex-col gap-2 text-xs">
        <p className="text-neutral-400">{t('names.intro')}</p>
        {!supported && <p className="rounded bg-amber-950 p-2 text-amber-200">{t('names.unsupported')}</p>}
        {state.rules.map((rule, i) => {
          const tex = textureOf(rule.model);
          return (
            <div key={`${rule.model}:${i}`} className="flex items-start gap-2 rounded bg-neutral-900 p-2">
              {tex ? <TextureThumb store={store} path={texturePath(tex)} className="checker h-10 w-10 shrink-0 rounded" /> : <div className="h-10 w-10" />}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <NamesField value={rule.names} onCommit={(names) => names.length && write(state.rules.map((r, j) => (j === i ? { ...r, names } : r)))} />
                <div className="truncate font-mono text-[10px] text-neutral-500" title={rule.model}>
                  {rule.model}
                </div>
                {tex && (
                  <AssetActions path={texturePath(tex)} source={store.source(texturePath(tex))} load={async () => store.get(texturePath(tex))} kind="texture" vanillaAvailable={store.vanilla.has(texturePath(tex))} allowDiscard={false} />
                )}
              </div>
              <Btn tone="danger" onClick={() => remove(i)} title={t('names.remove')}>✕</Btn>
            </div>
          );
        })}
        {state.other.length > 0 && <p className="text-neutral-500">{t('names.other', { count: state.other.length })}</p>}
        <div className="flex items-center gap-1">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void add()}
            placeholder={t('names.placeholder')}
            className="min-w-0 flex-1 rounded bg-neutral-800 px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <Btn tone="primary" onClick={() => void add()} disabled={busy || !parseNames(draft).length}>{t('names.add')}</Btn>
        </div>
        <p className="text-[11px] text-neutral-500">{t('names.hint')}</p>
      </div>
    </Section>
  );
}

function NamesField({ value, onCommit }: { value: string[]; onCommit: (names: string[]) => void }) {
  const [draft, setDraft] = useState(joinNames(value));
  useEffect(() => setDraft(joinNames(value)), [value.join('\n')]);
  return (
    <input
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const names = parseNames(draft);
        if (names.length && joinNames(names) !== joinNames(value)) onCommit(names);
        else setDraft(joinNames(value));
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="rounded bg-neutral-800 px-1.5 py-0.5 font-medium outline-none focus:ring-1 focus:ring-emerald-500"
    />
  );
}

/** Several models for one block state, picked at random per block position (by weight). */
export function BlockVariantsSection({ store, item }: { store: AssetStore; item: ItemEntry }) {
  const t = useT();
  const { setFile } = useApp();
  useApp((s) => s.revision);
  const { ns, path } = parseRL(item.id);
  const bsPath = `assets/${ns}/blockstates/${path}.json`;
  const bs = store.json<any>(bsPath);
  const keys = variantKeys(bs);
  const [key, setKey] = useState<string>();
  const [swap, setSwap] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setKey(undefined);
    setSwap(undefined);
  }, [item.id]);
  const current = key !== undefined && keys.includes(key) ? key : keys.includes('') ? '' : keys[0];
  const list = useMemo(() => (current === undefined ? [] : variantList(bs, current)), [bs, current]);
  const base = list[0] && resolveModel(store, list[0].model);
  const baseTextures = base ? modelTextures(base) : [];
  const swapTexture = swap && baseTextures.includes(swap) ? swap : baseTextures[0];
  if (!store.has(bsPath)) return null;

  const write = (next: BlockVariant[]) => current !== undefined && setFile(bsPath, json(setVariantList(bs, current, next)));
  const update = (i: number, patch: Partial<BlockVariant>) => write(list.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const chances = variantChances(list);

  const addTexture = async () => {
    if (!base || !swapTexture) return;
    const file = await pickFile('image/*');
    if (!file) return;
    setBusy(true);
    try {
      const id = variantId(item.id, (x) => store.has(modelPath(x)) || store.has(texturePath(x)));
      setFile(texturePath(id), await readPng(file));
      setFile(modelPath(id), json(variantModelJson(normalizeRL(list[0].model), Object.fromEntries(textureVarsOf(base, swapTexture).map((k) => [k, id])))));
      write([...list, { model: id }]);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = (i: number) => {
    const gone = list[i];
    write(list.filter((_, j) => j !== i));
    if (!list.some((v, j) => j !== i && v.model === gone.model) && /_variant_\d+$/.test(gone.model)) {
      const m = normalizeRL(gone.model);
      dropOwnFile(store, modelPath(m));
      if (store.has(texturePath(m))) dropOwnFile(store, texturePath(m));
    }
  };

  return (
    <Section title={t('variants.title', { count: list.length })}>
      <div className="flex flex-col gap-2 text-xs">
        <p className="text-neutral-400">{t('variants.intro')}</p>
        {keys.length === 0 ? (
          <p className="text-neutral-500">{t('variants.multipart')}</p>
        ) : (
          <>
            {keys.length > 1 && (
              <label className="flex items-center gap-2">
                <span className="text-neutral-400">{t('variants.state')}</span>
                <select value={current} onChange={(e) => setKey(e.target.value)} className="min-w-0 max-w-64 rounded bg-neutral-800 px-1 py-0.5 font-mono">
                  {keys.map((k) => (
                    <option key={k} value={k}>
                      {k || t('variants.anyState')}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {list.map((v, i) => {
              const model = resolveModel(store, v.model);
              const tex = modelTextures(model).find((x) => !baseTextures.includes(x)) ?? modelTextures(model)[0];
              return (
                <div key={i} className="flex items-start gap-2 rounded bg-neutral-900 p-1.5">
                  {tex && <TextureThumb store={store} path={texturePath(tex)} className="checker h-10 w-10 shrink-0 rounded-sm" />}
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={v.model}>
                        {v.model.replace(/^minecraft:/, '')}
                      </span>
                      <span className="shrink-0 text-neutral-400" title={t('variants.chance')}>
                        {Math.round(chances[i] * 100)} %
                      </span>
                      <Btn tone="danger" onClick={() => remove(i)} disabled={list.length <= 1} title={t('variants.remove')}>✕</Btn>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <NumberField value={v.weight} placeholder="1" min={1} max={1000} title={t('variants.weight')} onCommit={(weight) => update(i, { weight })} />
                      <select value={v.y ?? 0} onChange={(e) => update(i, { y: Number(e.target.value) })} title={t('variants.rotateY')} className="rounded bg-neutral-800 px-1 py-0.5">
                        {ROTATIONS.map((r) => (
                          <option key={r} value={r}>
                            ↻{r}°
                          </option>
                        ))}
                      </select>
                      <select value={v.x ?? 0} onChange={(e) => update(i, { x: Number(e.target.value) })} title={t('variants.rotateX')} className="rounded bg-neutral-800 px-1 py-0.5">
                        {ROTATIONS.map((r) => (
                          <option key={r} value={r}>
                            ⤾{r}°
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-0.5" title={t('variants.uvlockTitle')}>
                        <input type="checkbox" checked={!!v.uvlock} onChange={(e) => update(i, { uvlock: e.target.checked || undefined })} />
                        uvlock
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="flex flex-wrap items-center gap-1">
              <Btn onClick={() => list[0] && write(withRotations(list, list[0]))} disabled={!list.length} title={t('variants.rotationsTitle')}>{t('variants.rotations')}</Btn>
              <Btn tone="primary" onClick={() => void addTexture()} disabled={busy || !swapTexture} title={t('variants.addTextureTitle')}>{t('variants.addTexture')}</Btn>
              {baseTextures.length > 1 && (
                <select value={swapTexture} onChange={(e) => setSwap(e.target.value)} title={t('variants.swapTitle')} className="max-w-48 rounded bg-neutral-800 px-1 py-0.5 font-mono">
                  {baseTextures.map((x) => (
                    <option key={x} value={x}>
                      {x.replace(/^minecraft:/, '')}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <p className="text-[11px] text-neutral-500">{t('variants.hint')}</p>
          </>
        )}
      </div>
    </Section>
  );
}
