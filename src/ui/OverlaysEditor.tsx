import { useMemo, useState } from 'react';
import { parseLenientJson } from '../assets/AssetStore';
import { useT } from '../i18n';
import { newPackMeta } from '../pack/exportPack';
import { readOverlays, VALID_DIRECTORY, writeOverlays, type Overlay } from '../pack/overlays';
import { useApp } from '../state/appStore';
import { Btn, SourceBadge } from './common';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Overlays: folders of files that only some game versions use (pack.mcmeta `overlays`). */
export function OverlaysEditor() {
  const t = useT();
  const { store, gameFormat, version, setFile, resetFile } = useApp();
  const revision = useApp((s) => s.revision);
  const raw = useMemo(() => {
    const bytes = store?.get('pack.mcmeta');
    try {
      return bytes ? (parseLenientJson(decoder.decode(bytes)) as any) : undefined;
    } catch {
      return undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, revision]);
  const overlays = readOverlays(raw);
  const [copyTo, setCopyTo] = useState<Record<string, string>>({});
  const rootFiles = useMemo(
    () => store?.list('assets/').filter((p) => store.source(p) === 'pack' || store.source(p) === 'edited') ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, revision],
  );
  if (!store) return null;

  const save = (next: Overlay[]) => {
    const base = raw ?? JSON.parse(decoder.decode(newPackMeta(gameFormat ?? 46, '')));
    setFile('pack.mcmeta', encoder.encode(JSON.stringify(writeOverlays(base, next), null, 2)));
  };
  const update = (i: number, patch: Partial<Overlay>) => save(overlays.map((o, j) => (j === i ? { ...o, ...patch } : o)));
  const move = (i: number, d: number) => {
    const next = [...overlays];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    save(next);
  };
  const add = () => {
    const f = gameFormat ?? 0;
    let dir = `overlay_${f}`;
    for (let i = 2; overlays.some((o) => o.directory === dir); i++) dir = `overlay_${f}_${i}`;
    save([...overlays, { directory: dir, min: f, max: f }]);
  };

  /** Files physically in a folder (pack and edits), without the folder prefix. */
  const filesIn = (dir: string) => {
    const out = new Set<string>();
    for (const map of [store.pack, store.edits])
      for (const p of map.keys()) if (p.startsWith(`${dir}/`) && (store.edits.has(p) ? store.edits.get(p) : true)) out.add(p.slice(dir.length + 1));
    return [...out].sort();
  };
  const copyInto = (dir: string) => {
    const path = copyTo[dir]?.trim();
    const bytes = path && store.get(path);
    if (!bytes) return;
    setFile(`${dir}/${path}`, bytes);
    setCopyTo({ ...copyTo, [dir]: '' });
  };
  const removeFile = (path: string) => (store.pack.has(path) ? setFile(path, null) : resetFile(path));

  return (
    <div className="flex max-w-4xl flex-col gap-4 text-sm">
      <div>
        <h2 className="text-base font-semibold">{t('overlays.title')}</h2>
        <p className="text-xs text-neutral-400">{t('overlays.hint')}</p>
        <p className="mt-2 text-xs text-neutral-300">
          {t('overlays.current', { version: version?.id ?? '?', format: gameFormat ?? '?' })}{' '}
          {store.overlays.length ? t('overlays.activeList', { list: store.overlays.join(', ') }) : t('overlays.noneActive')}
        </p>
      </div>

      {overlays.map((o, i) => {
        const active = gameFormat !== undefined && gameFormat >= o.min && gameFormat <= o.max;
        const files = filesIn(o.directory);
        return (
          <div key={i} className={`flex flex-col gap-2 rounded p-3 ring-1 ${active ? 'bg-emerald-950/40 ring-emerald-700' : 'bg-neutral-900 ring-neutral-800'}`}>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1">
                {t('overlays.folder')}
                <input
                  defaultValue={o.directory}
                  key={o.directory}
                  onBlur={(e) => e.target.value !== o.directory && update(i, { directory: e.target.value.trim() })}
                  className={`w-44 rounded bg-neutral-800 px-2 py-1 font-mono outline-none focus:ring-1 ${VALID_DIRECTORY.test(o.directory) ? 'focus:ring-emerald-500' : 'ring-1 ring-red-600'}`}
                />
              </label>
              <label className="flex items-center gap-1">
                {t('overlays.formats')}
                <input type="number" value={o.min} onChange={(e) => update(i, { min: Number(e.target.value) })} className="w-16 rounded bg-neutral-800 px-1 py-1" />–
                <input type="number" value={o.max} onChange={(e) => update(i, { max: Number(e.target.value) })} className="w-16 rounded bg-neutral-800 px-1 py-1" />
              </label>
              {active && <span className="rounded bg-emerald-700 px-1.5 py-0.5 text-[10px]">{t('overlays.active')}</span>}
              <span className="ml-auto flex gap-1">
                <Btn onClick={() => move(i, -1)} disabled={i === 0} title={t('overlays.up')}>
                  ↑
                </Btn>
                <Btn onClick={() => move(i, 1)} disabled={i === overlays.length - 1} title={t('overlays.down')}>
                  ↓
                </Btn>
                <Btn tone="danger" onClick={() => save(overlays.filter((_, j) => j !== i))} title={t('overlays.removeTitle')}>
                  ✕
                </Btn>
              </span>
            </div>
            <div className="text-[11px] text-neutral-400">{t('overlays.files', { count: files.length })}</div>
            <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
              {files.map((f) => (
                <div key={f} className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="min-w-0 flex-1 truncate" title={f}>
                    {f}
                  </span>
                  <SourceBadge source={store.edits.has(`${o.directory}/${f}`) ? 'edited' : 'pack'} />
                  <Btn tone="danger" onClick={() => removeFile(`${o.directory}/${f}`)}>
                    ✕
                  </Btn>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <input
                list={`overlay-files-${i}`}
                value={copyTo[o.directory] ?? ''}
                onChange={(e) => setCopyTo({ ...copyTo, [o.directory]: e.target.value })}
                placeholder={t('overlays.copyPlaceholder')}
                className="min-w-0 flex-1 rounded bg-neutral-800 px-2 py-1 font-mono outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <datalist id={`overlay-files-${i}`}>
                {rootFiles.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <Btn onClick={() => copyInto(o.directory)} disabled={!store.has(copyTo[o.directory]?.trim() ?? '')}>
                {t('overlays.copy')}
              </Btn>
            </div>
          </div>
        );
      })}

      <div>
        <Btn tone="primary" onClick={add}>
          {t('overlays.add', { format: gameFormat ?? '?' })}
        </Btn>
      </div>
      <p className="text-xs text-neutral-500">{t('overlays.editHint')}</p>
    </div>
  );
}
