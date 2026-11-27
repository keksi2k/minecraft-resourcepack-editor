import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { parseLenientJson } from '../assets/AssetStore';
import { LOCALES, useLocale, useT, type MessageKey } from '../i18n';
import { newPackMeta } from '../pack/exportPack';
import { COLOR_CODES, componentToLegacy, FORMAT_CODES, parseFormatted, setLangEntry, splashLines } from '../texts/formatting';
import { useApp } from '../state/appStore';
import { Btn, SourceBadge } from './common';

type Section = 'description' | 'splashes' | 'lang';
const SPLASHES = 'assets/minecraft/texts/splashes.txt';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const langPath = (code: string) => `assets/minecraft/lang/${code}.json`;

/** Pack description, splash texts and language files (item and block names, menus …). */
export function TextsView() {
  const t = useT();
  const [section, setSection] = useState<Section>('description');
  return (
    <div className="flex h-full">
      <nav className="w-52 shrink-0 overflow-y-auto border-r border-neutral-800 p-2 text-sm">
        {(['description', 'splashes', 'lang'] as const).map((s) => (
          <button key={s} onClick={() => setSection(s)} className={`block w-full rounded px-2 py-1 text-left ${section === s ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}>
            {t(`texts.sections.${s}`)}
          </button>
        ))}
      </nav>
      <section className="min-w-0 flex-1 overflow-y-auto p-4">
        {section === 'description' && <DescriptionEditor />}
        {section === 'splashes' && <SplashEditor />}
        {section === 'lang' && <LangEditor />}
      </section>
    </div>
  );
}

/** Minecraft-style rendering of § text. */
export function Formatted({ text, className = '' }: { text: string; className?: string }) {
  return (
    <span className={`whitespace-pre-wrap font-mono ${className}`}>
      {parseFormatted(text).map((s, i) => (
        <span
          key={i}
          style={{
            color: s.color,
            fontWeight: s.bold ? 700 : undefined,
            fontStyle: s.italic ? 'italic' : undefined,
            textDecoration: [s.underlined && 'underline', s.strikethrough && 'line-through'].filter(Boolean).join(' ') || undefined,
            filter: s.obfuscated ? 'blur(2px)' : undefined,
          }}
        >
          {s.text}
        </span>
      ))}
    </span>
  );
}

/** Buttons that insert § colour and format codes at the cursor of a text field. */
export function CodeBar({ target, onInsert }: { target: React.RefObject<HTMLInputElement | HTMLTextAreaElement>; onInsert: (next: string) => void }) {
  const t = useT();
  const insert = (code: string) => {
    const el = target.current;
    if (!el) return;
    const at = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? at;
    // render the new text right away, so the cursor can go behind the code before the next key press
    flushSync(() => onInsert(el.value.slice(0, at) + code + el.value.slice(end)));
    el.focus();
    el.setSelectionRange(at + code.length, at + code.length);
  };
  return (
    // the buttons must not take the focus, so typing goes on in the text field
    <div className="flex flex-wrap items-center gap-0.5" onMouseDown={(e) => e.preventDefault()}>
      {Object.entries(COLOR_CODES).map(([code, c]) => (
        <button
          key={code}
          onClick={() => insert(`§${code}`)}
          title={`§${code} ${t(`texts.colors.${c.name}` as MessageKey)}`}
          className="h-5 w-5 rounded-sm ring-1 ring-neutral-700 hover:ring-white"
          style={{ background: c.hex }}
        />
      ))}
      <span className="mx-1 text-neutral-600">|</span>
      {Object.entries(FORMAT_CODES).map(([code, f]) => (
        <button key={code} onClick={() => insert(`§${code}`)} title={`§${code}`} className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] hover:bg-neutral-700">
          {t(`texts.formats.${f}`)}
        </button>
      ))}
      <button onClick={() => insert('§r')} title="§r" className="rounded bg-neutral-800 px-1.5 py-0.5 text-[11px] hover:bg-neutral-700">
        {t('texts.formats.reset')}
      </button>
    </div>
  );
}

function DescriptionEditor() {
  const t = useT();
  const { store, gameFormat, version, setFile, packIcon, packName } = useApp();
  useApp((s) => s.revision);
  const raw = useMemo(() => {
    const bytes = store?.get('pack.mcmeta');
    try {
      return bytes ? (parseLenientJson(decoder.decode(bytes)) as any) : undefined;
    } catch {
      return undefined;
    }
  }, [store, store?.rev('pack.mcmeta')]);
  const current = componentToLegacy(raw?.pack?.description ?? '');
  const [draft, setDraft] = useState(current);
  useEffect(() => setDraft(current), [current]);
  const field = useRef<HTMLTextAreaElement>(null);
  const format = raw?.pack?.pack_format;

  const save = (description: string, packFormat?: number) => {
    if (!raw?.pack) {
      setFile('pack.mcmeta', newPackMeta(packFormat ?? gameFormat ?? 46, description));
      return;
    }
    const pack = { ...raw.pack, description };
    if (packFormat !== undefined) {
      // like a new pack: pack_format for older games, min/max_format for 1.21.9+
      Object.assign(pack, { pack_format: packFormat, min_format: packFormat, max_format: packFormat });
      delete pack.supported_formats;
    }
    setFile('pack.mcmeta', encoder.encode(JSON.stringify({ ...raw, pack }, null, 2)));
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4 text-sm">
      <div>
        <h2 className="text-base font-semibold">{t('texts.description.title')}</h2>
        <p className="text-xs text-neutral-400">{t('texts.description.hint')}</p>
      </div>
      <CodeBar target={field} onInsert={setDraft} />
      <textarea
        ref={field}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        spellCheck={false}
        className="w-full rounded bg-neutral-800 p-2 font-mono text-sm outline-none focus:ring-1 focus:ring-emerald-500"
      />
      <div>
        <div className="mb-1 text-xs text-neutral-400">{t('texts.preview')}</div>
        <div className="flex items-start gap-3 rounded bg-[#1e1e1e] p-3 ring-1 ring-neutral-800">
          {packIcon ? <img src={packIcon} className="pixelated h-16 w-16" alt="" /> : <div className="h-16 w-16 bg-neutral-700" />}
          <div className="min-w-0 text-[15px] leading-tight">
            <div className="text-white">{packName}</div>
            <Formatted text={draft} className="text-[#aaaaaa]" />
          </div>
        </div>
        {draft.split('\n').length > 2 && <p className="mt-1 text-xs text-amber-400">{t('texts.description.tooManyLines')}</p>}
      </div>
      <div className="flex gap-2">
        <Btn tone="primary" onClick={() => save(draft)} disabled={draft === current && !!raw}>{t('texts.save')}</Btn>
        <Btn onClick={() => setDraft(current)} disabled={draft === current}>{t('texts.revert')}</Btn>
      </div>
      <div className="flex flex-col gap-2 border-t border-neutral-800 pt-4">
        <h3 className="font-semibold">{t('texts.description.formatTitle')}</h3>
        <p className="text-xs text-neutral-400">
          {format !== undefined ? t('texts.description.formatNow', { format }) : t('texts.description.formatNone')}
        </p>
        {gameFormat !== undefined && format !== gameFormat && (
          <div>
            <Btn onClick={() => save(current, gameFormat)}>{t('texts.description.formatSet', { version: version?.id ?? '', format: gameFormat })}</Btn>
          </div>
        )}
      </div>
    </div>
  );
}

function SplashEditor() {
  const t = useT();
  const { store, setFile, resetFile } = useApp();
  useApp((s) => s.revision);
  const bytes = store?.get(SPLASHES);
  const current = bytes ? decoder.decode(bytes) : '';
  const [draft, setDraft] = useState(current);
  useEffect(() => setDraft(current), [current]);
  const field = useRef<HTMLTextAreaElement>(null);
  const lines = splashLines(draft);
  const [pick, setPick] = useState(0);
  const sample = lines.length ? lines[pick % lines.length] : '';
  const source = store?.source(SPLASHES);

  return (
    <div className="flex max-w-3xl flex-col gap-3 text-sm">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          {t('texts.splashes.title')} <SourceBadge source={source} />
        </h2>
        <p className="text-xs text-neutral-400">{t('texts.splashes.hint')}</p>
        {!store?.vanilla.has(SPLASHES) && <p className="text-xs text-amber-400">{t('texts.splashes.noVanilla')}</p>}
      </div>
      <div className="flex h-24 items-center justify-center overflow-hidden rounded bg-gradient-to-b from-sky-900 to-neutral-900 ring-1 ring-neutral-800">
        <span className="-rotate-12 text-lg font-bold drop-shadow-[2px_2px_0_#3f3f00]" style={{ color: '#ffff55' }}>
          <Formatted text={sample} />
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-neutral-400">
        <span>{t('texts.splashes.count', { count: lines.length })}</span>
        <Btn onClick={() => setPick(Math.floor(Math.random() * 1e9))} disabled={!lines.length}>{t('texts.splashes.random')}</Btn>
      </div>
      <CodeBar target={field} onInsert={setDraft} />
      <textarea
        ref={field}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={18}
        spellCheck={false}
        className="w-full rounded bg-neutral-800 p-2 font-mono text-xs outline-none focus:ring-1 focus:ring-emerald-500"
      />
      <div className="flex gap-2">
        <Btn tone="primary" onClick={() => setFile(SPLASHES, encoder.encode(draft))} disabled={draft === current}>{t('texts.save')}</Btn>
        <Btn onClick={() => setDraft(current)} disabled={draft === current}>{t('texts.revert')}</Btn>
        {store?.edits.has(SPLASHES) && <Btn onClick={() => resetFile(SPLASHES)}>{t('actions.discard')}</Btn>}
        {store?.pack.has(SPLASHES) && store.edits.get(SPLASHES) !== null && (
          <Btn tone="danger" onClick={() => setFile(SPLASHES, null)}>{t('actions.vanilla')}</Btn>
        )}
      </div>
    </div>
  );
}

const PAGE = 200;

function LangEditor() {
  const t = useT();
  const { store, objects, setFile, resetFile } = useApp();
  const revision = useApp((s) => s.revision);
  const uiLang = LOCALES[useLocale((s) => s.locale)].minecraftLang;
  const packLangs = useMemo(
    () => (store ? store.list('assets/minecraft/lang/').map((p) => /lang\/([^/]+)\.json$/.exec(p)?.[1]).filter((c): c is string => !!c) : []),
    [store, store?.changes],
  );
  const codes = [...new Set(['en_us', uiLang, ...packLangs])].sort();
  const [code, setCode] = useState(uiLang);
  const [other, setOther] = useState('');
  const [query, setQuery] = useState('');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const q = useDeferredValue(query.trim().toLowerCase());

  // reference texts: English from the jar, the chosen language from the asset index
  const english = useMemo(() => store?.vanilla && parseVanilla(store.vanilla.get(langPath('en_us'))), [store]);
  const [vanilla, setVanilla] = useState<Record<string, string>>();
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (code === 'en_us') return setVanilla(english);
    let alive = true;
    setLoading(true);
    setVanilla(undefined);
    void (objects?.langJson(code) ?? Promise.reject(new Error('no index')))
      .then((v) => alive && setVanilla(v as Record<string, string>))
      .catch(() => alive && setVanilla(undefined))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [code, objects, english]);

  const path = langPath(code);
  const own = useMemo(
    () => (store?.pack.has(path) || store?.edits.has(path) ? store.json<Record<string, string>>(path) : undefined) ?? {},
    [store, path, revision],
  );
  const keys = useMemo(() => [...new Set([...Object.keys(english ?? {}), ...Object.keys(vanilla ?? {}), ...Object.keys(own)])].sort(), [english, vanilla, own]);
  const rows = useMemo(
    () =>
      keys.filter((k) => {
        if (onlyChanged && !(k in own)) return false;
        if (!q) return true;
        return k.toLowerCase().includes(q) || english?.[k]?.toLowerCase().includes(q) || vanilla?.[k]?.toLowerCase().includes(q) || own[k]?.toLowerCase().includes(q);
      }),
    [keys, q, onlyChanged, own, english, vanilla],
  );
  useEffect(() => setLimit(PAGE), [q, onlyChanged, code]);

  const set = (key: string, value: string | undefined) => {
    const next = setLangEntry(own, key, value);
    if (Object.keys(next).length || store?.pack.has(path)) setFile(path, encoder.encode(JSON.stringify(next, null, 2)));
    // nothing left that the pack would bring: no file at all, not even an empty edit
    else resetFile(path);
  };

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div>
        <h2 className="text-base font-semibold">{t('texts.lang.title')}</h2>
        <p className="text-xs text-neutral-400">{t('texts.lang.hint')}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <select value={code} onChange={(e) => setCode(e.target.value)} className="rounded bg-neutral-800 px-2 py-1">
          {codes.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={other}
          onChange={(e) => setOther(e.target.value.toLowerCase())}
          onKeyDown={(e) => e.key === 'Enter' && /^[a-z]{2,3}_[a-z]{2,3}$/.test(other) && (setCode(other), setOther(''))}
          placeholder={t('texts.lang.otherPlaceholder')}
          className="w-36 rounded bg-neutral-800 px-2 py-1"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('texts.lang.search')}
          className="w-72 rounded bg-neutral-800 px-2 py-1 outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} />
          {t('texts.lang.onlyChanged', { count: Object.keys(own).length })}
        </label>
        <span className="ml-auto text-neutral-500">{t('texts.lang.count', { count: rows.length })}</span>
      </div>
      {loading && <p className="text-xs text-neutral-500">{t('texts.lang.loading')}</p>}
      {!loading && code !== 'en_us' && !vanilla && <p className="text-xs text-amber-400">{t('texts.lang.noVanilla', { code })}</p>}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)] gap-x-3 gap-y-1 text-xs">
        <div className="font-semibold text-neutral-400">{t('texts.lang.key')}</div>
        <div className="font-semibold text-neutral-400">{t('texts.lang.vanilla')}</div>
        <div className="font-semibold text-neutral-400">{t('texts.lang.yours')}</div>
        {rows.slice(0, limit).map((k) => (
          <LangRow key={`${code}:${k}`} k={k} reference={vanilla?.[k] ?? english?.[k] ?? ''} value={own[k]} onCommit={(v) => set(k, v)} />
        ))}
      </div>
      {rows.length > limit && (
        <button onClick={() => setLimit(limit + PAGE)} className="w-full rounded bg-neutral-800 py-2 text-sm hover:bg-neutral-700">
          {t('textures.showMore', { count: Math.min(PAGE, rows.length - limit) })}
        </button>
      )}
    </div>
  );
}

function parseVanilla(bytes: Uint8Array | undefined): Record<string, string> | undefined {
  try {
    return bytes ? (parseLenientJson(decoder.decode(bytes)) as Record<string, string>) : undefined;
  } catch {
    return undefined;
  }
}

function LangRow({ k, reference, value, onCommit }: { k: string; reference: string; value: string | undefined; onCommit: (v: string | undefined) => void }) {
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  const commit = () => draft !== (value ?? '') && onCommit(draft || undefined);
  return (
    <>
      <div className="truncate py-1 font-mono text-[11px] text-neutral-400" title={k}>
        {k}
      </div>
      <div className="truncate py-1" title={reference}>
        <Formatted text={reference} className="font-sans" />
      </div>
      <input
        value={draft}
        placeholder={reference}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className={`rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-emerald-500 ${value !== undefined ? 'bg-amber-950/60 ring-1 ring-amber-700' : 'bg-neutral-800'}`}
      />
    </>
  );
}
