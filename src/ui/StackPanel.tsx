import { useMemo, useState } from 'react';
import { useT } from '../i18n';
import { loadPackZip, type PackMeta } from '../pack/loadPack';
import { extraFolders, mergeKindOf, stackChanges, stackPacks } from '../pack/stack';
import { useApp } from '../state/appStore';
import { Btn, pickFiles } from './common';

interface Layer {
  id: number;
  name: string;
  files: Map<string, Uint8Array>;
  meta?: PackMeta;
  /** The open pack itself. */
  self?: boolean;
}

let nextId = 1;

/**
 * Several packs stacked into the open one, in the order of Minecraft's pack list (top wins), with
 * language files, sounds.json, atlases and fonts combined the way the game combines them.
 */
export function StackPanel() {
  const t = useT();
  const { store, revision, packName, packMeta, gameFormat, applyBatch, lastBatch, undoBatch } = useApp();
  const [others, setOthers] = useState<Layer[]>([]);
  // where the open pack sits in the stack: by default at the bottom, the others go on top
  const [selfAt, setSelfAt] = useState<number>(0);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const self = useMemo<Layer | undefined>(
    () => (store ? { id: 0, name: packName, files: store.exportFiles(), meta: packMeta, self: true } : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, revision, packName, packMeta],
  );
  const layers = useMemo(() => {
    if (!self) return [];
    const list = [...others];
    list.splice(Math.min(selfAt, list.length), 0, self);
    return list;
  }, [others, self, selfAt]);
  const result = useMemo(() => (others.length ? stackPacks(layers) : undefined), [layers, others.length]);
  const changes = useMemo(() => (result && store ? stackChanges(result, (p) => store.get(p)) : new Map()), [result, store, revision]);

  const load = async (dropped?: File[]) => {
    const files = dropped ?? (await pickFiles('.zip,application/zip', true));
    if (!files.length) return;
    setLoading(true);
    setError(undefined);
    try {
      const loaded: Layer[] = [];
      for (const file of files) {
        const pack = await loadPackZip(file);
        if (!pack.files.size) throw new Error(`${pack.name}: ${t('load.notAPack')}`);
        loaded.push({ id: nextId++, name: pack.name, files: pack.files, meta: pack.meta });
      }
      // new packs go on top, like a pack moved up in the game's list
      setOthers((o) => [...loaded, ...o]);
      setSelfAt((s) => s + loaded.length);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const move = (index: number, by: -1 | 1) => {
    const to = index + by;
    if (to < 0 || to >= layers.length) return;
    const order = [...layers];
    [order[index], order[to]] = [order[to], order[index]];
    setOthers(order.filter((l) => !l.self));
    setSelfAt(order.findIndex((l) => l.self));
  };
  const remove = (layer: Layer) => {
    const index = layers.indexOf(layer);
    setOthers(others.filter((l) => l !== layer));
    if (index < selfAt) setSelfAt(selfAt - 1);
  };

  if (!store) return null;
  const merged = result ? [...result.merged.keys()] : [];

  return (
    <div
      className="flex max-w-4xl flex-col gap-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const files = [...e.dataTransfer.files].filter((f) => /\.zip$/i.test(f.name));
        if (files.length) void load(files);
      }}
    >
      <div>
        <h2 className="text-base font-semibold">{t('stack.title')}</h2>
        <p className="text-xs text-neutral-400">{t('stack.hint')}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <Btn tone="primary" onClick={() => void load()} disabled={loading}>
            {loading ? t('compare.loading') : t('stack.add')}
          </Btn>
          {lastBatch && (
            <Btn onClick={undoBatch} title={t('batch.undoInfo', { count: lastBatch.count })}>
              {t('batch.undo')}
            </Btn>
          )}
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      <div>
        <div className="mb-1 text-[11px] text-neutral-500">{t('stack.top')}</div>
        <ol className="flex flex-col gap-1">
          {layers.map((l, i) => {
            const wins = result ? [...result.origin.values()].filter((o) => o === i).length : l.files.size;
            const overlays = l.self ? [] : extraFolders(l.files);
            const oldFormat = !l.self && l.meta?.format !== undefined && gameFormat !== undefined && l.meta.format !== gameFormat;
            return (
              <li key={l.id} className={`flex items-center gap-2 rounded px-3 py-2 text-xs ${l.self ? 'bg-emerald-950 ring-1 ring-emerald-800' : 'bg-neutral-900'}`}>
                <span className="w-5 text-right text-neutral-500">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <b className="truncate">{l.name}</b>
                    {l.self && <span className="rounded bg-emerald-800 px-1.5 text-[10px]">{t('stack.thisPack')}</span>}
                    {l.meta?.format !== undefined && <span className={oldFormat ? 'text-amber-300' : 'text-neutral-500'}>{t('stack.format', { format: l.meta.format })}</span>}
                  </div>
                  {l.meta?.description && <div className="truncate text-neutral-400">{l.meta.description}</div>}
                  <div className="text-neutral-500">
                    {result ? t('stack.wins', { count: wins, hidden: result.hidden[i] }) : t('compare.files', { count: l.files.size })}
                  </div>
                  {oldFormat && <div className="text-amber-300">{t('stack.oldFormat', { game: gameFormat })}</div>}
                  {overlays.length > 0 && <div className="text-amber-300">{t('stack.overlays', { folders: overlays.join(', ') })}</div>}
                </div>
                <Btn onClick={() => move(i, -1)} disabled={i === 0} title={t('stack.up')}>
                  ▲
                </Btn>
                <Btn onClick={() => move(i, 1)} disabled={i === layers.length - 1} title={t('stack.down')}>
                  ▼
                </Btn>
                {!l.self && (
                  <Btn onClick={() => remove(l)} title={t('stack.remove')}>
                    ✕
                  </Btn>
                )}
              </li>
            );
          })}
        </ol>
        <div className="mt-1 text-[11px] text-neutral-500">{t('stack.bottom')}</div>
      </div>

      {result && (
        <div className="flex flex-col gap-2 text-xs">
          {merged.length > 0 && (
            <div>
              <div className="text-neutral-300">{t('stack.merged', { count: merged.length })}</div>
              <ul className="mt-1 flex flex-col gap-0.5 font-mono text-[11px] text-neutral-400">
                {merged.map((p) => (
                  <li key={p}>
                    {p} <span className="text-neutral-600">· {t(`stack.kinds.${mergeKindOf(p)!}`)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.unreadable.length > 0 && <p className="text-amber-300">{t('stack.unreadable', { files: result.unreadable.join(', ') })}</p>}
          <div className="flex items-center gap-2">
            <Btn tone="primary" onClick={() => applyBatch(changes)} disabled={!changes.size}>
              {t('stack.apply', { count: changes.size })}
            </Btn>
            {!changes.size && <span className="text-neutral-400">{t('stack.nothing')}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
