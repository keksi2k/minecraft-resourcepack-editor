import { useState } from 'react';
import { useT, type MessageKey } from '../i18n';
import type { Issue, IssueLevel } from '../pack/checks';
import { useApp } from '../state/appStore';
import { Btn } from './common';

const LEVELS: IssueLevel[] = ['error', 'warning', 'info'];
const STYLE: Record<IssueLevel, string> = {
  error: 'text-red-300',
  warning: 'text-amber-300',
  info: 'text-neutral-400',
};
const ICON: Record<IssueLevel, string> = { error: '⛔', warning: '⚠', info: 'ℹ' };

/** The results of the pre-export check, with a way to export anyway. */
export function ExportCheck({ issues, exporting, onExport, onClose }: { issues: Issue[]; exporting: boolean; onExport: () => void; onClose: () => void }) {
  const t = useT();
  const focusTexture = useApp((s) => s.focusTexture);
  const [showInfo, setShowInfo] = useState(false);
  const count = (l: IssueLevel) => issues.filter((i) => i.level === l).length;
  const problems = count('error') + count('warning');

  const open = (path: string) => {
    const png = path.endsWith('.png.mcmeta') ? path.slice(0, -'.mcmeta'.length) : path;
    if (/^assets\/[^/]+\/textures\/.+\.png$/.test(png)) {
      focusTexture(png);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded bg-neutral-900 text-sm shadow-2xl ring-1 ring-neutral-700">
        <div className="border-b border-neutral-800 p-4">
          <h2 className="text-base font-semibold">{t('check.title')}</h2>
          <p className="mt-1 text-xs text-neutral-400">
            {problems ? t('check.summary', { errors: count('error'), warnings: count('warning') }) : t('check.allGood')}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {LEVELS.map((level) => {
            const list = issues.filter((i) => i.level === level);
            if (!list.length) return null;
            const hidden = level === 'info' && !showInfo;
            return (
              <div key={level} className="mb-4">
                <button
                  className={`mb-1 text-xs font-semibold uppercase tracking-wide ${STYLE[level]}`}
                  onClick={() => level === 'info' && setShowInfo(!showInfo)}
                >
                  {ICON[level]} {t(`check.levels.${level}`, { count: list.length })}
                  {level === 'info' && ` ${showInfo ? '▾' : '▸'}`}
                </button>
                {!hidden && (
                  <ul className="flex flex-col gap-1.5">
                    {list.map((issue, i) => (
                      <li key={i} className="rounded bg-neutral-950 px-2 py-1.5 text-xs">
                        <div className={STYLE[level]}>{t(`check.issues.${issue.code}` as MessageKey, issue.vars)}</div>
                        {issue.path && (
                          <button onClick={() => open(issue.path!)} className="break-all text-left font-mono text-[11px] text-neutral-400 hover:text-emerald-300" title={t('check.show')}>
                            {issue.path}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-800 p-3">
          <span className="mr-auto text-[11px] text-neutral-500">{t('check.hint')}</span>
          <Btn onClick={onClose}>{t('editor.cancel')}</Btn>
          <Btn tone={count('error') ? 'danger' : 'primary'} onClick={onExport} disabled={exporting}>
            {exporting ? t('header.exporting') : problems ? t('check.exportAnyway') : t('header.export')}
          </Btn>
        </div>
      </div>
    </div>
  );
}
