import { useState } from 'react';
import { useT } from '../i18n';
import { runBatch, type BatchOp } from '../pack/batch';
import { decodeImage, encodePng } from '../render/png';
import { useApp } from '../state/appStore';
import { useEditor } from '../state/editorStore';
import { Btn } from './common';
import { TextureThumb } from './TexturesView';

const PREVIEW = 24;
const codec = { decode: decodeImage, encode: encodePng };

/** Changes for many textures at once: recolour, grayscale, invert, upscale. */
export function BatchPanel({ paths }: { paths: string[] }) {
  const t = useT();
  const { store, applyBatch, undoBatch, lastBatch } = useApp();
  const [hsl, setHsl] = useState<[number, number, number]>([0, 0, 0]);
  const [factor, setFactor] = useState(2);
  const [progress, setProgress] = useState<[number, number]>();
  const [done, setDone] = useState<string>();

  const run = async (op: BatchOp) => {
    if (!store || !paths.length || progress) return;
    if (useEditor.getState().target && !useEditor.getState().confirmLeave()) return;
    useEditor.getState().close();
    setDone(undefined);
    setProgress([0, paths.length]);
    try {
      const changes = await runBatch(store, paths, op, codec, (d, n) => setProgress([d, n]));
      applyBatch(changes);
      setDone(t('batch.done', { count: [...changes.keys()].filter((p) => p.endsWith('.png')).length }));
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setProgress(undefined);
    }
  };

  const busy = !!progress;
  const none = paths.length === 0;
  return (
    <div className="flex flex-col gap-3 text-xs">
      <div>
        <div className="text-sm font-semibold">{t('batch.title')}</div>
        <p className="text-neutral-400">{t('batch.intro')}</p>
      </div>
      <div className="text-neutral-300">{t('batch.selected', { count: paths.length })}</div>
      {store && paths.length > 0 && (
        <div className="flex flex-wrap gap-0.5">
          {paths.slice(0, PREVIEW).map((p) => (
            <TextureThumb key={p} store={store} path={p} className="checker h-8 w-8 rounded-sm" />
          ))}
          {paths.length > PREVIEW && <span className="self-center px-1 text-neutral-500">+{paths.length - PREVIEW}</span>}
        </div>
      )}

      <Group title={t('batch.colorTitle')}>
        {(['hue', 'saturation', 'lightness'] as const).map((k, i) => (
          <label key={k} className="flex items-center gap-2">
            <span className="w-20">{t(`editor.texture.${k}`)}</span>
            <input
              type="range"
              min={i === 0 ? -180 : -100}
              max={i === 0 ? 180 : 100}
              value={hsl[i]}
              onChange={(e) => {
                const next = [...hsl] as [number, number, number];
                next[i] = Number(e.target.value);
                setHsl(next);
              }}
              className="min-w-0 flex-1"
            />
            <span className="w-8 text-right">{hsl[i]}</span>
          </label>
        ))}
        <div className="flex flex-wrap gap-1">
          <Btn tone="primary" disabled={busy || none || hsl.every((v) => v === 0)} onClick={() => void run({ kind: 'hsl', hue: hsl[0], saturation: hsl[1], lightness: hsl[2] })}>
            {t('batch.applyColor')}
          </Btn>
          <Btn disabled={busy || none} onClick={() => void run({ kind: 'grayscale' })}>{t('editor.texture.grayscale')}</Btn>
          <Btn disabled={busy || none} onClick={() => void run({ kind: 'invert' })}>{t('editor.texture.invert')}</Btn>
        </div>
        <p className="text-[11px] text-neutral-500">{t('batch.colorHint')}</p>
      </Group>

      <Group title={t('batch.scaleTitle')}>
        <div className="flex items-center gap-2">
          <select value={factor} onChange={(e) => setFactor(Number(e.target.value))} className="rounded bg-neutral-800 px-1 py-1">
            {[2, 4, 8].map((f) => (
              <option key={f} value={f}>
                ×{f}
              </option>
            ))}
          </select>
          <Btn tone="primary" disabled={busy || none} onClick={() => void run({ kind: 'scale', factor })}>{t('batch.applyScale')}</Btn>
        </div>
        <p className="text-[11px] text-neutral-500">{t('batch.scaleHint')}</p>
      </Group>

      {progress && <div className="text-neutral-300">{t('batch.working', { done: progress[0], total: progress[1] })}</div>}
      {done && <div className="text-emerald-400">{done}</div>}
      {lastBatch && !busy && (
        <div className="flex items-center gap-2 border-t border-neutral-800 pt-2">
          <span className="flex-1 text-neutral-400">{t('batch.undoInfo', { count: lastBatch.count })}</span>
          <Btn onClick={() => { undoBatch(); setDone(undefined); }}>{t('batch.undo')}</Btn>
        </div>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-neutral-800 pt-2">
      <div className="font-medium text-neutral-300">{title}</div>
      {children}
    </div>
  );
}
