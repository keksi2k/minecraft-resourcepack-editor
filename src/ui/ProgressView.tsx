import { useMemo, useState } from 'react';
import { useT } from '../i18n';
import { loadVanillaAssets } from '../mojang/clientJar';
import { fetchVersionJson } from '../mojang/versions';
import { newSince, share, STYLE_THRESHOLD, textureProgress, type CategoryProgress } from '../pack/progress';
import { useApp } from '../state/appStore';
import { Btn } from './common';
import { TextureThumb } from './TexturesView';

const SHOWN = 120;

/** How much of vanilla the pack replaces, per category, and what's still missing. */
export function ProgressView() {
  const t = useT();
  const { store, revision, manifest, version } = useApp();
  const progress = useMemo(() => (store ? textureProgress(store) : []), [store, revision]);
  const [open, setOpen] = useState<string>();
  const total = progress.reduce((s, c) => s + c.total, 0);
  const changed = progress.reduce((s, c) => s + c.changed, 0);
  const styled = progress.filter((c) => c.changed > 0 && share(c) >= STYLE_THRESHOLD && c.untouched.length > 0);

  // compare with an older game version: which textures are new since then
  const releases = useMemo(() => {
    const list = manifest?.versions.filter((v) => v.type === 'release') ?? [];
    const i = list.findIndex((v) => v.id === version?.id);
    return i >= 0 ? list.slice(i + 1) : list;
  }, [manifest, version]);
  const [older, setOlder] = useState('');
  const [compare, setCompare] = useState<{ id: string; paths: Set<string> }>();
  const [status, setStatus] = useState<string>();
  const [error, setError] = useState<string>();
  const fresh = useMemo(() => (store && compare ? newSince(store, compare.paths) : undefined), [store, compare, revision]);

  const runCompare = async () => {
    const entry = manifest?.versions.find((v) => v.id === (older || releases[0]?.id));
    if (!entry) return;
    setError(undefined);
    try {
      const json = await fetchVersionJson(entry);
      const assets = await loadVanillaAssets(json, (s) => setStatus(s));
      setCompare({ id: entry.id, paths: new Set([...assets.files.keys()].filter((p) => p.startsWith('assets/minecraft/textures/'))) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStatus(undefined);
    }
  };

  if (!store) return null;
  return (
    <div className="h-full overflow-y-auto p-4 text-sm">
      <div className="flex max-w-5xl flex-col gap-6">
        <div>
          <h2 className="text-base font-semibold">{t('progress.title')}</h2>
          <p className="text-xs text-neutral-400">{t('progress.intro')}</p>
          <div className="mt-3 flex items-center gap-3">
            <Bar value={total ? changed / total : 0} className="h-3 w-80" />
            <span className="text-xs">{t('progress.total', { changed, total, percent: Math.round((changed / (total || 1)) * 100) })}</span>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          {progress.map((c) => (
            <CategoryRow key={c.category} c={c} open={open === c.category} onToggle={() => setOpen(open === c.category ? undefined : c.category)} />
          ))}
        </div>

        {styled.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-neutral-800 pt-4">
            <h3 className="font-semibold">{t('progress.styleTitle')}</h3>
            <p className="text-xs text-neutral-400">{t('progress.styleHint', { percent: STYLE_THRESHOLD * 100 })}</p>
            {styled.map((c) => (
              <div key={c.category}>
                <div className="mb-1 text-xs text-neutral-300">
                  {c.category} · {t('progress.missing', { count: c.untouched.length })}
                </div>
                <ThumbGrid paths={c.untouched} />
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-neutral-800 pt-4">
          <h3 className="font-semibold">{t('progress.newTitle')}</h3>
          <p className="text-xs text-neutral-400">{t('progress.newHint', { version: version?.id ?? '' })}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select value={older || releases[0]?.id} onChange={(e) => setOlder(e.target.value)} className="rounded bg-neutral-800 px-2 py-1">
              {releases.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id}
                </option>
              ))}
            </select>
            <Btn tone="primary" onClick={() => void runCompare()} disabled={!!status || !releases.length}>{t('progress.compare')}</Btn>
            {status && <span className="text-neutral-400">{status}</span>}
            {error && <span className="text-red-300">{error}</span>}
          </div>
          {fresh && compare && (
            fresh.size === 0 ? (
              <p className="text-xs text-emerald-400">{t('progress.newNone', { version: compare.id })}</p>
            ) : (
              [...fresh].map(([category, paths]) => (
                <div key={category}>
                  <div className="mb-1 text-xs text-neutral-300">
                    {category} · {t('progress.newCount', { count: paths.length, version: compare.id })}
                  </div>
                  <ThumbGrid paths={paths} />
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
}

function Bar({ value, className }: { value: number; className: string }) {
  return (
    <div className={`overflow-hidden rounded-full bg-neutral-800 ${className}`}>
      <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

function CategoryRow({ c, open, onToggle }: { c: CategoryProgress; open: boolean; onToggle: () => void }) {
  const t = useT();
  return (
    <div className="rounded bg-neutral-900">
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-3 py-1.5 text-left hover:bg-neutral-800">
        <span className="w-28 truncate font-mono text-xs">{c.category}</span>
        <Bar value={share(c)} className="h-2 flex-1" />
        <span className="w-40 text-right text-xs text-neutral-400">
          {c.changed} / {c.total} · {Math.round(share(c) * 100)} %
        </span>
        <span className="text-neutral-500">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="mb-1 text-xs text-neutral-400">{t('progress.untouched', { count: c.untouched.length })}</div>
          <ThumbGrid paths={c.untouched} />
        </div>
      )}
    </div>
  );
}

/** Texture thumbnails; a click opens the texture in the texture tab. */
function ThumbGrid({ paths }: { paths: string[] }) {
  const t = useT();
  const { store, focusTexture } = useApp();
  const [limit, setLimit] = useState(SHOWN);
  if (!store) return null;
  return (
    <div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(56px,1fr))] gap-1">
        {paths.slice(0, limit).map((p) => (
          <button key={p} onClick={() => focusTexture(p)} title={p} className="flex flex-col items-center gap-0.5 rounded bg-neutral-800 p-1 hover:bg-neutral-700">
            <TextureThumb store={store} path={p} className="h-10 w-10" />
            <span className="w-full truncate text-center text-[9px] text-neutral-400">{p.split('/').pop()}</span>
          </button>
        ))}
      </div>
      {paths.length > limit && (
        <button onClick={() => setLimit(limit + SHOWN)} className="mt-1 w-full rounded bg-neutral-800 py-1 text-xs hover:bg-neutral-700">
          {t('textures.showMore', { count: Math.min(SHOWN, paths.length - limit) })}
        </button>
      )}
    </div>
  );
}
