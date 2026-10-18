import { useState } from 'react';
import { exportPackZip, downloadBlob } from '../pack/exportPack';
import { useT } from '../i18n';
import { useApp, type Tab } from '../state/appStore';
import { Btn, LanguageSelect } from './common';

const TABS: Tab[] = ['items', 'mobs', 'textures', 'sounds'];

export function Header() {
  const { packName, packMeta, packIcon, version, gameFormat, tab, setTab, store, close, revision } = useApp();
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
      {packIcon ? (
        <img src={packIcon} className="pixelated h-10 w-10 rounded" alt="" />
      ) : (
        <div className="h-10 w-10 rounded bg-neutral-800" />
      )}
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
        {edits > 0 && <span className="text-xs text-amber-400">{t('header.edits', { count: edits })}</span>}
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
