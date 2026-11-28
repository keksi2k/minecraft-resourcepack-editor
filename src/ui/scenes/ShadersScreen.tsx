import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssetStore } from '../../assets/AssetStore';
import { useT } from '../../i18n';
import { texturePath } from '../../models/resourceLocation';
import { PostEffectError, runPostEffect, type PostEffectJson } from '../../render/postEffect';
import { loadTexture } from '../../render/textures';
import { effectPath, shaderFiles, tokenize, type ShaderFile, type ShaderGroup, type Token } from '../../shaders/glsl';
import { presetChanges, PRESETS, type PresetId } from '../../shaders/presets';
import { useApp } from '../../state/appStore';
import { AssetActions, Btn, SourceBadge } from '../common';
import { SceneLayout } from './ScenesView';

const GROUP_ORDER: ShaderGroup[] = ['effect', 'post', 'core', 'include'];
const decoder = new TextDecoder();
const encoder = new TextEncoder();
const PANORAMA = 'minecraft:gui/title/background/panorama_0';

const COLORS: Record<Token['kind'], string> = {
  comment: 'text-neutral-500',
  preprocessor: 'text-fuchsia-400',
  keyword: 'text-sky-400',
  type: 'text-emerald-400',
  number: 'text-amber-300',
  string: 'text-orange-300',
  text: 'text-neutral-200',
};

/**
 * The pack's shaders: core shaders (how the world is drawn), post shaders and post effects (the
 * creeper, spider and enderman views, the menu blur) and the shared include files. Post effects
 * run right here on a picture, with your changes.
 */
export function ShadersScreen({ store }: { store: AssetStore }) {
  const t = useT();
  const { revision, setFile, applyBatch, lastBatch, undoBatch } = useApp();
  const files = useMemo(() => shaderFiles(store), [store, revision]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(() => effectPath('minecraft:creeper'));
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const read = (path: string) => (path in drafts ? drafts[path] : store.has(path) ? decoder.decode(store.get(path)!) : undefined);
  const text = read(selected) ?? '';
  const file = files.find((f) => f.path === selected);
  const effects = files.filter((f) => f.group === 'effect');

  // the effect shown: the one being edited, or one that uses the shader being edited
  const effect = useMemo(() => {
    if (file?.group === 'effect') return file;
    const id = file?.id;
    const uses = effects.find((e) => {
      const src = read(e.path) ?? '';
      return !!id && (src.includes(`"${id}"`) || src.includes(`"${id.replace(/^minecraft:/, '')}"`));
    });
    return uses ?? effects.find((e) => e.id === 'minecraft:creeper') ?? effects[0];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, effects, drafts, revision]);

  const q = query.trim().toLowerCase();
  const grouped = GROUP_ORDER.map((g) => [g, files.filter((f) => f.group === g && (!q || f.path.toLowerCase().includes(q)))] as const);
  const dirty = selected in drafts;

  const save = () => {
    setFile(selected, encoder.encode(drafts[selected]));
    const { [selected]: _, ...rest } = drafts;
    setDrafts(rest);
  };
  const discard = () => {
    const { [selected]: _, ...rest } = drafts;
    setDrafts(rest);
  };

  return (
    <SceneLayout
      asideWidth="w-[300px]"
      main={
        <div className="absolute inset-0 flex">
          <nav className="flex w-60 shrink-0 flex-col border-r border-neutral-800 text-xs">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('scenes.shaders.search')}
              className="m-2 rounded bg-neutral-800 px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2">
              {grouped.map(([g, list]) =>
                list.length ? (
                  <div key={g} className="mb-2">
                    <div className="px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t(`scenes.shaders.groups.${g}`)}</div>
                    {list.map((f) => (
                      <FileButton key={f.path} store={store} file={f} active={f.path === selected} changed={f.path in drafts} onClick={() => setSelected(f.path)} />
                    ))}
                  </div>
                ) : null,
              )}
            </div>
          </nav>
          <div className="flex min-w-0 flex-1 flex-col">
            {effect && <EffectPreview store={store} effect={effect} read={read} drafts={drafts} />}
            <div className="flex flex-wrap items-center gap-2 border-y border-neutral-800 px-3 py-1.5 text-xs">
              <span className="min-w-0 truncate font-mono text-neutral-300">{selected}</span>
              <SourceBadge source={store.source(selected)} />
              {dirty && <span className="text-amber-400">{t('scenes.shaders.unsaved')}</span>}
              <span className="ml-auto flex gap-1">
                <Btn onClick={discard} disabled={!dirty}>{t('scenes.shaders.discard')}</Btn>
                <Btn tone="primary" onClick={save} disabled={!dirty}>{t('editor.save')}</Btn>
              </span>
            </div>
            <div className="min-h-0 flex-1">
              <CodeEditor value={text} label={selected} onChange={(v) => setDrafts({ ...drafts, [selected]: v })} onSave={save} />
            </div>
          </div>
        </div>
      }
      aside={
        <>
          <div className="p-3 text-xs">
            <h2 className="text-base font-semibold">{t('scenes.shaders.title')}</h2>
            <p className="text-neutral-400">{t('scenes.shaders.hint')}</p>
            <p className="mt-2 rounded bg-amber-950/50 p-2 text-amber-200">{t('scenes.shaders.versionWarning')}</p>
            {file && (
              <div className="mt-3">
                <AssetActions path={selected} source={store.source(selected)} load={async () => store.get(selected)} kind="file" vanillaAvailable={store.vanilla.has(selected)} />
              </div>
            )}
          </div>
          <div className="border-t border-neutral-800 p-3 text-xs">
            <h3 className="mb-2 font-semibold uppercase tracking-wide text-neutral-400">{t('scenes.shaders.presets')}</h3>
            <div className="flex flex-col gap-2">
              {PRESETS.map((id) => (
                <PresetRow key={id} id={id} read={read} onApply={(changes) => applyBatch(new Map([...changes].map(([p, s]) => [p, encoder.encode(s)])))} />
              ))}
              {lastBatch && (
                <Btn onClick={undoBatch} title={t('batch.undoInfo', { count: lastBatch.count })}>
                  {t('batch.undo')}
                </Btn>
              )}
            </div>
          </div>
        </>
      }
    />
  );
}

function FileButton({ store, file, active, changed, onClick }: { store: AssetStore; file: ShaderFile; active: boolean; changed: boolean; onClick: () => void }) {
  const src = store.source(file.path);
  const name = file.path.replace(/^assets\/[^/]+\/(?:shaders\/(?:core|post|include)\/|post_effect\/)/, '');
  return (
    <button onClick={onClick} title={file.path} className={`flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-left font-mono ${active ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}>
      <span className="min-w-0 flex-1 truncate">{name}</span>
      {changed && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
      {(src === 'pack' || src === 'edited') && <span className={`h-1.5 w-1.5 rounded-full ${src === 'edited' ? 'bg-amber-500' : 'bg-sky-500'}`} />}
    </button>
  );
}

function PresetRow({ id, read, onApply }: { id: PresetId; read: (path: string) => string | undefined; onApply: (changes: Map<string, string>) => void }) {
  const t = useT();
  const changes = presetChanges(id, read);
  return (
    <div className="rounded bg-neutral-900 p-2">
      <div className="flex items-center gap-2">
        <span className="font-medium">{t(`scenes.shaders.preset.${id}.title`)}</span>
        <span className="ml-auto">
          <Btn tone="primary" onClick={() => changes && onApply(changes)} disabled={!changes} title={changes ? [...changes.keys()].join('\n') : t('scenes.shaders.presetUnavailable')}>
            {t('scenes.shaders.apply')}
          </Btn>
        </span>
      </div>
      <p className="mt-1 text-neutral-400">{t(`scenes.shaders.preset.${id}.text`)}</p>
    </div>
  );
}

/** The effect run on the title panorama, side by side with the picture as it is. */
function EffectPreview({ store, effect, read, drafts }: { store: AssetStore; effect: ShaderFile; read: (path: string) => string | undefined; drafts: Record<string, string> }) {
  const t = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [picture, setPicture] = useState<HTMLCanvasElement>();
  const [error, setError] = useState<string>();
  const [before, setBefore] = useState(false);
  const revision = useApp((s) => s.revision);
  useEffect(() => {
    let alive = true;
    void loadTexture(store, PANORAMA).then((tex) => alive && setPicture(tex.canvas));
    return () => {
      alive = false;
    };
  }, [store, store.rev(texturePath(PANORAMA))]);
  // every file the effect may read, as it is now (drafts included)
  const key = JSON.stringify([effect.path, read(effect.path), drafts, revision, before]);
  const latest = useRef(key);
  latest.current = key;
  useEffect(() => {
    const c = canvas.current;
    if (!c || !picture) return;
    const timer = setTimeout(() => {
      const run = async () => {
        setError(undefined);
        let fx: PostEffectJson;
        try {
          fx = before ? { passes: [] } : JSON.parse(read(effect.path) ?? '{}');
        } catch (e) {
          return setError(`${effect.path}: ${(e as Error).message}`);
        }
        try {
          await runPostEffect(c, fx, { read, image: async (id) => (await loadTexture(store, id)).canvas }, picture);
        } catch (e) {
          if (latest.current === key) setError(e instanceof PostEffectError ? e.message : String(e));
        }
      };
      void run();
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, picture]);
  return (
    <div className="flex shrink-0 flex-col items-center gap-1 bg-neutral-900 p-2">
      <div className="flex w-full items-center gap-2 text-xs">
        <span className="text-neutral-400">{t('scenes.shaders.preview', { effect: effect.id })}</span>
        <label className="ml-auto flex items-center gap-1">
          <input type="checkbox" checked={before} onChange={(e) => setBefore(e.target.checked)} />
          {t('scenes.shaders.before')}
        </label>
      </div>
      <canvas ref={canvas} width={480} height={270} aria-label={t('scenes.shaders.previewLabel')} className="h-[270px] w-[480px] max-w-full rounded bg-black object-contain" />
      {error && <pre className="max-h-24 w-full overflow-auto whitespace-pre-wrap rounded bg-red-950 p-2 text-[11px] text-red-200">{error}</pre>}
    </div>
  );
}

/** A text area with GLSL/JSON colours behind it; Tab indents, Ctrl+S saves. */
function CodeEditor({ value, onChange, label, onSave }: { value: string; onChange: (v: string) => void; label: string; onSave: () => void }) {
  const pre = useRef<HTMLPreElement>(null);
  const tokens = useMemo(() => tokenize(value), [value]);
  return (
    <div className="relative h-full overflow-hidden bg-neutral-950 font-mono text-xs leading-5">
      <pre ref={pre} aria-hidden className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre p-3">
        {tokens.map((tk, i) => (
          <span key={i} className={COLORS[tk.kind]}>
            {tk.text}
          </span>
        ))}
        {'\n'}
      </pre>
      <textarea
        value={value}
        aria-label={label}
        spellCheck={false}
        wrap="off"
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          if (!pre.current) return;
          pre.current.scrollTop = e.currentTarget.scrollTop;
          pre.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            onSave();
          } else if (e.key === 'Tab') {
            e.preventDefault();
            const el = e.currentTarget;
            const { selectionStart: a, selectionEnd: b } = el;
            onChange(value.slice(0, a) + '    ' + value.slice(b));
            requestAnimationFrame(() => el.setSelectionRange(a + 4, a + 4));
          }
        }}
        className="absolute inset-0 resize-none whitespace-pre bg-transparent p-3 text-transparent caret-white outline-none selection:bg-sky-800/60"
      />
    </div>
  );
}
