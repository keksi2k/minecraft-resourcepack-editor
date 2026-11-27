import { useEffect, useMemo, useRef, useState } from 'react';
import { MOBS } from '../entities/catalog';
import { LOCALES, useLocale, useT, type Locale, type MessageKey } from '../i18n';
import { useApp, type Tab } from '../state/appStore';
import { useEditor } from '../state/editorStore';
import { mobName } from './MobsView';

/** Commands the header carries out (export, check), asked for from elsewhere. */
export const COMMAND_EVENT = 'rpe:command';
export type HeaderCommand = 'export' | 'check';
export const runHeaderCommand = (c: HeaderCommand) => window.dispatchEvent(new CustomEvent(COMMAND_EVENT, { detail: c }));

const TABS: Tab[] = ['items', 'plants', 'mobs', 'textures', 'sounds', 'scenes', 'texts', 'progress', 'funny'];

interface Entry {
  key: string;
  label: string;
  /** Second line: id, path … */
  detail?: string;
  group: 'actions' | 'tabs' | 'items' | 'plants' | 'mobs' | 'textures' | 'sounds';
  run: () => void;
}

/** How well `text` matches the query words: every word must occur; earlier and whole-word matches rank higher. */
export function matchScore(text: string, words: string[]): number {
  const s = text.toLowerCase();
  let score = 0;
  for (const w of words) {
    const i = s.indexOf(w);
    if (i < 0) return -1;
    score += i === 0 ? 30 : /[\s:/_.(-]/.test(s[i - 1]) ? 20 : 10 - Math.min(9, i / 10);
  }
  return score - s.length / 100;
}

const PER_GROUP = 8;

/** Ctrl+K: find any item, plant, mob, texture, sound or action by typing. */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const t = useT();
  const app = useApp();
  const { store, items, plants, names, soundEvents, undoCount, redoCount } = app;
  const setLocale = useLocale((s) => s.setLocale);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const all = useMemo<Entry[]>(() => {
    const go = (tab: Tab, then?: () => void) => () => {
      useApp.getState().setTab(tab);
      if (useApp.getState().tab === tab) then?.();
    };
    const actions: Entry[] = [
      { key: 'a:export', label: t('palette.export'), group: 'actions', run: () => runHeaderCommand('export') },
      { key: 'a:check', label: t('palette.check'), group: 'actions', run: () => runHeaderCommand('check') },
      ...(undoCount ? [{ key: 'a:undo', label: t('palette.undo'), detail: 'Ctrl+Z', group: 'actions' as const, run: () => useApp.getState().undo() }] : []),
      ...(redoCount ? [{ key: 'a:redo', label: t('palette.redo'), detail: 'Ctrl+Y', group: 'actions' as const, run: () => useApp.getState().redo() }] : []),
      ...(Object.keys(LOCALES) as Locale[]).map((l) => ({ key: `a:lang:${l}`, label: `${t('app.language')}: ${LOCALES[l].name}`, group: 'actions' as const, run: () => setLocale(l) })),
    ];
    const tabs: Entry[] = TABS.map((tab) => ({ key: `t:${tab}`, label: t(`header.tabs.${tab}` as MessageKey), detail: t('palette.tab'), group: 'tabs', run: go(tab) }));
    const itemEntries: Entry[] = items.map((i) => ({ key: `i:${i.id}`, label: i.name, detail: i.id, group: 'items', run: go('items', () => useApp.getState().select(i.id)) }));
    const plantEntries: Entry[] = plants.map((p) => ({ key: `p:${p.id}`, label: p.name, detail: p.id, group: 'plants', run: go('plants', () => useApp.getState().selectPlant(p.id)) }));
    const mobEntries: Entry[] = MOBS.map((m) => ({ key: `m:${m.id}`, label: mobName(names, m, t), detail: m.id, group: 'mobs', run: go('mobs', () => useApp.getState().selectMob(m.id)) }));
    const textures: Entry[] = (store?.list('assets/') ?? [])
      .filter((p) => /\/textures\/.+\.png$/.test(p))
      .map((p) => {
        const id = p.replace(/^assets\/([^/]+)\/textures\/(.+)\.png$/, '$1:$2');
        return { key: `x:${p}`, label: id, detail: t('palette.texture'), group: 'textures' as const, run: () => useApp.getState().focusTexture(p) };
      });
    const sounds: Entry[] = soundEvents.map((e) => ({ key: `s:${e.id}`, label: e.id, detail: t('palette.sound'), group: 'sounds', run: () => useApp.getState().focusSound(e.id) }));
    return [...actions, ...tabs, ...itemEntries, ...plantEntries, ...mobEntries, ...textures, ...sounds];
  }, [t, store, items, plants, names, soundEvents, undoCount, redoCount, setLocale]);

  const results = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return all.filter((e) => e.group === 'actions' || e.group === 'tabs');
    const scored = all.map((e) => ({ e, s: Math.max(matchScore(e.label, words), e.detail ? matchScore(e.detail, words) - 5 : -1) })).filter((x) => x.s >= 0);
    // best first within each group, a few per group, groups in their fixed order
    const out: Entry[] = [];
    for (const group of ['actions', 'tabs', 'items', 'plants', 'mobs', 'textures', 'sounds'] as const) {
      out.push(
        ...scored
          .filter((x) => x.e.group === group)
          .sort((a, b) => b.s - a.s)
          .slice(0, PER_GROUP)
          .map((x) => x.e),
      );
    }
    return out;
  }, [all, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (e: Entry | undefined) => {
    if (!e) return;
    // switching tabs asks first if an editor has unsaved changes
    onClose();
    e.run();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[12vh]" onMouseDown={onClose}>
      <div className="flex max-h-[70vh] w-[640px] max-w-[92vw] flex-col overflow-hidden rounded-lg bg-neutral-900 shadow-2xl ring-1 ring-neutral-700" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              run(results[active]);
            } else if (e.key === 'Escape') onClose();
          }}
          placeholder={t('palette.placeholder')}
          className="border-b border-neutral-800 bg-transparent px-4 py-3 text-sm outline-none"
        />
        <div ref={list} className="min-h-0 flex-1 overflow-y-auto py-1">
          {results.map((e, i) => (
            <div key={e.key}>
              {(i === 0 || results[i - 1].group !== e.group) && <div className="px-4 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{t(`palette.groups.${e.group}`)}</div>}
              <button
                data-i={i}
                onMouseMove={() => setActive(i)}
                onClick={() => run(e)}
                className={`flex w-full items-baseline gap-3 px-4 py-1.5 text-left text-sm ${i === active ? 'bg-emerald-800/60' : ''}`}
              >
                <span className="truncate">{e.label}</span>
                {e.detail && <span className="ml-auto shrink-0 truncate font-mono text-[11px] text-neutral-500">{e.detail}</span>}
              </button>
            </div>
          ))}
          {results.length === 0 && <div className="px-4 py-6 text-center text-sm text-neutral-500">{t('palette.nothing')}</div>}
        </div>
        <div className="border-t border-neutral-800 px-4 py-1.5 text-[11px] text-neutral-500">{t('palette.keys')}</div>
      </div>
    </div>
  );
}

/** Whether a key press is meant for a text field (so global shortcuts leave it alone). */
const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

/** Ctrl+K opens the palette; Ctrl+Z / Ctrl+Y undo and redo file changes when no editor is open. */
export function useGlobalShortcuts(openPalette: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === 'k') {
        e.preventDefault();
        openPalette();
        return;
      }
      // editors have their own undo; text fields keep theirs
      if (useEditor.getState().target || typing(e)) return;
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        useApp.getState().undo();
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        useApp.getState().redo();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [openPalette]);
}
