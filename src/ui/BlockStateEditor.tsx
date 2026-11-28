import { useEffect, useMemo, useRef, useState } from 'react';
import { parseLenientJson } from '../assets/AssetStore';
import { useT } from '../i18n';
import {
  blockProperties,
  defaultState,
  firstOf,
  keyOf,
  matchingCases,
  parseKey,
  parseWhen,
  stateParts,
  toMultipart,
  variantKeyFor,
  withFirst,
  writeWhen,
  type Case,
  type Condition,
  type State,
} from '../models/blockstateEdit';
import { ROTATIONS, type BlockVariant } from '../models/blockVariants';
import { buildItemObject } from '../render/buildMesh';
import { blockModels, DEFAULT_TINTS } from '../scenes/sandbox';
import { useApp } from '../state/appStore';
import { useEditor } from '../state/editorStore';
import { Btn } from './common';
import { ObjectViewer } from './ItemViewer';

type Json = Record<string, any>;

/** Model ids for the model fields' suggestions. */
export function useModelIds(): string[] {
  const store = useApp((s) => s.store);
  const revision = useApp((s) => s.revision);
  return useMemo(() => {
    if (!store) return [];
    const out: string[] = [];
    for (const p of store.list('assets/')) {
      const m = /^assets\/([^/]+)\/models\/(.+)\.json$/.exec(p);
      if (m) out.push(`${m[1]}:${m[2]}`);
    }
    return out.sort();
  }, [store, revision]);
}

/**
 * Edits a blockstate file: pick a state and see the block in it, change which model each state (or
 * each multipart case) shows, and the conditions of multipart cases – fences, walls, redstone.
 */
export function BlockStateEditor({ path, bytes, onDone }: { path: string; bytes: Uint8Array; onDone: () => void }) {
  const t = useT();
  const { store, setFile, revision } = useApp();
  const [def, setDef] = useState<Json>(() => {
    try {
      return (parseLenientJson(new TextDecoder().decode(bytes)) as Json) ?? {};
    } catch {
      return {};
    }
  });
  const undo = useRef<Json[]>([]);
  const redo = useRef<Json[]>([]);
  const [dirty, setDirty] = useState(false);
  const change = (next: Json) => {
    undo.current.push(def);
    redo.current = [];
    setDef(next);
    setDirty(true);
    useEditor.setState({ dirty: true });
  };
  const step = (from: typeof undo, to: typeof undo) => {
    const prev = from.current.pop();
    if (!prev) return;
    to.current.push(def);
    setDef(prev);
    setDirty(true);
  };

  const m = /^assets\/([^/]+)\/blockstates\/(.+)\.json$/.exec(path);
  const blockId = m ? `${m[1]}:${m[2]}` : path;
  // the game's own file names properties this one may leave out
  const vanilla = useMemo(() => {
    const v = store?.vanilla.get(path);
    try {
      return v ? (parseLenientJson(new TextDecoder().decode(v)) as Json) : undefined;
    } catch {
      return undefined;
    }
  }, [store, path]);
  const props = useMemo(() => {
    const own = blockProperties(def);
    const theirs = blockProperties(vanilla);
    const all: Record<string, string[]> = { ...theirs };
    for (const [k, vs] of Object.entries(own)) all[k] = [...new Set([...(all[k] ?? []), ...vs])];
    return all;
  }, [def, vanilla]);
  const [picked, setPicked] = useState<State>({});
  const state: State = { ...defaultState(props), ...picked };
  const parts = stateParts(def, state);
  const modelIds = useModelIds();
  const multipart = Array.isArray(def.multipart);
  const matchKey = variantKeyFor(def, state);
  const matching = new Set(matchingCases(def, state));

  const save = () => {
    setFile(path, new TextEncoder().encode(JSON.stringify(def, null, 2)));
    useEditor.setState({ dirty: false });
    onDone();
  };
  const close = () => {
    if (!dirty || confirm(t('editor.unsaved'))) onDone();
  };
  const keys = useRef<(e: KeyboardEvent) => void>();
  keys.current = (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      return e.shiftKey ? step(redo, undo) : step(undo, redo);
    }
    if ((e.ctrlKey || e.metaKey) && k === 'y') {
      e.preventDefault();
      return step(redo, undo);
    }
    if ((e.ctrlKey || e.metaKey) && k === 's') {
      e.preventDefault();
      return save();
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current?.(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // variants
  const setVariant = (key: string, v: BlockVariant) => change({ ...def, variants: { ...def.variants, [key]: withFirst(def.variants[key], v) } });
  const removeVariant = (key: string) => {
    const { [key]: _, ...rest } = def.variants;
    change({ ...def, variants: rest });
  };
  const addVariant = () => {
    const key = keyOf(state);
    if (def.variants?.[key]) return;
    const copy = matchKey !== undefined ? def.variants[matchKey] : { model: modelIds.find((x) => x.startsWith('minecraft:block/')) ?? 'minecraft:block/stone' };
    change({ ...def, variants: { ...def.variants, [key]: copy } });
  };
  // multipart
  const cases: Case[] = multipart ? def.multipart : [];
  const setCases = (next: Case[]) => change({ ...def, multipart: next });
  const setCase = (i: number, c: Case) => setCases(cases.map((x, j) => (j === i ? c : x)));
  const moveCase = (i: number, by: -1 | 1) => {
    const to = i + by;
    if (to < 0 || to >= cases.length) return;
    const next = [...cases];
    [next[i], next[to]] = [next[to], next[i]];
    setCases(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <span className="font-semibold">{t('blockstate.title')}</span>
        <span className="min-w-0 truncate font-mono text-xs text-neutral-400">{path}</span>
        <span className="text-xs text-neutral-500">{multipart ? t('blockstate.multipartCount', { count: cases.length }) : t('blockstate.variantCount', { count: Object.keys(def.variants ?? {}).length })}</span>
        <div className="ml-auto flex gap-1">
          <Btn onClick={() => step(undo, redo)} disabled={!undo.current.length}>{t('editor.undo')}</Btn>
          <Btn onClick={() => step(redo, undo)} disabled={!redo.current.length}>{t('editor.redo')}</Btn>
          <Btn onClick={close}>{t('editor.cancel')}</Btn>
          <Btn tone="primary" onClick={save} disabled={!dirty}>{t('editor.save')}</Btn>
        </div>
      </div>
      <datalist id="blockstate-models">
        {modelIds.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[42%] min-w-72 flex-col gap-2 border-r border-neutral-800 p-3 text-xs">
          <div className="h-72 shrink-0">
            {store && (
              <ObjectViewer
                buildKey={`${blockId}|${JSON.stringify(parts)}|${revision}`}
                build={() => buildItemObject(store, blockModels(store, blockId, parts, parts.map(() => 0), DEFAULT_TINTS), 'none')}
              />
            )}
          </div>
          <div className="font-semibold text-neutral-300">{t('blockstate.state')}</div>
          {Object.keys(props).length === 0 && <p className="text-neutral-500">{t('blockstate.noProperties')}</p>}
          <div className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 overflow-y-auto">
            {Object.entries(props).map(([k, vs]) => (
              <label key={k} className="contents">
                <span className="font-mono text-neutral-400">{k}</span>
                <select value={state[k]} onChange={(e) => setPicked({ ...picked, [k]: e.target.value })} className="rounded bg-neutral-800 px-1 py-0.5 font-mono">
                  {vs.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-neutral-500">{multipart ? t('blockstate.multipartHint', { count: matching.size }) : matchKey === undefined ? t('blockstate.noVariant') : t('blockstate.variantHint')}</p>
        </div>
        <div className="min-w-0 flex-1 overflow-y-auto p-3 text-xs">
          {multipart ? (
            <div className="flex flex-col gap-2">
              {cases.map((c, i) => (
                <div key={i} className={`rounded p-2 ${matching.has(i) ? 'bg-emerald-950/60 ring-1 ring-emerald-700' : 'bg-neutral-900'}`}>
                  <div className="mb-1.5 flex items-center gap-1">
                    <span className="font-semibold text-neutral-300">{t('blockstate.case', { n: i + 1 })}</span>
                    {matching.has(i) && <span className="text-emerald-400">{t('blockstate.shown')}</span>}
                    <span className="ml-auto flex gap-1">
                      <Btn onClick={() => moveCase(i, -1)} disabled={i === 0} title={t('blockstate.up')}>▲</Btn>
                      <Btn onClick={() => moveCase(i, 1)} disabled={i === cases.length - 1} title={t('blockstate.down')}>▼</Btn>
                      <Btn onClick={() => setCases([...cases.slice(0, i + 1), structuredClone(c), ...cases.slice(i + 1)])} title={t('blockstate.duplicate')}>⧉</Btn>
                      <Btn tone="danger" onClick={() => setCases(cases.filter((_, j) => j !== i))} title={t('blockstate.remove')}>✕</Btn>
                    </span>
                  </div>
                  <ConditionEditor
                    condition={parseWhen(c.when)}
                    props={props}
                    onChange={(cond) => {
                      const when = writeWhen(cond);
                      const { when: _, ...rest } = c;
                      setCase(i, when ? { ...rest, when } : rest);
                    }}
                  />
                  <ApplyFields value={firstOf(c.apply)} extra={Array.isArray(c.apply) ? c.apply.length - 1 : 0} onChange={(v) => setCase(i, { ...c, apply: withFirst(c.apply, v) })} />
                </div>
              ))}
              <div className="flex flex-wrap gap-1">
                <Btn tone="primary" onClick={() => setCases([...cases, { apply: { model: parts[0]?.[0]?.model ?? 'minecraft:block/stone' } }])}>{t('blockstate.addCase')}</Btn>
                <Btn
                  onClick={() =>
                    setCases([...cases, { when: writeWhen([Object.fromEntries(Object.entries(state).map(([k, v]) => [k, [v]]))]), apply: { model: parts[0]?.[0]?.model ?? 'minecraft:block/stone' } }])
                  }
                  title={t('blockstate.addForStateTitle')}
                >
                  {t('blockstate.addForState')}
                </Btn>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {Object.entries(def.variants ?? {}).map(([key, v]) => (
                <div key={key} className={`rounded p-2 ${key === matchKey ? 'bg-emerald-950/60 ring-1 ring-emerald-700' : 'bg-neutral-900'}`}>
                  <div className="mb-1.5 flex items-center gap-1">
                    <button
                      onClick={() => setPicked({ ...picked, ...parseKey(key) })}
                      title={t('blockstate.showState')}
                      className="min-w-0 truncate text-left font-mono text-neutral-300 hover:underline"
                    >
                      {key || t('variants.anyState')}
                    </button>
                    {key === matchKey && <span className="text-emerald-400">{t('blockstate.shown')}</span>}
                    <span className="ml-auto">
                      <Btn tone="danger" onClick={() => removeVariant(key)} title={t('blockstate.remove')}>✕</Btn>
                    </span>
                  </div>
                  <ApplyFields value={firstOf(v as BlockVariant)} extra={Array.isArray(v) ? v.length - 1 : 0} onChange={(next) => setVariant(key, next)} />
                </div>
              ))}
              <div className="flex flex-wrap gap-1">
                <Btn tone="primary" onClick={addVariant} disabled={!!def.variants?.[keyOf(state)]} title={t('blockstate.addVariantTitle')}>
                  {t('blockstate.addVariant', { key: keyOf(state) || '""' })}
                </Btn>
                <Btn onClick={() => change(toMultipart(def))} title={t('blockstate.toMultipartTitle')}>{t('blockstate.toMultipart')}</Btn>
              </div>
            </div>
          )}
          <p className="mt-3 text-[11px] leading-snug text-neutral-500">{t('blockstate.hint')}</p>
        </div>
      </div>
    </div>
  );
}

/** Model, rotations and uvlock of the first entry; further entries (random picks) stay as they are. */
function ApplyFields({ value, extra, onChange }: { value: BlockVariant; extra: number; onChange: (v: BlockVariant) => void }) {
  const t = useT();
  const [draft, setDraft] = useState(value.model);
  useEffect(() => setDraft(value.model), [value.model]);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        list="blockstate-models"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => draft.trim() && draft !== value.model && onChange({ ...value, model: draft.trim() })}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        aria-label={t('blockstate.model')}
        spellCheck={false}
        className="min-w-0 flex-1 rounded bg-neutral-800 px-1 py-0.5 font-mono"
      />
      <select value={value.y ?? 0} onChange={(e) => onChange({ ...value, y: Number(e.target.value) })} title={t('variants.rotateY')} className="rounded bg-neutral-800 px-1 py-0.5">
        {ROTATIONS.map((r) => (
          <option key={r} value={r}>
            ↻{r}°
          </option>
        ))}
      </select>
      <select value={value.x ?? 0} onChange={(e) => onChange({ ...value, x: Number(e.target.value) })} title={t('variants.rotateX')} className="rounded bg-neutral-800 px-1 py-0.5">
        {ROTATIONS.map((r) => (
          <option key={r} value={r}>
            ⤾{r}°
          </option>
        ))}
      </select>
      <label className="flex items-center gap-0.5" title={t('variants.uvlockTitle')}>
        <input type="checkbox" checked={!!value.uvlock} onChange={(e) => onChange({ ...value, uvlock: e.target.checked || undefined })} />
        uvlock
      </label>
      {extra > 0 && <span className="text-neutral-500">{t('blockstate.randomExtra', { count: extra })}</span>}
    </div>
  );
}

/** A multipart condition: groups of property values; any group may match (OR), all in a group must (AND). */
function ConditionEditor({ condition, props, onChange }: { condition: Condition; props: Record<string, string[]>; onChange: (c: Condition) => void }) {
  const t = useT();
  const set = (i: number, g: Condition[number]) => onChange(condition.map((x, j) => (j === i ? g : x)));
  // a group needs something in it, else it is dropped when written
  const first = Object.keys(props)[0];
  const fresh = (): Condition[number] => (first ? { [first]: [props[first][0]] } : {});
  if (!condition.length)
    return (
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-neutral-400">{t('blockstate.always')}</span>
        <Btn onClick={() => onChange([fresh()])} disabled={!first}>{t('blockstate.addCondition')}</Btn>
      </div>
    );
  return (
    <div className="mb-1.5 flex flex-col gap-1">
      {condition.map((group, i) => {
        const free = Object.keys(props).filter((k) => !(k in group));
        return (
          <div key={i} className="rounded border border-neutral-800 p-1.5">
            {i > 0 && <div className="mb-1 text-[10px] font-semibold uppercase text-amber-400">{t('blockstate.or')}</div>}
            {Object.entries(group).map(([k, vs]) => (
              <div key={k} className="mb-1 flex flex-wrap items-center gap-1">
                <span className="w-20 truncate font-mono text-neutral-400" title={k}>
                  {k}
                </span>
                {(props[k] ?? vs).map((v) => {
                  const on = vs.includes(v);
                  return (
                    <button
                      key={v}
                      onClick={() => set(i, { ...group, [k]: on ? vs.filter((x) => x !== v) : [...vs, v] })}
                      aria-pressed={on}
                      className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${on ? 'bg-sky-800' : 'bg-neutral-800 text-neutral-500 hover:bg-neutral-700'}`}
                    >
                      {v}
                    </button>
                  );
                })}
                <button
                  onClick={() => {
                    const { [k]: _, ...rest } = group;
                    set(i, rest);
                  }}
                  title={t('blockstate.removeProperty')}
                  className="ml-auto text-neutral-500 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-1">
              {free.length > 0 && (
                <select
                  value=""
                  onChange={(e) => e.target.value && set(i, { ...group, [e.target.value]: [props[e.target.value][0]] })}
                  aria-label={t('blockstate.addProperty')}
                  className="rounded bg-neutral-800 px-1 py-0.5"
                >
                  <option value="">{t('blockstate.addProperty')}</option>
                  {free.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              )}
              <Btn onClick={() => onChange(condition.filter((_, j) => j !== i))} title={t('blockstate.removeGroup')}>
                {t('blockstate.removeGroup')}
              </Btn>
            </div>
          </div>
        );
      })}
      <div>
        <Btn onClick={() => onChange([...condition, fresh()])} disabled={!first} title={t('blockstate.addOrTitle')}>{t('blockstate.addOr')}</Btn>
      </div>
    </div>
  );
}
