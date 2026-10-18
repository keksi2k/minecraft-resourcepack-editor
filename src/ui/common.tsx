import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Source } from '../assets/AssetStore';
import { LOCALES, useLocale, useT, type Locale } from '../i18n';
import { basename } from '../models/resourceLocation';
import { downloadBlob } from '../pack/exportPack';
import { useApp } from '../state/appStore';

const BADGE: Record<Source, string> = {
  vanilla: 'bg-neutral-700 text-neutral-300',
  pack: 'bg-sky-800 text-sky-100',
  edited: 'bg-amber-600 text-amber-50',
};

export function SourceBadge({ source }: { source: Source | undefined }) {
  const t = useT();
  if (!source) return <span className="rounded px-1.5 py-0.5 text-[10px] bg-red-900 text-red-100">{t('source.missing')}</span>;
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${BADGE[source]}`}>{t(`source.${source}`)}</span>;
}

/** Language picker; lists every registered locale by its own name. */
export function LanguageSelect() {
  const { locale, setLocale } = useLocale();
  const t = useT();
  return (
    <select
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      title={t('app.language')}
      aria-label={t('app.language')}
      className="rounded bg-neutral-800 px-2 py-1 text-xs"
    >
      {(Object.entries(LOCALES) as [Locale, (typeof LOCALES)[Locale]][]).map(([code, info]) => (
        <option key={code} value={code}>
          {info.name}
        </option>
      ))}
    </select>
  );
}

/** Becomes true once the element has scrolled into view (and stays true). */
export function useInView<T extends Element>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen || !ref.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { rootMargin: '200px' });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

export function downloadBytes(bytes: Uint8Array, path: string) {
  downloadBlob(new Blob([bytes]), basename(path));
}

export function pickFile(accept: string): Promise<File | undefined> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0]);
    input.click();
  });
}

async function imageSize(bytes: Uint8Array | Blob): Promise<[number, number] | undefined> {
  try {
    const bmp = await createImageBitmap(bytes instanceof Blob ? bytes : new Blob([bytes]));
    const size: [number, number] = [bmp.width, bmp.height];
    bmp.close();
    return size;
  } catch {
    return undefined;
  }
}

export function Btn({ children, onClick, title, disabled, tone = 'default' }: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  tone?: 'default' | 'primary' | 'danger';
}) {
  const tones = {
    default: 'bg-neutral-700 hover:bg-neutral-600',
    primary: 'bg-emerald-700 hover:bg-emerald-600',
    danger: 'bg-red-900 hover:bg-red-800',
  };
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded px-2 py-1 text-xs disabled:opacity-40 disabled:cursor-not-allowed ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

interface AssetActionsProps {
  path: string;
  source: Source | undefined;
  /** Current bytes (may need a network fetch for vanilla sounds). */
  load: () => Promise<Uint8Array | undefined>;
  kind: 'texture' | 'sound' | 'file';
  /** A vanilla version exists that removing the pack's file would reveal. */
  vanillaAvailable: boolean;
  /** Offer "discard" for edits (off when another action owns the file's lifecycle). */
  allowDiscard?: boolean;
}

/** Download / replace / reset buttons shared by textures, sounds and model files. */
export function AssetActions({ path, source, load, kind, vanillaAvailable, allowDiscard = true }: AssetActionsProps) {
  const { setFile, resetFile, store } = useApp();
  const t = useT();
  const [busy, setBusy] = useState(false);
  const edited = store?.edits.has(path) ?? false;
  const accept = kind === 'texture' ? 'image/png,.png' : kind === 'sound' ? 'audio/ogg,.ogg' : '*/*';

  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const download = run(async () => {
    const bytes = await load();
    if (bytes) downloadBytes(bytes, path);
  });

  const replace = run(async () => {
    const file = await pickFile(accept);
    if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (kind === 'texture') {
      const next = await imageSize(file);
      if (!next) throw new Error(t('actions.notAPng'));
      const cur = store?.get(path);
      const prev = cur && (await imageSize(cur));
      if (prev && prev[0] / prev[1] !== next[0] / next[1]) {
        const ok = confirm(t('actions.aspectMismatch', { oldW: prev[0], oldH: prev[1], newW: next[0], newH: next[1] }));
        if (!ok) return;
      }
    }
    setFile(path, bytes);
  });

  return (
    <div className="flex flex-wrap gap-1">
      <Btn onClick={download} disabled={busy || !source} title={t('actions.downloadTitle')}>{t('actions.download')}</Btn>
      {kind !== 'file' && <Btn onClick={replace} disabled={busy} title={t('actions.replaceTitle')}>{t('actions.replace')}</Btn>}
      {edited && allowDiscard && <Btn onClick={() => resetFile(path)} title={t('actions.discardTitle')}>{t('actions.discard')}</Btn>}
      {store?.pack.has(path) && store.edits.get(path) !== null && vanillaAvailable && (
        <Btn onClick={() => setFile(path, null)} tone="danger" title={t('actions.vanillaTitle')}>
          {t('actions.vanilla')}
        </Btn>
      )}
    </div>
  );
}
