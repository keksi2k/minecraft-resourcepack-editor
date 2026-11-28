import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { parseLenientJson } from '../assets/AssetStore';
import { useT } from '../i18n';
import { ANGLES, DIRS, elementProblems, moveItem, newCube, textureVariables, tidyElement, withOwnElements } from '../models/modelEdit';
import { resolveModel, type FaceDir, type ModelElement, type ModelFace } from '../models/modelResolver';
import { modelPath, texturePath } from '../models/resourceLocation';
import { buildModelObject } from '../render/buildMesh';
import { useApp } from '../state/appStore';
import { useEditor } from '../state/editorStore';
import { useModelIds } from './BlockStateEditor';
import { Btn } from './common';
import { ObjectViewer } from './ItemViewer';
import { TextureThumb } from './TexturesView';

type Json = Record<string, any>;
type Vec3 = [number, number, number];

/** Texture ids for the texture fields' suggestions. */
function useTextureIds(): string[] {
  const store = useApp((s) => s.store);
  const revision = useApp((s) => s.revision);
  return useMemo(() => {
    if (!store) return [];
    const out: string[] = [];
    for (const p of store.list('assets/')) {
      const m = /^assets\/([^/]+)\/textures\/((?:block|item)\/.+)\.png$/.exec(p);
      if (m) out.push(`${m[1]}:${m[2]}`);
    }
    return out.sort();
  }, [store, revision]);
}

/**
 * Edits a block or item model made of cuboids: the texture variables, and each element's corners,
 * rotation and faces, with the model in 3D next to it (the chosen element outlined).
 */
export function ModelEditor({ path, bytes, onDone }: { path: string; bytes: Uint8Array; onDone: () => void }) {
  const t = useT();
  const { store, setFile, revision } = useApp();
  const [json, setJson] = useState<Json>(() => {
    try {
      return (parseLenientJson(new TextDecoder().decode(bytes)) as Json) ?? {};
    } catch {
      return {};
    }
  });
  const undo = useRef<Json[]>([]);
  const redo = useRef<Json[]>([]);
  const [dirty, setDirty] = useState(false);
  const [sel, setSel] = useState(0);
  const change = (next: Json) => {
    undo.current.push(json);
    redo.current = [];
    setJson(next);
    setDirty(true);
    useEditor.setState({ dirty: true });
  };
  const step = (from: typeof undo, to: typeof undo) => {
    const prev = from.current.pop();
    if (!prev) return;
    to.current.push(json);
    setJson(prev);
    setDirty(true);
  };

  const m = /^assets\/([^/]+)\/models\/(.+)\.json$/.exec(path);
  const id = m ? `${m[1]}:${m[2]}` : path;
  // the model as it would be with this draft saved
  const draftSource = useMemo(() => ({ json: <T,>(p: string) => (p === modelPath(id) ? (json as T) : store?.json<T>(p)) }), [json, store, id, revision]);
  const resolved = useMemo(() => resolveModel(draftSource, id), [draftSource, id]);
  const own: ModelElement[] | undefined = Array.isArray(json.elements) ? json.elements : undefined;
  const element = own?.[sel];
  const vars = textureVariables(json.textures, resolved.textures);
  const modelIds = useModelIds();
  const textureIds = useTextureIds();

  const setElements = (list: ModelElement[], select = sel) => {
    change({ ...json, elements: list });
    setSel(Math.max(0, Math.min(list.length - 1, select)));
  };
  const setElement = (e: ModelElement) => own && setElements(own.map((x, i) => (i === sel ? e : x)));
  const setFace = (dir: FaceDir, face: ModelFace | undefined) => {
    if (!element) return;
    const faces = { ...element.faces };
    if (face) faces[dir] = face;
    else delete faces[dir];
    setElement({ ...element, faces });
  };
  const setTextures = (textures: Record<string, string>) => change({ ...json, textures });

  const save = () => {
    setFile(path, new TextEncoder().encode(JSON.stringify(json, null, 2)));
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

  const build = async () => {
    const obj = await buildModelObject(store!, { ref: { model: id, tints: [] }, model: resolved }, 'none');
    if (element) {
      // the chosen element, outlined (without its rotation)
      const box = new THREE.Box3(new THREE.Vector3(...element.from.map((v) => v / 16 - 0.5)), new THREE.Vector3(...element.to.map((v) => v / 16 - 0.5)));
      const helper = new THREE.Box3Helper(box, new THREE.Color('#fbbf24'));
      (helper.material as THREE.LineBasicMaterial).depthTest = false;
      helper.renderOrder = 999;
      obj.add(helper);
    }
    return obj;
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <span className="font-semibold">{t('modelEditor.title')}</span>
        <span className="min-w-0 truncate font-mono text-xs text-neutral-400">{path}</span>
        <div className="ml-auto flex gap-1">
          <Btn onClick={() => step(undo, redo)} disabled={!undo.current.length}>{t('editor.undo')}</Btn>
          <Btn onClick={() => step(redo, undo)} disabled={!redo.current.length}>{t('editor.redo')}</Btn>
          <Btn onClick={close}>{t('editor.cancel')}</Btn>
          <Btn tone="primary" onClick={save} disabled={!dirty}>{t('editor.save')}</Btn>
        </div>
      </div>
      <datalist id="model-ids">
        {modelIds.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <datalist id="texture-ids">
        {textureIds.map((x) => (
          <option key={x} value={x} />
        ))}
      </datalist>
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[42%] min-w-72 flex-col gap-2 border-r border-neutral-800 p-3 text-xs">
          <div className="h-80 shrink-0">{store && <ObjectViewer buildKey={`${id}|${JSON.stringify(json)}|${sel}|${revision}`} build={build} />}</div>
          <label className="flex items-center gap-2">
            <span className="w-14 text-neutral-400">{t('modelEditor.parent')}</span>
            <TextField
              value={json.parent ?? ''}
              list="model-ids"
              onCommit={(v) => {
                const { parent: _, ...rest } = json;
                change(v ? { ...json, parent: v } : rest);
              }}
            />
          </label>
          <div className="font-semibold text-neutral-300">{t('modelEditor.textures')}</div>
          <div className="flex flex-col gap-1 overflow-y-auto">
            {Object.entries((json.textures ?? {}) as Record<string, string>).map(([k, v]) => {
              const tex = typeof v === 'string' && !v.startsWith('#') ? v : undefined;
              return (
                <div key={k} className="flex items-center gap-1">
                  {tex ? <TextureThumb store={store!} path={texturePath(tex)} className="checker h-6 w-6 shrink-0 rounded-sm" /> : <span className="h-6 w-6 shrink-0" />}
                  <span className="w-16 truncate font-mono text-neutral-400" title={k}>
                    {k}
                  </span>
                  <TextField value={String(v)} list="texture-ids" onCommit={(next) => setTextures({ ...json.textures, [k]: next })} />
                  <button
                    onClick={() => {
                      const { [k]: _, ...rest } = json.textures;
                      setTextures(rest);
                    }}
                    title={t('modelEditor.removeTexture')}
                    className="text-neutral-500 hover:text-red-400"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
            <NewVariable onAdd={(k) => setTextures({ ...json.textures, [k]: resolved.textures[k] ?? 'minecraft:block/stone' })} taken={Object.keys(json.textures ?? {})} />
          </div>
          {Object.keys(resolved.textures).some((k) => !(k in (json.textures ?? {}))) && (
            <p className="text-[11px] text-neutral-500">
              {t('modelEditor.inherited', { list: Object.keys(resolved.textures).filter((k) => !(k in (json.textures ?? {}))).join(', ') })}
            </p>
          )}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto p-3 text-xs">
          {!own ? (
            <div className="flex flex-col items-start gap-2">
              <p className="text-neutral-400">{resolved.elements.length ? t('modelEditor.inheritsElements', { count: resolved.elements.length, from: resolved.chain[1] ?? '' }) : t('modelEditor.noElements')}</p>
              <Btn tone="primary" onClick={() => change(withOwnElements(json, resolved.elements))}>
                {resolved.elements.length ? t('modelEditor.copyElements') : t('modelEditor.startCube')}
              </Btn>
            </div>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-center gap-1">
                {own.map((e, i) => (
                  <button
                    key={i}
                    onClick={() => setSel(i)}
                    className={`rounded px-2 py-0.5 font-mono ${i === sel ? 'bg-amber-700' : elementProblems(e).length ? 'bg-red-950 hover:bg-red-900' : 'bg-neutral-800 hover:bg-neutral-700'}`}
                    title={`${e.from.join(' ')} → ${e.to.join(' ')}`}
                  >
                    {(e as any).name ?? `#${i + 1}`}
                  </button>
                ))}
              </div>
              <div className="mb-3 flex flex-wrap gap-1">
                <Btn tone="primary" onClick={() => setElements([...own, newCube(`#${vars[0] ?? 'all'}`)], own.length)}>{t('modelEditor.addCube')}</Btn>
                <Btn onClick={() => element && setElements([...own.slice(0, sel + 1), structuredClone(element), ...own.slice(sel + 1)], sel + 1)} disabled={!element}>
                  {t('modelEditor.duplicate')}
                </Btn>
                <Btn onClick={() => setElements(moveItem(own, sel, -1), sel - 1)} disabled={sel <= 0} title={t('modelEditor.earlier')}>▲</Btn>
                <Btn onClick={() => setElements(moveItem(own, sel, 1), sel + 1)} disabled={sel >= own.length - 1} title={t('modelEditor.later')}>▼</Btn>
                <Btn tone="danger" onClick={() => setElements(own.filter((_, i) => i !== sel))} disabled={!element}>
                  {t('modelEditor.remove')}
                </Btn>
              </div>
              {element && (
                <div className="flex flex-col gap-2">
                  {elementProblems(element).map((p) => (
                    <p key={p} className="text-red-300">
                      {t(`modelEditor.problem.${p}`)}
                    </p>
                  ))}
                  <VecRow label={t('modelEditor.from')} value={element.from} onChange={(from) => setElement(tidyElement({ ...element, from }))} />
                  <VecRow label={t('modelEditor.to')} value={element.to} onChange={(to) => setElement(tidyElement({ ...element, to }))} />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="w-14 text-neutral-400">{t('modelEditor.rotation')}</span>
                    <select
                      value={element.rotation?.angle ?? 0}
                      onChange={(e) => {
                        const angle = Number(e.target.value);
                        if (!angle) {
                          const { rotation: _, ...rest } = element;
                          return setElement(rest as ModelElement);
                        }
                        setElement({ ...element, rotation: { origin: element.rotation?.origin ?? [8, 8, 8], axis: element.rotation?.axis ?? 'y', angle, ...(element.rotation?.rescale ? { rescale: true } : {}) } });
                      }}
                      className="rounded bg-neutral-800 px-1 py-0.5"
                    >
                      {ANGLES.map((a) => (
                        <option key={a} value={a}>
                          {a}°
                        </option>
                      ))}
                    </select>
                    {element.rotation && (
                      <>
                        <select value={element.rotation.axis ?? 'y'} onChange={(e) => setElement({ ...element, rotation: { ...element.rotation!, axis: e.target.value as 'x' | 'y' | 'z' } })} className="rounded bg-neutral-800 px-1 py-0.5">
                          {(['x', 'y', 'z'] as const).map((a) => (
                            <option key={a} value={a}>
                              {t('modelEditor.axis', { axis: a })}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center gap-1" title={t('modelEditor.rescaleTitle')}>
                          <input type="checkbox" checked={!!element.rotation.rescale} onChange={(e) => setElement({ ...element, rotation: { ...element.rotation!, rescale: e.target.checked || undefined } })} />
                          rescale
                        </label>
                      </>
                    )}
                  </div>
                  {element.rotation && <VecRow label={t('modelEditor.origin')} value={element.rotation.origin} onChange={(origin) => setElement({ ...element, rotation: { ...element.rotation!, origin } })} />}
                  <label className="flex items-center gap-1" title={t('modelEditor.shadeTitle')}>
                    <input type="checkbox" checked={element.shade !== false} onChange={(e) => setElement({ ...element, shade: e.target.checked ? undefined : false })} />
                    {t('modelEditor.shade')}
                  </label>
                  <div className="font-semibold text-neutral-300">{t('modelEditor.faces')}</div>
                  <div className="grid grid-cols-[auto_auto_1fr_auto_auto] items-center gap-x-2 gap-y-1">
                    {DIRS.map((dir) => {
                      const face = element.faces[dir];
                      return (
                        <FaceRow
                          key={dir}
                          face={face}
                          vars={vars}
                          onChange={(f) => setFace(dir, f)}
                          label={t(`modelEditor.dir.${dir}`)}
                          fallback={`#${vars[0] ?? 'all'}`}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
          <p className="mt-3 text-[11px] leading-snug text-neutral-500">{t('modelEditor.hint')}</p>
        </div>
      </div>
    </div>
  );
}

function TextField({ value, onCommit, list }: { value: string; onCommit: (v: string) => void; list?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      value={draft}
      list={list}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft.trim() !== value && onCommit(draft.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="min-w-0 flex-1 rounded bg-neutral-800 px-1 py-0.5 font-mono"
    />
  );
}

function NumberInput({ value, onCommit, label }: { value: number; onCommit: (v: number) => void; label: string }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft.replace(',', '.'));
    if (!Number.isFinite(n)) return setDraft(String(value));
    if (n !== value) onCommit(n);
  };
  return (
    <input
      value={draft}
      aria-label={label}
      inputMode="decimal"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        // arrow keys step by one pixel (Shift: by a quarter)
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const by = (e.shiftKey ? 0.25 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
          onCommit(Math.round((value + by) * 1000) / 1000);
        }
      }}
      className="w-14 rounded bg-neutral-800 px-1 py-0.5 text-right font-mono"
    />
  );
}

function VecRow({ label, value, onChange }: { label: string; value: Vec3; onChange: (v: Vec3) => void }) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-14 text-neutral-400">{label}</span>
      {(['x', 'y', 'z'] as const).map((axis, i) => (
        <NumberInput key={axis} label={`${label} ${axis}`} value={value[i]} onCommit={(v) => onChange(value.map((x, j) => (j === i ? v : x)) as Vec3)} />
      ))}
    </div>
  );
}

function FaceRow({ face, vars, onChange, label, fallback }: {
  face: ModelFace | undefined;
  vars: string[];
  onChange: (f: ModelFace | undefined) => void;
  label: string;
  fallback: string;
}) {
  const t = useT();
  return (
    <>
      <label className="flex items-center gap-1">
        <input type="checkbox" checked={!!face} onChange={(e) => onChange(e.target.checked ? { texture: fallback } : undefined)} />
        <span className="w-12">{label}</span>
      </label>
      <select value={face?.texture.replace(/^#/, '') ?? ''} disabled={!face} onChange={(e) => face && onChange({ ...face, texture: `#${e.target.value}` })} aria-label={`${label} ${t('modelEditor.texture')}`} className="rounded bg-neutral-800 px-1 py-0.5 font-mono disabled:opacity-40">
        {face && !vars.includes(face.texture.replace(/^#/, '')) && <option value={face.texture.replace(/^#/, '')}>{face.texture}</option>}
        {vars.map((v) => (
          <option key={v} value={v}>
            #{v}
          </option>
        ))}
      </select>
      <span className="truncate font-mono text-[10px] text-neutral-500" title={t('modelEditor.uvTitle')}>
        {face?.uv ? face.uv.join(' ') : face ? t('modelEditor.uvAuto') : ''}
      </span>
      <select value={face?.rotation ?? 0} disabled={!face} onChange={(e) => face && onChange({ ...face, rotation: Number(e.target.value) || undefined })} title={t('modelEditor.faceRotation')} className="rounded bg-neutral-800 px-1 py-0.5 disabled:opacity-40">
        {[0, 90, 180, 270].map((r) => (
          <option key={r} value={r}>
            ↻{r}°
          </option>
        ))}
      </select>
      <label className="flex items-center gap-0.5" title={t('modelEditor.tintTitle')}>
        <input type="checkbox" disabled={!face} checked={face?.tintindex !== undefined} onChange={(e) => face && onChange({ ...face, tintindex: e.target.checked ? 0 : undefined })} />
        tint
      </label>
    </>
  );
}

function NewVariable({ onAdd, taken }: { onAdd: (k: string) => void; taken: string[] }) {
  const t = useT();
  const [name, setName] = useState('');
  const ok = /^[a-z0-9_]+$/.test(name) && !taken.includes(name);
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ok) return;
        onAdd(name);
        setName('');
      }}
    >
      <input value={name} onChange={(e) => setName(e.target.value.trim())} placeholder={t('modelEditor.newVariable')} aria-label={t('modelEditor.newVariable')} className="w-32 rounded bg-neutral-800 px-1 py-0.5 font-mono" />
      <Btn onClick={() => ok && (onAdd(name), setName(''))} disabled={!ok}>
        +
      </Btn>
    </form>
  );
}
