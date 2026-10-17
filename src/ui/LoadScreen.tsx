import { useMemo, useState } from 'react';
import { suggestVersion } from '../mojang/versions';
import { loadPackZip, type LoadedPack } from '../pack/loadPack';
import { useApp } from '../state/appStore';
import { Btn } from './common';

export function LoadScreen() {
  const { manifest, phase, status, progress, error, open } = useApp();
  const [pack, setPack] = useState<LoadedPack | null>(null);
  const [packError, setPackError] = useState<string>();
  const [versionId, setVersionId] = useState('');
  const [snapshots, setSnapshots] = useState(false);
  const [dragging, setDragging] = useState(false);

  const versions = useMemo(
    () => manifest?.versions.filter((v) => v.type === 'release' || (snapshots && v.type === 'snapshot')) ?? [],
    [manifest, snapshots],
  );
  const selected = versionId || (manifest ? suggestVersion(pack?.meta?.format, manifest) : '');

  const accept = async (file: File | undefined) => {
    if (!file) return;
    setPackError(undefined);
    try {
      const p = await loadPackZip(file);
      if (!p.files.has('pack.mcmeta') && ![...p.files.keys()].some((k) => k.startsWith('assets/'))) {
        throw new Error('Keine pack.mcmeta und kein assets/-Ordner gefunden – ist das ein Java-Resourcepack?');
      }
      setPack(p);
      setVersionId('');
    } catch (e) {
      setPackError((e as Error).message);
    }
  };

  if (phase === 'loading') {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <div className="text-lg">{status}</div>
        <div className="h-2 w-96 overflow-hidden rounded bg-neutral-800">
          <div
            className={`h-full bg-emerald-500 transition-all ${progress === undefined ? 'w-1/3 animate-pulse' : ''}`}
            style={progress !== undefined ? { width: `${Math.round(progress * 100)}%` } : undefined}
          />
        </div>
        <div className="text-xs text-neutral-500">Vanilla-Assets werden pro Version einmal geladen und im Browser gecacht.</div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 p-6">
      <h1 className="text-3xl font-bold">Resource Pack Editor</h1>
      <p className="text-sm text-neutral-400">
        Java-Edition-Resourcepack laden, alle Items in 3D ansehen, Sounds anhören, Texturen und Sounds herunterladen oder
        ersetzen und das Pack wieder exportieren. Alles passiert lokal im Browser.
      </p>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void accept(e.dataTransfer.files[0]);
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-10 text-center ${
          dragging ? 'border-emerald-400 bg-emerald-950' : 'border-neutral-600 hover:border-neutral-400'
        }`}
      >
        <input type="file" accept=".zip" className="hidden" onChange={(e) => void accept(e.target.files?.[0])} />
        {pack ? (
          <>
            <div className="text-lg font-semibold">{pack.name}</div>
            <div className="text-sm text-neutral-400">{pack.meta?.description || 'Keine Beschreibung'}</div>
            <div className="text-xs text-neutral-500">
              {pack.files.size} Dateien · pack_format {pack.meta?.format ?? '?'}
            </div>
          </>
        ) : (
          <>
            <div className="text-lg">Resourcepack (.zip) hierher ziehen</div>
            <div className="text-sm text-neutral-500">oder klicken zum Auswählen</div>
          </>
        )}
      </label>
      {packError && <div className="rounded bg-red-950 p-3 text-sm text-red-200">{packError}</div>}

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">Minecraft-Version (Vanilla-Basis):</span>
        <select
          value={selected}
          onChange={(e) => setVersionId(e.target.value)}
          className="rounded bg-neutral-800 px-2 py-1 text-sm"
          disabled={!manifest}
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.id}
              {v.type === 'snapshot' ? ' (Snapshot)' : ''}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-xs text-neutral-400">
          <input type="checkbox" checked={snapshots} onChange={(e) => setSnapshots(e.target.checked)} />
          Snapshots zeigen
        </label>
      </div>
      {pack?.meta?.format !== undefined && !versionId && (
        <div className="-mt-4 text-xs text-neutral-500">Vorschlag anhand von pack_format {pack.meta.format}.</div>
      )}

      <div className="flex gap-3">
        <Btn tone="primary" disabled={!pack || !selected} onClick={() => void open(pack, selected)}>
          Pack öffnen
        </Btn>
        <Btn disabled={!selected} onClick={() => void open(null, selected)} title="Mit leerem Pack auf Vanilla-Basis starten">
          Neues Pack erstellen
        </Btn>
      </div>
      {error && <div className="rounded bg-red-950 p-3 text-sm text-red-200">{error}</div>}
    </div>
  );
}
