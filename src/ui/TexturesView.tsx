import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetStore } from '../assets/AssetStore';
import { mobsForTexture } from '../entities/catalog';
import { useT } from '../i18n';
import { drawAnimationFrame, subscribeTicks } from '../render/animation';
import { loadTexture } from '../render/textures';
import { useApp } from '../state/appStore';
import { AssetActions, Btn, SourceBadge, useInView } from './common';
import { mobName } from './MobsView';
import { UVOverlay } from './UVOverlay';

const PAGE = 400;

/** Plays an animated texture (with a .mcmeta) on a canvas, in step with the shared tick clock. */
function AnimatedThumb({ store, path, className }: { store: AssetStore; path: string; className: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const rev = `${store.rev(path)}.${store.rev(`${path}.mcmeta`)}`;
  useEffect(() => {
    if (!inView) return;
    const m = TEXTURE.exec(path);
    if (!m) return;
    let stop = () => {};
    let alive = true;
    void loadTexture(store, `${m[1]}:${m[2]}`).then((info) => {
      const c = canvas.current;
      if (!alive || !c) return;
      c.width = info.width;
      c.height = info.height;
      const ctx = c.getContext('2d')!;
      if (!info.animation || !info.sheet) return ctx.drawImage(info.canvas, 0, 0);
      const { animation, sheet } = info;
      stop = subscribeTicks((ticks) => drawAnimationFrame(ctx, sheet, animation, ticks));
    });
    return () => {
      alive = false;
      stop();
    };
  }, [inView, store, path, rev]);
  return (
    <div ref={ref} className={`flex items-center justify-center overflow-hidden ${className}`}>
      <canvas ref={canvas} className="pixelated h-full w-full object-contain" />
    </div>
  );
}

export function TextureThumb({ store, path, className = 'h-12 w-12' }: { store: AssetStore; path: string; className?: string }) {
  if (store.has(`${path}.mcmeta`)) return <AnimatedThumb store={store} path={path} className={className} />;
  return <StaticThumb store={store} path={path} className={className} />;
}

function StaticThumb({ store, path, className }: { store: AssetStore; path: string; className: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [url, setUrl] = useState<string>();
  const bytes = inView ? store.get(path) : undefined;
  useEffect(() => {
    if (!bytes) return setUrl(undefined);
    const u = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [bytes]);
  return (
    <div ref={ref} className={`flex items-center justify-center overflow-hidden ${className}`}>
      {url && <img src={url} alt="" className="pixelated max-h-full max-w-full object-contain" draggable={false} />}
    </div>
  );
}

const TEXTURE = /^assets\/([^/]+)\/textures\/(.+)\.png$/;

export function TexturesView() {
  const { store, revision, names } = useApp();
  const t = useT();
  const [query, setQuery] = useState('');
  const [folder, setFolder] = useState('minecraft:item');
  const [onlyPack, setOnlyPack] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<string>();
  const q = useDeferredValue(query.trim().toLowerCase());

  const all = useMemo(() => (store ? store.list('assets/').filter((p) => TEXTURE.test(p)) : []), [store, revision]);
  const folderOf = (p: string) => {
    const [, ns, rest] = TEXTURE.exec(p)!;
    return `${ns}:${rest.split('/')[0]}`;
  };
  const folders = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of all) m.set(folderOf(p), (m.get(folderOf(p)) ?? 0) + 1);
    return [...m].sort(([a], [b]) => a.localeCompare(b));
  }, [all]);
  const visible = useMemo(
    () =>
      all.filter(
        (p) =>
          (folder === '*' || folderOf(p) === folder) &&
          (!onlyPack || store!.source(p) !== 'vanilla') &&
          (!q || p.toLowerCase().includes(q)),
      ),
    [all, folder, onlyPack, q, store, revision],
  );
  useEffect(() => setLimit(PAGE), [folder, onlyPack, q]);

  if (!store) return null;
  return (
    <div className="flex h-full">
      <nav className="w-52 shrink-0 overflow-y-auto border-r border-neutral-800 p-2 text-sm">
        {[['*', all.length] as [string, number], ...folders].map(([f, n]) => (
          <button
            key={f}
            onClick={() => setFolder(f)}
            className={`flex w-full justify-between rounded px-2 py-1 text-left ${folder === f ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
          >
            <span className="truncate">{f === '*' ? t('textures.all') : f}</span>
            <span className="text-xs text-neutral-500">{n}</span>
          </button>
        ))}
      </nav>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-neutral-800 p-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('textures.search')}
            className="w-64 rounded bg-neutral-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" checked={onlyPack} onChange={(e) => setOnlyPack(e.target.checked)} />
            {t('textures.onlyPack')}
          </label>
          <span className="ml-auto text-xs text-neutral-500">{t('textures.count', { count: visible.length })}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-1.5">
            {visible.slice(0, limit).map((p) => {
              const src = store.source(p);
              const ring = src === 'edited' ? 'ring-amber-500' : src === 'pack' ? 'ring-sky-600' : 'ring-transparent';
              return (
                <button
                  key={p}
                  onClick={() => setSelected(p)}
                  title={p}
                  className={`flex flex-col items-center gap-1 rounded p-1.5 ring-1 ${ring} ${
                    selected === p ? 'bg-neutral-600' : 'bg-neutral-800 hover:bg-neutral-700'
                  }`}
                >
                  <TextureThumb store={store} path={p} />
                  <span className="w-full truncate text-center text-[10px] text-neutral-300">{p.split('/').pop()}</span>
                </button>
              );
            })}
          </div>
          {visible.length > limit && (
            <button onClick={() => setLimit(limit + PAGE)} className="mt-3 w-full rounded bg-neutral-800 py-2 text-sm hover:bg-neutral-700">
              {t('textures.showMore', { count: Math.min(PAGE, visible.length - limit) })}
            </button>
          )}
        </div>
      </section>
      {selected && store.has(selected) && (
        <aside className="w-96 shrink-0 overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-3">
          <TextureDetail store={store} path={selected} names={names} onClose={() => setSelected(undefined)} />
        </aside>
      )}
    </div>
  );
}

function TextureDetail({ store, path, names, onClose }: { store: AssetStore; path: string; names: Record<string, string>; onClose: () => void }) {
  const t = useT();
  const [size, setSize] = useState<string>();
  const bytes = store.get(path);
  useEffect(() => {
    if (!bytes) return;
    void createImageBitmap(new Blob([bytes])).then((b) => {
      setSize(`${b.width}×${b.height}`);
      b.close();
    });
  }, [bytes]);
  const meta = `${path}.mcmeta`;
  const m = TEXTURE.exec(path);
  const users = m ? mobsForTexture(`${m[1]}:${m[2]}`) : [];
  const [showUV, setShowUV] = useState(true);
  const { setTab, selectMob } = useApp();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 break-all font-mono text-xs">{path}</div>
        <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200" title={t('actions.close')}>
          ✕
        </button>
      </div>
      {users.length > 0 && showUV ? (
        <UVOverlay store={store} path={path} modelKey={users[0].layer.model} />
      ) : (
        <TextureThumb store={store} path={path} className="checker h-64 w-full rounded" />
      )}
      {users.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <Btn onClick={() => setShowUV(!showUV)}>{showUV ? t('textures.uvOff') : t('textures.uvOn')}</Btn>
          {users.map(({ mob }) => (
            <Btn
              key={mob.id}
              onClick={() => {
                selectMob(mob.id);
                setTab('mobs');
              }}
              title={t('textures.view3d')}
            >
              ▶ {mobName(names, mob, t)}
            </Btn>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <SourceBadge source={store.source(path)} /> {size}
        {store.has(meta) && <span>{t('textures.animated')}</span>}
      </div>
      <AssetActions path={path} source={store.source(path)} load={async () => store.get(path)} kind="texture" vanillaAvailable={store.vanilla.has(path)} />
      {store.has(meta) && (
        <div className="flex items-center gap-2 text-xs">
          <span className="font-mono">.mcmeta</span>
          <SourceBadge source={store.source(meta)} />
          <AssetActions path={meta} source={store.source(meta)} load={async () => store.get(meta)} kind="file" vanillaAvailable={store.vanilla.has(meta)} />
        </div>
      )}
    </div>
  );
}
