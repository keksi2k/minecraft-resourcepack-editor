import { useMemo, useState } from 'react';
import { useT } from '../i18n';
import { formatBytes, shrinkCandidates, SHRINK_STEPS, type ShrinkStep } from '../pack/shrink';
import type { ShrinkOutcome } from '../pack/shrinkRun';
import { useApp } from '../state/appStore';
import { Btn } from './common';

/** Makes the pack smaller: drops files the game doesn't need and compresses the rest better. */
export function ShrinkPanel() {
  const t = useT();
  const { store, revision, folder, applyBatch, lastBatch, undoBatch } = useApp();
  const files = useMemo(() => store?.exportFiles() ?? new Map<string, Uint8Array>(), [store, revision]);
  const candidates = useMemo(() => shrinkCandidates(files, (p) => store?.vanilla.get(p)), [files, store]);
  const total = useMemo(() => [...files.values()].reduce((s, b) => s + b.length, 0), [files]);
  // in a folder, the "junk" is the author's own working files: deleting them there is too much
  const blocked = (step: ShrinkStep) => step === 'junk' && !!folder;
  const [steps, setSteps] = useState<Set<ShrinkStep>>(new Set(['vanilla', 'junk', 'json', 'png']));
  const [quality, setQuality] = useState(3);
  const [progress, setProgress] = useState<[number, number]>();
  const [outcome, setOutcome] = useState<ShrinkOutcome & { total: number }>();
  const [error, setError] = useState<string>();

  const chosen = SHRINK_STEPS.filter((s) => steps.has(s) && !blocked(s) && candidates.files[s].length);
  const run = async () => {
    if (!store) return;
    setError(undefined);
    setOutcome(undefined);
    setProgress([0, 1]);
    try {
      const { runShrink } = await import('../pack/shrinkRun');
      const result = await runShrink(candidates, (p) => files.get(p), { steps: new Set(chosen), oggQuality: quality }, (done, all) => setProgress([done, all]));
      if (result.changes.size) applyBatch(result.changes);
      setOutcome({ ...result, total });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(undefined);
    }
  };

  if (!store) return null;
  const saved = outcome ? SHRINK_STEPS.reduce((s, step) => s + outcome.before[step] - outcome.after[step], 0) : 0;

  return (
    <div className="flex max-w-3xl flex-col gap-4 text-xs">
      <div>
        <h2 className="text-base font-semibold">{t('shrink.title')}</h2>
        <p className="text-neutral-400">{t('shrink.hint')}</p>
        <p className="mt-2 text-neutral-300">{t('shrink.size', { size: formatBytes(total), count: files.size })}</p>
      </div>

      <div className="flex flex-col gap-2">
        {SHRINK_STEPS.map((step) => {
          const n = candidates.files[step].length;
          return (
            <label key={step} className={`flex gap-2 rounded bg-neutral-900 px-3 py-2 ${!n || blocked(step) ? 'opacity-60' : ''}`}>
              <input
                type="checkbox"
                className="mt-0.5"
                checked={steps.has(step) && !blocked(step) && n > 0}
                disabled={!n || blocked(step) || !!progress}
                onChange={(e) => {
                  const next = new Set(steps);
                  if (e.target.checked) next.add(step);
                  else next.delete(step);
                  setSteps(next);
                }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <b>{t(`shrink.steps.${step}.title`)}</b>
                  <span className="text-neutral-500">{n ? t('shrink.files', { count: n, size: formatBytes(candidates.bytes[step]) }) : t('shrink.none')}</span>
                </div>
                <p className="text-neutral-400">{t(`shrink.steps.${step}.info`)}</p>
                {step === 'junk' && n > 0 && (
                  <p className="mt-1 break-all font-mono text-[11px] text-neutral-500">
                    {candidates.files.junk.slice(0, 8).join(', ')}
                    {n > 8 && ` …`}
                  </p>
                )}
                {blocked(step) && <p className="mt-1 text-amber-300">{t('shrink.folderJunk')}</p>}
                {step === 'ogg' && (
                  <div className="mt-1 flex items-center gap-2">
                    {t('shrink.quality')}
                    <input type="range" min={0} max={6} value={quality} onChange={(e) => setQuality(+e.target.value)} disabled={!!progress} />
                    <span className="w-24 text-neutral-300">{t('shrink.qualityValue', { quality })}</span>
                  </div>
                )}
              </div>
            </label>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Btn tone="primary" onClick={() => void run()} disabled={!!progress || !chosen.length}>
          {progress ? t('shrink.working', { done: progress[0], total: progress[1] }) : t('shrink.run')}
        </Btn>
        {lastBatch && !progress && (
          <Btn onClick={undoBatch} title={t('batch.undoInfo', { count: lastBatch.count })}>
            {t('batch.undo')}
          </Btn>
        )}
        {progress && (
          <div className="h-1.5 w-48 overflow-hidden rounded bg-neutral-800">
            <div className="h-full bg-emerald-500" style={{ width: `${(progress[0] / Math.max(1, progress[1])) * 100}%` }} />
          </div>
        )}
      </div>
      {error && <p className="text-red-400">{error}</p>}

      {outcome && (
        <div className="rounded bg-neutral-900 p-3">
          <p className="font-semibold text-emerald-300">
            {t('shrink.done', { saved: formatBytes(saved), percent: Math.round((saved / Math.max(1, outcome.total)) * 100), count: outcome.changes.size })}
          </p>
          <ul className="mt-1 text-neutral-400">
            {SHRINK_STEPS.filter((s) => outcome.before[s]).map((s) => (
              <li key={s}>
                {t(`shrink.steps.${s}.title`)}: {formatBytes(outcome.before[s])} → {formatBytes(outcome.after[s])}
              </li>
            ))}
          </ul>
          {outcome.failed.length > 0 && <p className="mt-1 text-amber-300">{t('shrink.failed', { files: outcome.failed.slice(0, 5).join(', ') })}</p>}
        </div>
      )}
    </div>
  );
}
