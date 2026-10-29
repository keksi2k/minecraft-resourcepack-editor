import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { Source } from '../assets/AssetStore';
import { MOBS, type MobDef } from '../entities/catalog';
import type { ItemEntry } from '../models/items';
import { parseRL } from '../models/resourceLocation';
import { getResourcesBase, setResourcesBase } from '../mojang/soundAssets';
import { playSound } from '../sounds/player';
import { linkSounds, type SoundLink, type SoundLinks } from '../sounds/soundLinks';
import type { SoundEvent, SoundFileRef } from '../sounds/soundsJson';
import { t as translate, useT, type TFunction } from '../i18n';
import { useApp } from '../state/appStore';
import { AssetActions, Btn, pickFile, SourceBadge } from './common';
import { ItemThumb } from './ItemsView';
import { mobName, MobThumb } from './MobsView';

const PAGE = 300;
const CHIPS = 6;

type LinkFilter = 'all' | 'blocks' | 'mobs' | 'none';

let linkCache: { events: SoundEvent[]; items: ItemEntry[]; names: Record<string, string>; links: SoundLinks } | undefined;

/** Which blocks, items and mobs play each sound event (recomputed when events, items or names change). */
export function useSoundLinks(): SoundLinks {
  const { soundEvents: events, items, names } = useApp();
  if (linkCache?.events !== events || linkCache.items !== items || linkCache.names !== names) {
    const isEntity = (id: string) => {
      const { ns, path } = parseRL(id);
      return `entity.${ns}.${path}` in names;
    };
    const links = linkSounds(events, items.map((i) => i.id), MOBS.map((m) => `minecraft:${m.entity}`), isEntity);
    linkCache = { events, items, names, links };
  }
  return linkCache.links;
}

/** The mob shown for an entity: its first catalog entry (the adult in its default variant). */
const mobForEntity = (id: string): MobDef | undefined => MOBS.find((m) => `minecraft:${m.entity}` === id);

function linkName(link: SoundLink, items: ItemEntry[], names: Record<string, string>, t: TFunction): string {
  const { ns, path } = parseRL(link.id);
  if (link.kind === 'item') return items.find((i) => i.id === link.id)?.name ?? path;
  const mob = link.kind === 'mob' && mobForEntity(link.id);
  if (mob) return mobName(names, { ...mob, variant: undefined, babyOf: undefined }, t);
  return names[`${link.kind}.${ns}.${path}`] ?? path.replace(/_/g, ' ');
}

/** Small buttons for what plays a sound; items and mobs open in their tab. */
function SoundLinkChips({ links }: { links: SoundLink[] }) {
  const { store, items, names, setTab, select, selectMob } = useApp();
  const t = useT();
  const [all, setAll] = useState(false);
  if (!store || links.length === 0) return null;
  const shown = all ? links : links.slice(0, CHIPS);
  return (
    <div className="flex flex-wrap items-center gap-1 pb-1 pl-10">
      {shown.map((l) => {
        const name = linkName(l, items, names, t);
        const item = l.kind === 'item' ? items.find((i) => i.id === l.id) : undefined;
        const mob = l.kind === 'mob' ? mobForEntity(l.id) : undefined;
        const open = item
          ? () => {
              setTab('items');
              select(item.id);
            }
          : mob
            ? () => {
                setTab('mobs');
                selectMob(mob.id);
              }
            : undefined;
        const body = (
          <>
            {item && <ItemThumb store={store} item={item} className="h-4 w-4" />}
            {mob && <MobThumb store={store} mob={mob} className="h-4 w-4" />}
            <span className="max-w-[140px] truncate">{name}</span>
          </>
        );
        const cls = 'flex items-center gap-1 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px]';
        return open ? (
          <button key={l.id} onClick={open} title={t('sounds.linkOpen', { name })} className={`${cls} text-neutral-300 hover:bg-neutral-700`}>
            {body}
          </button>
        ) : (
          <span key={l.id} title={l.id} className={`${cls} text-neutral-400`}>
            {body}
          </span>
        );
      })}
      {links.length > CHIPS && (
        <button onClick={() => setAll(!all)} className="px-1 text-[10px] text-neutral-500 hover:text-neutral-300">
          {all ? t('sounds.linkLess') : t('sounds.linkMore', { count: links.length - CHIPS })}
        </button>
      )}
    </div>
  );
}

function useSoundFile(ref: SoundFileRef) {
  const { store, objects } = useApp();
  const source: Source | undefined = store?.source(ref.path) ?? (objects?.has(ref.key) ? 'vanilla' : undefined);
  const load = async () => store?.get(ref.path) ?? objects?.fetch(ref.key);
  return { source, load, vanillaAvailable: !!objects?.has(ref.key) };
}

async function play(load: () => Promise<Uint8Array | undefined>, volume?: number, pitch?: number) {
  try {
    const bytes = await load();
    if (bytes) await playSound(bytes, volume ?? 1, pitch ?? 1);
  } catch (e) {
    alert(translate('sounds.playFailed', { error: (e as Error).message }));
  }
}

function SoundFileRow({ file, eventId }: { file: SoundFileRef; eventId: string }) {
  const { source, load, vanillaAvailable } = useSoundFile(file);
  const { removeEventSound, setSoundAttributes, store, objects } = useApp();
  const t = useT();
  // Files added through "+ Add sound" exist only as edits; "Remove" deletes file and entry together.
  const addedHere = !!file.fromPack && !store?.pack.has(file.path) && !objects?.has(file.key);
  useApp((s) => s.revision); // re-render after edits
  return (
    <div className="flex items-center gap-2 py-0.5 pl-6">
      <Btn onClick={() => void play(load, file.volume, file.pitch)} disabled={!source} title={t('sounds.play')}>▶</Btn>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={file.path}>
        {file.name}
      </span>
      <AttributeInput label={t('sounds.volume')} title={t('sounds.volumeTitle')} value={file.volume} min={0} max={10} editable={!!file.fromPack} onCommit={(volume) => setSoundAttributes(eventId, file, { volume })} />
      <AttributeInput label={t('sounds.pitch')} title={t('sounds.pitchTitle')} value={file.pitch} min={0.5} max={2} editable={!!file.fromPack} onCommit={(pitch) => setSoundAttributes(eventId, file, { pitch })} />
      <SourceBadge source={source} />
      <AssetActions path={file.path} source={source} load={load} kind="sound" vanillaAvailable={vanillaAvailable} allowDiscard={!addedHere} />
      {file.fromPack && (
        <Btn tone="danger" onClick={() => removeEventSound(eventId, file)} title={t('sounds.removeTitle')}>
          {t('sounds.remove')}
        </Btn>
      )}
    </div>
  );
}

/** Number field for volume/pitch that commits on blur or Enter (not on every keystroke). */
function AttributeInput({ label, title, value, min, max, editable, onCommit }: {
  label: string;
  title: string;
  value: number | undefined;
  min: number;
  max: number;
  editable: boolean;
  onCommit: (v: number | undefined) => void;
}) {
  const [draft, setDraft] = useState(String(value ?? 1));
  useEffect(() => setDraft(String(value ?? 1)), [value]);
  const commit = () => {
    const n = Number(draft.replace(',', '.'));
    if (!Number.isFinite(n)) return setDraft(String(value ?? 1));
    const v = Math.round(Math.max(min, Math.min(max, n)) * 100) / 100;
    setDraft(String(v));
    if (v !== (value ?? 1)) onCommit(v === 1 ? undefined : v);
  };
  if (!editable && (value ?? 1) === 1) return <span className="w-[74px]" />;
  return (
    <label className="flex w-[74px] items-center gap-1 text-[10px] text-neutral-400" title={title}>
      {label}
      <input
        value={draft}
        disabled={!editable}
        inputMode="decimal"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="w-10 rounded bg-neutral-800 px-1 py-0.5 text-right text-[11px] text-neutral-100 disabled:bg-transparent disabled:text-neutral-400"
      />
    </label>
  );
}

export function SoundEventRow({ event, compact, links }: { event: SoundEvent; compact?: boolean; links?: SoundLink[] }) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>();
  const { store, objects, addEventSound, setEventReplace, adoptEvent } = useApp();
  const hasVanillaVariants = event.files.some((f) => !f.fromPack);
  const t = useT();
  const add = async () => {
    const file = await pickFile('audio/ogg,.ogg');
    if (!file) return;
    try {
      const warning = await addEventSound(event.id, file);
      setNotice(warning ? { text: warning } : { text: t('sounds.added', { name: file.name }) });
    } catch (e) {
      setNotice({ text: (e as Error).message, error: true });
    }
  };
  const playRandom = () => {
    const f = event.files[Math.floor(Math.random() * event.files.length)];
    if (f) void play(async () => store?.get(f.path) ?? objects?.fetch(f.key), f.volume, f.pitch);
  };
  return (
    <div className={compact ? '' : 'border-b border-neutral-800/60'}>
      <div className="flex items-center gap-2 py-1">
        <button onClick={() => setOpen(!open)} className="w-4 text-neutral-500">
          {open ? '▾' : '▸'}
        </button>
        <Btn onClick={playRandom} disabled={event.files.length === 0} title={t('sounds.playRandom')}>▶</Btn>
        <button onClick={() => setOpen(!open)} className="min-w-0 flex-1 truncate text-left font-mono text-xs">
          {event.id.replace(/^minecraft:/, '')}
        </button>
        {event.fromPack && <SourceBadge source="pack" />}
        <span className="text-[10px] text-neutral-500">{t('sounds.files', { count: event.files.length })}</span>
      </div>
      {links && <SoundLinkChips links={links} />}
      {open && (
        <div className="pb-2">
          {event.files.map((f, i) => (
            <SoundFileRow key={`${f.path}-${i}`} file={f} eventId={event.id} />
          ))}
          {event.files.length === 0 && <div className="pl-6 text-[11px] text-neutral-500">{t('sounds.noFiles')}</div>}
          <div className="flex flex-wrap items-center gap-3 pl-6 pt-1">
            <Btn tone="primary" onClick={() => void add()} title={t('sounds.addTitle')}>
              {t('sounds.add')}
            </Btn>
            <label className="flex items-center gap-1 text-[11px] text-neutral-300" title={t('sounds.replaceVanillaTitle')}>
              <input type="checkbox" checked={!!event.replaced} onChange={(e) => setEventReplace(event.id, e.target.checked)} />
              {t('sounds.replaceVanilla')}
            </label>
            {hasVanillaVariants && (
              <Btn onClick={() => adoptEvent(event.id)} title={t('sounds.adoptTitle')}>
                {t('sounds.adopt')}
              </Btn>
            )}
          </div>
          {notice && (
            <div className={`ml-6 mt-1 rounded px-2 py-1 text-[11px] ${notice.error ? 'bg-red-950 text-red-200' : 'bg-neutral-800 text-neutral-300'}`}>
              {notice.text}
            </div>
          )}
          {event.refs.map((r) => (
            <div key={r} className="pl-6 font-mono text-[11px] text-neutral-500">{t('sounds.eventRef', { id: r })}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SoundsView() {
  const { soundEvents, soundsError, soundsLoading, addLocalAssetsFolder, loadSounds, items, names } = useApp();
  const t = useT();
  const links = useSoundLinks();
  const [query, setQuery] = useState('');
  const [onlyPack, setOnlyPack] = useState(false);
  const [linkFilter, setLinkFilter] = useState<LinkFilter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [base, setBase] = useState(getResourcesBase());
  const q = useDeferredValue(query.trim().toLowerCase());

  // what an event can be found by: its id, its file names and the names of what plays it
  const searchText = useMemo(
    () =>
      new Map(
        soundEvents.map((e) => {
          const linked = (links.get(e.id) ?? []).map((l) => `${l.id} ${linkName(l, items, names, t)}`);
          return [e.id, [e.id, ...e.files.map((f) => f.name), ...linked].join('\n').toLowerCase()];
        }),
      ),
    [soundEvents, links, items, names, t],
  );
  const visible = useMemo(() => {
    const matchesLink = (e: SoundEvent) => {
      if (linkFilter === 'all') return true;
      const kinds = (links.get(e.id) ?? []).map((l) => l.kind);
      if (linkFilter === 'none') return kinds.length === 0;
      return kinds.some((k) => (linkFilter === 'mobs' ? k === 'mob' || k === 'entity' : k === 'item' || k === 'block'));
    };
    const found = soundEvents.filter((e) => (!onlyPack || e.fromPack) && matchesLink(e) && (!q || searchText.get(e.id)!.includes(q)));
    // events named after the search first, then those found through what plays them
    return q ? [...found.filter((e) => e.id.includes(q)), ...found.filter((e) => !e.id.includes(q))] : found;
  }, [soundEvents, q, onlyPack, linkFilter, links, searchText]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 p-2">
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLimit(PAGE);
          }}
          placeholder={t('sounds.search')}
          className="w-80 rounded bg-neutral-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <label className="flex items-center gap-1 text-xs">
          <input type="checkbox" checked={onlyPack} onChange={(e) => setOnlyPack(e.target.checked)} />
          {t('sounds.onlyPack')}
        </label>
        <label className="flex items-center gap-1 text-xs">
          {t('sounds.linkFilter')}
          <select
            value={linkFilter}
            onChange={(e) => {
              setLinkFilter(e.target.value as LinkFilter);
              setLimit(PAGE);
            }}
            className="rounded bg-neutral-800 px-1 py-0.5 text-xs"
          >
            <option value="all">{t('sounds.linkAll')}</option>
            <option value="blocks">{t('sounds.linkBlocks')}</option>
            <option value="mobs">{t('sounds.linkMobs')}</option>
            <option value="none">{t('sounds.linkNone')}</option>
          </select>
        </label>
        <span className="ml-auto text-xs text-neutral-500">{t('sounds.events', { count: visible.length })}</span>
      </div>
      {soundsError && (
        <div className="m-2 flex flex-col gap-2 rounded bg-amber-950 p-3 text-xs text-amber-100">
          <div>{t('sounds.unavailable', { error: soundsError })}</div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded bg-neutral-700 px-2 py-1 hover:bg-neutral-600">
              {t('sounds.pickFolder')}
              <input
                type="file"
                className="hidden"
                // @ts-expect-error non-standard but widely supported directory picker
                webkitdirectory=""
                onChange={(e) => {
                  if (!e.target.files) return;
                  const n = addLocalAssetsFolder(e.target.files);
                  alert(t('sounds.foundObjects', { count: n }));
                }}
              />
            </label>
            <span>{t('sounds.orProxy')}</span>
            <input value={base} onChange={(e) => setBase(e.target.value)} className="w-72 rounded bg-neutral-800 px-2 py-1" />
            <Btn
              onClick={() => {
                setResourcesBase(base);
                void loadSounds();
              }}
            >
              {t('sounds.apply')}
            </Btn>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto px-3">
        {visible.slice(0, limit).map((e) => (
          <SoundEventRow key={e.id} event={e} links={links.get(e.id)} />
        ))}
        {visible.length > limit && (
          <button onClick={() => setLimit(limit + PAGE)} className="my-3 w-full rounded bg-neutral-800 py-2 text-sm hover:bg-neutral-700">
            {t('sounds.showMore')}
          </button>
        )}
        {soundEvents.length === 0 && !soundsError && (
          <div className="p-4 text-sm text-neutral-500">{soundsLoading ? t('sounds.loadingIndex') : t('sounds.loading')}</div>
        )}
      </div>
    </div>
  );
}
