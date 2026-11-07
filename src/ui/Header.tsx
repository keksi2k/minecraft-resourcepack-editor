import { useEffect, useRef, useState } from 'react';
import { exportPackZip, downloadBlob } from '../pack/exportPack';
import { useT } from '../i18n';
import { useApp, type Tab } from '../state/appStore';
import { Btn, LanguageSelect, pickFile } from './common';
import { makePackIcon, PACK_ICON } from '../pack/packIcon';
import { useEditor } from '../state/editorStore';

const TABS: Tab[] = ['items', 'plants', 'mobs', 'textures', 'sounds', 'funny'];

export function Header() {
  const { packName, packMeta, version, gameFormat, tab, setTab, store, close, revision } = useApp();
  const t = useT();
  const [exporting, setExporting] = useState(false);
  const edits = store?.editCount ?? 0;
  void revision; // re-render on edits so the counter stays current

  const formatMismatch = packMeta?.format !== undefined && gameFormat !== undefined && packMeta.format !== gameFormat;

  const doExport = async () => {
    if (!store) return;
    setExporting(true);
    try {
      downloadBlob(await exportPackZip(store, gameFormat), `${packName}${edits ? t('header.editedSuffix') : ''}.zip`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <header className="flex items-center gap-4 border-b border-neutral-800 bg-neutral-950 px-4 py-2">
      <PackIconButton />
      <div className="min-w-0">
        <div className="truncate font-semibold">{packName}</div>
        <div className="truncate text-xs text-neutral-400">
          Vanilla {version?.id}
          {gameFormat !== undefined && ` (${t('header.format', { format: gameFormat })})`}
          {packMeta?.format !== undefined && ` · ${t('header.packFormat', { format: packMeta.format })}`}
          {formatMismatch && <span className="text-amber-400"> · {t('header.formatMismatch')}</span>}
        </div>
      </div>
      <nav className="ml-6 flex gap-1">
        {TABS.map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`rounded px-3 py-1.5 text-sm ${tab === id ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
          >
            {t(`header.tabs.${id}`)}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {edits > 0 && (
          <span className="text-xs text-amber-400" title={t('header.autosaved')}>
            ✓ {t('header.edits', { count: edits })}
          </span>
        )}
        <LanguageSelect />
        <Btn tone="primary" onClick={() => void doExport()} disabled={exporting}>
          {exporting ? t('header.exporting') : t('header.export')}
        </Btn>
        <Btn
          onClick={() => {
            if (edits === 0 || confirm(t('header.confirmClose'))) close();
          }}
        >
          {t('header.close')}
        </Btn>
      </div>
    </header>
  );
}

/** The pack's icon (pack.png); click it to upload, edit or remove it. */
function PackIconButton() {
  const { packIcon, store, setFile, resetFile, setTab } = useApp();
  const openEditor = useEditor((s) => s.open);
  const t = useT();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => box.current?.contains(e.target as Node) || setOpen(false);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  const upload = async () => {
    setOpen(false);
    const file = await pickFile('image/*');
    if (!file) return;
    try {
      setFile(PACK_ICON, await makePackIcon(file));
    } catch (e) {
      alert((e as Error).message);
    }
  };
  const edit = () => {
    setOpen(false);
    // the editor needs a tab with room for it; the texture tab always has
    setTab('textures');
    if (useApp.getState().tab === 'textures') openEditor({ kind: 'texture', path: PACK_ICON, load: async () => store?.get(PACK_ICON) }, 'textures');
  };
  const edited = store?.edits.has(PACK_ICON) ?? false;
  const inPack = store?.pack.has(PACK_ICON) ?? false;

  return (
    <div ref={box} className="relative shrink-0">
      <button onClick={() => setOpen(!open)} title={t('header.icon.title')} className="group relative block h-10 w-10 overflow-hidden rounded ring-1 ring-neutral-700 hover:ring-emerald-500">
        {packIcon ? <img src={packIcon} className="pixelated h-full w-full" alt="" /> : <div className="flex h-full w-full items-center justify-center bg-neutral-800 text-lg text-neutral-500">+</div>}
        <span className="absolute inset-0 hidden items-center justify-center bg-black/50 text-sm group-hover:flex">✎</span>
      </button>
      {open && (
        <div className="absolute left-0 top-12 z-40 flex w-64 flex-col gap-2 rounded bg-neutral-900 p-3 text-xs shadow-xl ring-1 ring-neutral-700">
          <div className="font-semibold">{t('header.icon.title')}</div>
          <p className="text-neutral-400">{t('header.icon.hint')}</p>
          <div className="flex flex-wrap gap-1">
            <Btn tone="primary" onClick={() => void upload()}>{t('header.icon.upload')}</Btn>
            {packIcon && <Btn onClick={edit}>{t('actions.edit')}</Btn>}
            {edited && (
              <Btn onClick={() => { resetFile(PACK_ICON); setOpen(false); }}>{t('actions.discard')}</Btn>
            )}
            {packIcon && (edited ? store?.edits.get(PACK_ICON) !== null : inPack) && (
              <Btn tone="danger" onClick={() => { setFile(PACK_ICON, null); setOpen(false); }}>{t('header.icon.remove')}</Btn>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
