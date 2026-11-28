import { useState } from 'react';
import { useT } from '../../i18n';
import { countColor, replaceColor } from '../../render/paintTools';
import type { RGBA } from '../../render/pixelEdit';
import { decodeImage, encodePng } from '../../render/png';
import { useApp } from '../../state/appStore';
import { Btn } from '../common';
import { ColorChip, Section } from './parts';

type Scope = 'here' | 'folder' | 'pack';

interface Found {
  key: string;
  paths: string[];
  pixels: number;
}

/** Textures (besides the open one) a colour could be replaced in. */
export function replaceCandidates(paths: string[], open: string, scope: Scope, isPacks: (p: string) => boolean): string[] {
  if (scope === 'here') return [];
  const folder = open.slice(0, open.lastIndexOf('/') + 1);
  return paths.filter(
    (p) => p !== open && p.endsWith('.png') && p.includes('/textures/') && (scope === 'folder' ? p.startsWith(folder) && !p.slice(folder.length).includes('/') : isPacks(p)),
  );
}

/**
 * Replaces one colour with another: in the open texture (as an editor step), and if wanted in the
 * other textures of its folder or of the whole pack (as one batch).
 */
export function ReplaceColorPanel({ path, current, onHere }: { path: string; current: RGBA; onHere: (from: RGBA, to: RGBA, tolerance: number) => number }) {
  const t = useT();
  const { store, applyBatch, lastBatch, undoBatch } = useApp();
  const [from, setFrom] = useState<RGBA>();
  const [to, setTo] = useState<RGBA>();
  const [tolerance, setTolerance] = useState(0);
  const [scope, setScope] = useState<Scope>('here');
  const [found, setFound] = useState<Found>();
  const [progress, setProgress] = useState<[number, number]>();
  const [message, setMessage] = useState<string>();
  const key = `${from}|${to}|${tolerance}|${scope}`;
  const ready = from && to && !from.every((v, i) => v === to[i]);

  const find = async () => {
    if (!store || !from) return;
    const paths = replaceCandidates(store.list('assets/'), path, scope, (p) => store.source(p) !== 'vanilla');
    const hits: string[] = [];
    let pixels = 0;
    setMessage(undefined);
    for (let i = 0; i < paths.length; i++) {
      if (i % 20 === 0) {
        setProgress([i, paths.length]);
        await new Promise((r) => setTimeout(r));
      }
      const bytes = store.get(paths[i]);
      if (!bytes) continue;
      try {
        const n = countColor(await decodeImage(bytes), from, tolerance);
        if (n) {
          hits.push(paths[i]);
          pixels += n;
        }
      } catch {
        // not an image the browser can read
      }
    }
    setProgress(undefined);
    setFound({ key, paths: hits, pixels });
  };

  const replace = async () => {
    if (!store || !from || !to) return;
    const here = onHere(from, to, tolerance);
    const changes = new Map<string, Uint8Array>();
    const list = found?.key === key ? found.paths : [];
    for (let i = 0; i < list.length; i++) {
      setProgress([i, list.length]);
      const bytes = store.get(list[i]);
      if (!bytes) continue;
      const img = await decodeImage(bytes);
      if (replaceColor(img, from, to, tolerance)) changes.set(list[i], await encodePng(img));
    }
    setProgress(undefined);
    if (changes.size) applyBatch(changes);
    setFound(undefined);
    setMessage(scope === 'here' ? t('editor.texture.replacedHere', { count: here }) : t('editor.texture.replacedMany', { count: changes.size, pixels: here }));
  };

  const pickRow = (label: string, value: RGBA | undefined, set: (c: RGBA) => void) => (
    <div className="flex items-center gap-1">
      <span className="w-10 text-neutral-400">{label}</span>
      {value ? <ColorChip color={value} className="h-6 w-6" /> : <span className="h-6 w-6 rounded-sm border border-dashed border-neutral-600" />}
      <Btn onClick={() => set(current)} title={t('editor.texture.useCurrentTitle')}>
        {t('editor.texture.useCurrent')}
      </Btn>
    </div>
  );

  return (
    <Section title={t('editor.texture.replaceColor')} open={false}>
      {pickRow(t('editor.texture.replaceFrom'), from, setFrom)}
      {pickRow(t('editor.texture.replaceTo'), to, setTo)}
      {from && to && (
        <Btn
          onClick={() => {
            setFrom(to);
            setTo(from);
          }}
        >
          ⇅ {t('editor.texture.swap')}
        </Btn>
      )}
      <label className="flex items-center gap-2">
        {t('editor.texture.tolerance')}
        <input type="range" min={0} max={64} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="min-w-0 flex-1" />
        <span className="w-6 text-right">{tolerance}</span>
      </label>
      <select value={scope} onChange={(e) => setScope(e.target.value as Scope)} aria-label={t('editor.texture.replaceScope')} className="rounded bg-neutral-800 px-1 py-1">
        <option value="here">{t('editor.texture.scopeHere')}</option>
        <option value="folder">{t('editor.texture.scopeFolder')}</option>
        <option value="pack">{t('editor.texture.scopePack')}</option>
      </select>
      {progress ? (
        <div className="text-neutral-400">{t('editor.texture.searching', { done: progress[0], total: progress[1] })}</div>
      ) : scope === 'here' || found?.key === key ? (
        <>
          {found?.key === key && <div className="text-neutral-400">{t('editor.texture.foundIn', { count: found.paths.length, pixels: found.pixels })}</div>}
          <Btn tone="primary" onClick={() => void replace()} disabled={!ready}>
            {t('editor.texture.replace')}
          </Btn>
        </>
      ) : (
        <Btn onClick={() => void find()} disabled={!ready}>
          {t('editor.texture.findOthers')}
        </Btn>
      )}
      {message && <p className="text-[11px] leading-snug text-neutral-400">{message}</p>}
      {lastBatch && scope !== 'here' && !progress && (
        <Btn onClick={undoBatch} title={t('batch.undoInfo', { count: lastBatch.count })}>
          {t('batch.undo')}
        </Btn>
      )}
      <p className="text-[11px] leading-snug text-neutral-500">{t('editor.texture.replaceHint')}</p>
    </Section>
  );
}
