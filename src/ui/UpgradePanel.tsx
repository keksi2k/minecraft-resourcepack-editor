import { useEffect, useState } from 'react';
import { useT, type MessageKey } from '../i18n';
import { loadUpgradeData } from '../pack/upgrade/data';
import { GROUPS, planUpgrade, type GroupId, type UpgradeEntry, type UpgradePlan } from '../pack/upgrade/upgrade';
import { decodeImage, encodePng } from '../render/png';
import { useApp } from '../state/appStore';
import { Btn } from './common';

const codec = { decode: decodeImage, encode: encodePng };
const SHOWN = 150;
const short = (p: string) => p.replace(/^assets\/minecraft\//, '');

/** Brings a pack made for an older Minecraft version up to the loaded one, in one undoable step. */
export function UpgradePanel({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { store, gameFormat, version, revision, applyBatch, focusTexture } = useApp();
  const [enabled, setEnabled] = useState<Set<GroupId>>(new Set(GROUPS));
  const [plan, setPlan] = useState<UpgradePlan>();
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<GroupId | 'redraw'>();
  const [done, setDone] = useState<number>();

  useEffect(() => {
    if (!store || gameFormat === undefined || done !== undefined) return;
    let live = true;
    setPlan(undefined);
    loadUpgradeData()
      .then((data) => planUpgrade(store, gameFormat, data, codec, enabled))
      .then((p) => live && setPlan(p))
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [store, gameFormat, enabled, revision, done]);

  const toggle = (g: GroupId) => {
    const next = new Set(enabled);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    setEnabled(next);
  };
  const apply = () => {
    if (!plan?.changes.size) return;
    applyBatch(plan.changes);
    setDone(plan.changes.size);
  };
  const show = (path: string) => {
    if (!/\.png$/.test(path)) return;
    focusTexture(path);
    onClose();
  };

  const entry = (e: UpgradeEntry, i: number) => (
    <li key={i} className="flex flex-wrap items-baseline gap-x-2 rounded bg-neutral-950 px-2 py-1 font-mono text-[11px]">
      <span className="break-all text-neutral-400">{short(e.from)}</span>
      {e.to?.length ? (
        <>
          <span className="text-neutral-600">→</span>
          <span className="break-all text-emerald-300">{e.to.length === 1 ? short(e.to[0]) : t('upgrade.sprites', { count: e.to.length })}</span>
        </>
      ) : null}
      {e.note && <span className="ml-auto font-sans text-neutral-500">{e.note}</span>}
    </li>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded bg-neutral-900 text-sm shadow-2xl ring-1 ring-neutral-700">
        <div className="border-b border-neutral-800 p-4">
          <h2 className="text-base font-semibold">{t('upgrade.title')}</h2>
          <p className="mt-1 text-xs text-neutral-400">
            {t('upgrade.intro', { from: plan?.packFormat ?? '?', to: gameFormat ?? '?', version: version?.id ?? '' })}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {error && <p className="mb-3 rounded bg-red-950 p-2 text-xs text-red-200">{error}</p>}
          {done !== undefined ? (
            <p className="text-emerald-300">{t('upgrade.done', { count: done })}</p>
          ) : !plan ? (
            <p className="animate-pulse text-neutral-400">{t('upgrade.working')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {GROUPS.map((g) => {
                const list = plan.groups[g];
                const on = enabled.has(g);
                return (
                  <div key={g} className="rounded border border-neutral-800 p-2">
                    <div className="flex items-start gap-2">
                      <input type="checkbox" className="mt-0.5" checked={on} onChange={() => toggle(g)} />
                      <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === g ? undefined : g)} disabled={!list.length}>
                        <div className={on && list.length ? '' : 'text-neutral-500'}>
                          {t(`upgrade.groups.${g}.title` as MessageKey)}{' '}
                          <span className="text-xs text-neutral-500">
                            {on ? t('upgrade.count', { count: list.length }) : t('upgrade.off')} {list.length > 0 && (open === g ? '▾' : '▸')}
                          </span>
                        </div>
                        <div className="text-xs text-neutral-500">{t(`upgrade.groups.${g}.hint` as MessageKey)}</div>
                      </button>
                    </div>
                    {open === g && (
                      <ul className="mt-2 flex flex-col gap-1">
                        {list.slice(0, SHOWN).map(entry)}
                        {list.length > SHOWN && <li className="text-xs text-neutral-500">{t('upgrade.more', { count: list.length - SHOWN })}</li>}
                      </ul>
                    )}
                  </div>
                );
              })}
              {plan.redraw.length > 0 && (
                <div className="rounded border border-amber-900/60 p-2">
                  <button className="w-full text-left" onClick={() => setOpen(open === 'redraw' ? undefined : 'redraw')}>
                    <div className="text-amber-300">
                      ⚠ {t('upgrade.redraw.title', { count: plan.redraw.length })} {open === 'redraw' ? '▾' : '▸'}
                    </div>
                    <div className="text-xs text-neutral-500">{t('upgrade.redraw.hint')}</div>
                  </button>
                  {open === 'redraw' && (
                    <ul className="mt-2 flex flex-col gap-1">
                      {plan.redraw.map((r) => (
                        <li key={r.path} className="flex items-baseline gap-2 rounded bg-neutral-950 px-2 py-1 font-mono text-[11px]">
                          <button className="break-all text-left text-neutral-300 hover:text-emerald-300" onClick={() => show(r.path)} title={t('check.show')}>
                            {short(r.path)}
                          </button>
                          <span className="ml-auto font-sans text-neutral-500">{t('upgrade.redraw.since', { version: r.version })}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {!plan.changes.size && <p className="text-xs text-neutral-400">{t('upgrade.nothing')}</p>}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-neutral-800 p-3">
          <span className="mr-auto text-[11px] text-neutral-500">{t('upgrade.undoHint')}</span>
          <Btn onClick={onClose}>{done !== undefined ? t('upgrade.close') : t('editor.cancel')}</Btn>
          {done === undefined && (
            <Btn tone="primary" onClick={apply} disabled={!plan?.changes.size}>
              {t('upgrade.apply', { count: plan?.changes.size ?? 0 })}
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}
