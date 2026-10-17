import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Source } from '../assets/AssetStore';
import { basename } from '../models/resourceLocation';
import { downloadBlob } from '../pack/exportPack';
import { useApp } from '../state/appStore';

const BADGE: Record<Source, [string, string]> = {
  vanilla: ['Vanilla', 'bg-neutral-700 text-neutral-300'],
  pack: ['Pack', 'bg-sky-800 text-sky-100'],
  edited: ['Bearbeitet', 'bg-amber-600 text-amber-50'],
};

export function SourceBadge({ source }: { source: Source | undefined }) {
  if (!source) return <span className="rounded px-1.5 py-0.5 text-[10px] bg-red-900 text-red-100">fehlt</span>;
  const [label, cls] = BADGE[source];
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
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
  /** Offer "Verwerfen" for edits (off when another action owns the file's lifecycle). */
  allowDiscard?: boolean;
}

/** Download / replace / reset buttons shared by textures, sounds and model files. */
export function AssetActions({ path, source, load, kind, vanillaAvailable, allowDiscard = true }: AssetActionsProps) {
  const { setFile, resetFile, store } = useApp();
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
      if (!next) throw new Error('Datei ist kein gültiges PNG.');
      const cur = store?.get(path);
      const prev = cur && (await imageSize(cur));
      if (prev && prev[0] / prev[1] !== next[0] / next[1]) {
        const ok = confirm(
          `Seitenverhältnis weicht ab: bisher ${prev[0]}×${prev[1]}, neu ${next[0]}×${next[1]}. Animierte Texturen oder UV-Mapping könnten kaputtgehen. Trotzdem übernehmen?`,
        );
        if (!ok) return;
      }
    }
    setFile(path, bytes);
  });

  return (
    <div className="flex flex-wrap gap-1">
      <Btn onClick={download} disabled={busy || !source} title="Aktuelle Datei herunterladen">⬇ Download</Btn>
      {kind !== 'file' && <Btn onClick={replace} disabled={busy} title="Durch eigene Datei ersetzen">⬆ Ersetzen</Btn>}
      {edited && allowDiscard && <Btn onClick={() => resetFile(path)} title="Eigene Änderung verwerfen">↺ Verwerfen</Btn>}
      {store?.pack.has(path) && store.edits.get(path) !== null && vanillaAvailable && (
        <Btn onClick={() => setFile(path, null)} tone="danger" title="Datei aus dem Pack entfernen, Vanilla wird wieder sichtbar">
          Vanilla
        </Btn>
      )}
    </div>
  );
}
