import { useEffect, useMemo, useState } from 'react';
import { useT } from '../i18n';
import { comparePacks, type DiffEntry, type DiffKind, type DiffStatus } from '../pack/compare';
import { loadPackZip, type LoadedPack } from '../pack/loadPack';
import { useApp } from '../state/appStore';
import { Btn, pickFile, SourceBadge, useInView } from './common';

const KINDS: DiffKind[] = ['texture', 'sound', 'model', 'text', 'misc'];
const SHOWN = 200;

/** An image from bytes, made only once it scrolls into view. */
function BytesImage({ bytes, className }: { bytes?: Uint8Array; className: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!inView || !bytes) return setUrl(undefined);
    const u = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [inView, bytes]);
  return (
    <div ref={ref} className={`checker flex items-center justify-center overflow-hidden rounded ${className}`}>
      {url && <img src={url} alt="" className="pixelated h-full w-full object-contain" draggable={false} />}
    </div>
  );
}

function PlayButton({ bytes }: { bytes?: Uint8Array }) {
  const t = useT();
  if (!bytes) return <span className="w-6" />;
  return (
    <button
      title={t('compare.play')}
      onClick={() => {
        const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/ogg' }));
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        void audio.play().catch(() => URL.revokeObjectURL(url));
      }}
      className="w-6 rounded bg-neutral-800 text-xs hover:bg-neutral-700"
    >
      ▶
    </button>
  );
}

const sizeLabel = (b?: Uint8Array) => (b ? (b.length < 1024 ? `${b.length} B` : `${(b.length / 1024).toFixed(1)} KB`) : '–');

/** Loads another pack and lists what it has that this one doesn't, to take files over. */
export function ComparePanel() {
  const t = useT();
  const { store, revision, applyBatch, lastBatch, undoBatch } = useApp();
  const [other, setOther] = useState<LoadedPack>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [kinds, setKinds] = useState<Set<DiffKind>>(new Set(KINDS));
  const [status, setStatus] = useState<DiffStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const diff = useMemo(() => (store && other ? comparePacks((p) => store.get(p), other.files) : []), [store, other, revision]);
  const q = query.trim().toLowerCase();
  const shown = diff.filter((d) => kinds.has(d.kind) && (status === 'all' || d.status === status) && (!q || d.path.toLowerCase().includes(q)));
  const groups = useMemo(() => {
    const m = new Map<string, DiffEntry[]>();
    for (const d of shown) m.set(d.folder, [...(m.get(d.folder) ?? []), d]);
    return [...m];
  }, [shown]);
  useEffect(() => setPicked((p) => new Set([...p].filter((x) => diff.some((d) => d.path === x)))), [diff]);

  const load = async (dropped?: File) => {
    const file = dropped ?? (await pickFile('.zip,application/zip'));
    if (!file) return;
    setLoading(true);
    setError(undefined);
    try {
      const pack = await loadPackZip(file);
      if (!pack.files.size) throw new Error(t('load.notAPack'));
      setOther(pack);
      setOpen(new Set());
      setPicked(new Set());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const take = (paths: string[]) => {
    if (!other || !paths.length) return;
    applyBatch(new Map(paths.map((p) => [p, other.files.get(p)!])));
    setPicked(new Set());
  };
  const toggle = <T,>(set: Set<T>, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    return n;
  };

  if (!store) return null;
  const counts = { new: diff.filter((d) => d.status === 'new').length, changed: diff.filter((d) => d.status === 'changed').length };

  return (
    <div
      className="flex max-w-5xl flex-col gap-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) void load(file);
      }}
    >
      <div>
        <h2 className="text-base font-semibold">{t('compare.title')}</h2>
        <p className="text-xs text-neutral-400">{t('compare.hint')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <Btn tone="primary" onClick={() => void load()} disabled={loading}>
            {loading ? t('compare.loading') : other ? t('compare.loadOther') : t('compare.load')}
          </Btn>
          {other && (
            <span className="text-neutral-300">
              <b>{other.name}</b>
              {other.meta?.description && ` · ${other.meta.description}`} · {t('compare.files', { count: other.files.size })}
            </span>
          )}
          {lastBatch && (
            <Btn onClick={undoBatch} title={t('batch.undoInfo', { count: lastBatch.count })}>
              {t('batch.undo')}
            </Btn>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      {other && (
        <>
          <p className="text-xs text-neutral-300">{diff.length ? t('compare.summary', { new: counts.new, changed: counts.changed }) : t('compare.same')}</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {KINDS.map((k) => (
              <label key={k} className="flex items-center gap-1">
                <input type="checkbox" checked={kinds.has(k)} onChange={() => setKinds(toggle(kinds, k))} />
                {t(`compare.kinds.${k}`)} ({diff.filter((d) => d.kind === k).length})
              </label>
            ))}
            <select value={status} onChange={(e) => setStatus(e.target.value as DiffStatus | 'all')} className="rounded bg-neutral-800 px-1 py-0.5">
              <option value="all">{t('compare.status.all')}</option>
              <option value="new">{t('compare.status.new')}</option>
              <option value="changed">{t('compare.status.changed')}</option>
            </select>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('compare.search')}
              className="w-56 rounded bg-neutral-800 px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <span className="ml-auto flex gap-1">
              <Btn onClick={() => take([...picked])} disabled={!picked.size} tone="primary">
                {t('compare.takeSelected', { count: picked.size })}
              </Btn>
              <Btn onClick={() => take(shown.map((d) => d.path))} disabled={!shown.length}>
                {t('compare.takeShown', { count: shown.length })}
              </Btn>
            </span>
          </div>

          <div className="flex flex-col gap-1">
            {groups.map(([folder, entries]) => {
              const isOpen = open.has(folder);
              return (
                <div key={folder} className="rounded bg-neutral-900">
                  <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <input
                      type="checkbox"
                      checked={entries.every((e) => picked.has(e.path))}
                      onChange={(e) => {
                        const n = new Set(picked);
                        for (const x of entries) e.target.checked ? n.add(x.path) : n.delete(x.path);
                        setPicked(n);
                      }}
                    />
                    <button onClick={() => setOpen(toggle(open, folder))} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <span className="text-neutral-500">{isOpen ? '▾' : '▸'}</span>
                      <span className="truncate font-mono">{folder === '.' ? t('compare.root') : folder}</span>
                      <span className="text-neutral-500">{t('compare.files', { count: entries.length })}</span>
                    </button>
                    <Btn onClick={() => take(entries.map((e) => e.path))}>{t('compare.takeFolder')}</Btn>
                  </div>
                  {isOpen && (
                    <div className="flex flex-col gap-1 px-3 pb-2">
                      {entries.slice(0, SHOWN).map((d) => {
                        const mine = store.get(d.path);
                        const theirs = other.files.get(d.path);
                        return (
                          <div key={d.path} className="flex items-center gap-2 text-[11px]">
                            <input type="checkbox" checked={picked.has(d.path)} onChange={() => setPicked(toggle(picked, d.path))} />
                            {d.kind === 'texture' && d.path.endsWith('.png') ? (
                              <>
                                <BytesImage bytes={mine} className="h-10 w-10 shrink-0" />
                                <span className="text-neutral-500">→</span>
                                <BytesImage bytes={theirs} className="h-10 w-10 shrink-0" />
                              </>
                            ) : d.kind === 'sound' && d.path.endsWith('.ogg') ? (
                              <>
                                <PlayButton bytes={mine} />
                                <span className="text-neutral-500">→</span>
                                <PlayButton bytes={theirs} />
                              </>
                            ) : null}
                            <span className="min-w-0 flex-1 truncate font-mono" title={d.path}>
                              {d.path.slice(d.path.lastIndexOf('/') + 1)}
                            </span>
                            <span className={`rounded px-1.5 py-0.5 text-[10px] ${d.status === 'new' ? 'bg-emerald-900 text-emerald-200' : 'bg-sky-900 text-sky-200'}`}>
                              {t(`compare.status.${d.status}`)}
                            </span>
                            {mine && <SourceBadge source={store.source(d.path)} />}
                            <span className="w-28 text-right text-neutral-500">
                              {sizeLabel(mine)} → {sizeLabel(theirs)}
                            </span>
                            <Btn onClick={() => take([d.path])}>{t('compare.take')}</Btn>
                          </div>
                        );
                      })}
                      {entries.length > SHOWN && <p className="text-[11px] text-neutral-500">{t('compare.more', { count: entries.length - SHOWN })}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
