import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { exportPackZip, downloadBlob } from '../pack/exportPack';
import { useT } from '../i18n';
import { useApp, type Tab } from '../state/appStore';
import { Btn, LanguageSelect, pickFile } from './common';
import { makePackIcon, PACK_ICON } from '../pack/packIcon';
import { useEditor } from '../state/editorStore';
import { checkPack, type Issue } from '../pack/checks';
import { ExportCheck } from './ExportCheck';
import { COMMAND_EVENT, type HeaderCommand } from './CommandPalette';

const UpgradePanel = lazy(() => import('./UpgradePanel').then((m) => ({ default: m.UpgradePanel })));

const TABS: Tab[] = ['items', 'plants', 'mobs', 'textures', 'sounds', 'scenes', 'texts', 'progress', 'funny'];

export function Header({ onSearch }: { onSearch: () => void }) {
  const { packName, packMeta, version, gameFormat, tab, setTab, store, close, revision, objects, undo, redo, undoCount, redoCount, upgradeOpen, setUpgradeOpen } = useApp();
  const t = useT();
  const [exporting, setExporting] = useState(false);
  const [issues, setIssues] = useState<Issue[]>();
  const edits = store?.editCount ?? 0;
  void revision; // re-render on edits so the counter stays current

  const formatMismatch = packMeta?.format !== undefined && gameFormat !== undefined && packMeta.format !== gameFormat;
  const older = formatMismatch && packMeta!.format! < gameFormat!;

  const doExport = async () => {
    if (!store) return;
    setExporting(true);
    try {
      downloadBlob(await exportPackZip(store, gameFormat), `${packName}${edits ? t('header.editedSuffix') : ''}.zip`);
      setIssues(undefined);
    } finally {
      setExporting(false);
    }
  };

  /** Checks the pack first; problems are shown before anything is downloaded. */
  const check = (always: boolean) => {
    if (!store) return;
    const found = checkPack(store, store.exportFiles(), { gameFormat, vanillaSound: objects && ((key) => objects.has(key)) });
    if (always || found.some((i) => i.level !== 'info')) setIssues(found);
    else void doExport();
  };

  // export and check can be asked for from the command palette
  const checkRef = useRef(check);
  checkRef.current = check;
  useEffect(() => {
    const h = (e: Event) => {
      const c = (e as CustomEvent<HeaderCommand>).detail;
      if (c === 'upgrade') useApp.getState().setUpgradeOpen(true);
      else checkRef.current(c === 'check');
    };
    window.addEventListener(COMMAND_EVENT, h);
    return () => window.removeEventListener(COMMAND_EVENT, h);
  }, []);

  return (
    <header className="flex items-center gap-4 border-b border-neutral-800 bg-neutral-950 px-4 py-2">
      <PackIconButton />
      <div className="min-w-0 shrink">
        <div className="truncate font-semibold">{packName}</div>
        <div className="truncate text-xs text-neutral-400">
          Vanilla {version?.id}
          {gameFormat !== undefined && ` (${t('header.format', { format: gameFormat })})`}
          {packMeta?.format !== undefined && ` · ${t('header.packFormat', { format: packMeta.format })}`}
          {formatMismatch && <span className="text-amber-400"> · {t('header.formatMismatch')}</span>}
        </div>
      </div>
      <FolderBadge />
      {older && (
        <button onClick={() => setUpgradeOpen(true)} title={t('upgrade.buttonTitle')} className="shrink-0 whitespace-nowrap rounded bg-amber-800 px-2 py-1 text-xs hover:bg-amber-700">
          {t('upgrade.button')}
        </button>
      )}
      <nav className="no-scrollbar ml-2 flex min-w-0 shrink gap-0.5 overflow-x-auto xl:ml-6 xl:gap-1">
        {TABS.map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`whitespace-nowrap rounded px-2 py-1.5 text-sm xl:px-3 ${tab === id ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
          >
            {t(`header.tabs.${id}`)}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <button onClick={onSearch} title={t('palette.open')} className="flex items-center gap-2 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-700">
          🔍 <kbd className="hidden whitespace-nowrap rounded bg-neutral-900 px-1 font-mono text-[10px] 2xl:inline">Ctrl K</kbd>
        </button>
        <span className="flex">
          <button onClick={undo} disabled={!undoCount} title={t('palette.undoTitle', { count: undoCount })} className="rounded-l bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700 disabled:opacity-30">
            ↶
          </button>
          <button onClick={redo} disabled={!redoCount} title={t('palette.redoTitle', { count: redoCount })} className="rounded-r border-l border-neutral-900 bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700 disabled:opacity-30">
            ↷
          </button>
        </span>
        {edits > 0 && (
          <span className="whitespace-nowrap text-xs text-amber-400" title={t('header.autosaved')}>
            ✓ {t('header.edits', { count: edits })}
          </span>
        )}
        <LanguageSelect />
        <Btn onClick={() => check(true)} title={t('check.checkTitle')}>{t('check.check')}</Btn>
        <Btn tone="primary" onClick={() => check(false)} disabled={exporting}>
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
      {issues && (
        <ExportCheck
          issues={issues}
          exporting={exporting}
          onExport={() => void doExport()}
          onClose={() => setIssues(undefined)}
          onUpgrade={() => {
            setIssues(undefined);
            setUpgradeOpen(true);
          }}
        />
      )}
      {upgradeOpen && (
        <Suspense fallback={null}>
          <UpgradePanel onClose={() => setUpgradeOpen(false)} />
        </Suspense>
      )}
    </header>
  );
}

/** Shown when the pack is a folder on disk: whether changes reached it, and a way to reload it. */
function FolderBadge() {
  const { folder, reloadFolder, allowFolder } = useApp();
  const t = useT();
  if (!folder) return null;
  const tone = folder.status === 'error' || folder.status === 'denied' ? 'text-red-300' : folder.status === 'saving' ? 'text-neutral-400' : 'text-emerald-300';
  const text =
    folder.status === 'reloaded' ? t('folder.reloaded', { count: folder.reloaded ?? 0 }) : t(`folder.status.${folder.status}`);
  return (
    <div className="flex shrink-0 items-center gap-1 text-xs" title={folder.error ?? t('folder.badgeTitle', { name: folder.name })}>
      <span className="flex items-center gap-1 whitespace-nowrap rounded bg-neutral-800 px-2 py-1">
        📁 <span className="max-w-[8rem] truncate">{folder.name}</span> <span className={tone}>· {text}</span>
      </span>
      {folder.status === 'denied' ? (
        <Btn tone="primary" onClick={() => void allowFolder()}>{t('folder.allow')}</Btn>
      ) : (
        <button onClick={() => void reloadFolder()} title={t('folder.reload')} className="rounded bg-neutral-800 px-2 py-1 hover:bg-neutral-700">
          ⟳
        </button>
      )}
    </div>
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
    const close = (e: PointerEvent) => box.current?.contains(e.target as Node) || setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
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
