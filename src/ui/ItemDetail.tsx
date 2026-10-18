import { useEffect, useMemo, useState } from 'react';
import type { AssetStore } from '../assets/AssetStore';
import { availablePatterns, availableSherds, DYE, PATTERNED, POT_SIDES, specialLayers, type SpecialOptions } from '../entities/specials';
import type { ItemEntry } from '../models/items';
import type { DisplayContext } from '../models/modelResolver';
import { modelPath, texturePath } from '../models/resourceLocation';
import { downloadBlob } from '../pack/exportPack';
import { itemThumbnail } from '../render/thumbnails';
import { soundsForItem } from '../sounds/soundsJson';
import { useT } from '../i18n';
import { useApp } from '../state/appStore';
import { AssetActions, Btn, SourceBadge } from './common';
import { ItemThumb } from './ItemsView';
import { CONTEXTS, ItemViewer } from './ItemViewer';
import { SoundEventRow } from './SoundsView';
import { TextureThumb } from './TexturesView';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-neutral-800 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</h3>
      {children}
    </section>
  );
}

export function ItemDetail({ store, item }: { store: AssetStore; item: ItemEntry }) {
  const { soundEvents, select } = useApp();
  const t = useT();
  const [context, setContext] = useState<DisplayContext>('gui');
  const sounds = useMemo(() => soundsForItem(soundEvents, item.id), [soundEvents, item.id]);
  const patterned = item.models.find((m) => m.ref.special && PATTERNED.has(m.ref.special.type))?.ref.special;
  const [options, setOptions] = useState<SpecialOptions>({});
  useEffect(() => setOptions({}), [item.id]);
  const opts = patterned ? options : undefined;
  // pattern textures in use belong to the item's textures while previewed
  const textures = useMemo(() => {
    if (!patterned) return item.textures;
    const extra = specialLayers(patterned, options)?.map((l) => l.texture) ?? [];
    return [...new Set([...item.textures, ...extra])];
  }, [item.textures, patterned, options]);

  const downloadRender = async () => {
    const url = await itemThumbnail(store, item, 512, opts);
    if (url) downloadBlob(await (await fetch(url)).blob(), `${item.id.split(':')[1]}.png`);
  };

  return (
    <div>
      <div className="flex items-start gap-3 p-3">
        <ItemThumb store={store} item={item} className="checker h-16 w-16 shrink-0 rounded p-1" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{item.name}</h2>
            <SourceBadge source={item.source} />
          </div>
          <div className="truncate font-mono text-xs text-neutral-400">{item.id}</div>
        </div>
        <button onClick={() => select(undefined)} className="text-neutral-500 hover:text-neutral-200" title={t('actions.close')}>
          ✕
        </button>
      </div>

      <div className="px-3">
        <div className="h-72">
          <ItemViewer store={store} item={item} context={context} options={opts} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {CONTEXTS.map((id) => (
            <button
              key={id}
              onClick={() => setContext(id)}
              className={`rounded px-2 py-0.5 text-[11px] ${context === id ? 'bg-emerald-700' : 'bg-neutral-800 hover:bg-neutral-700'}`}
            >
              {t(`items.contexts.${id}`)}
            </button>
          ))}
          <span className="ml-auto">
            <Btn onClick={() => void downloadRender()} title={t('items.renderTitle')}>
              {t('actions.render')}
            </Btn>
          </span>
        </div>
      </div>

      {patterned?.type === 'decorated_pot' ? (
        <Section title={t('items.sherds')}>
          <SherdEditor store={store} value={options} onChange={setOptions} />
        </Section>
      ) : patterned ? (
        <Section title={t('items.patterns')}>
          <PatternEditor store={store} kind={patterned.type as 'banner' | 'shield'} value={options} onChange={setOptions} />
        </Section>
      ) : null}

      <Section title={t('items.textures', { count: textures.length })}>
        <div className="flex flex-col gap-2">
          {textures.map((t) => {
            const path = texturePath(t);
            return (
              <div key={t} className="flex items-center gap-2">
                <TextureThumb store={store} path={path} className="checker h-10 w-10 shrink-0 rounded" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-mono text-xs">{t}</span>
                    <SourceBadge source={store.source(path)} />
                  </div>
                  <div className="mt-1">
                    <AssetActions
                      path={path}
                      source={store.source(path)}
                      load={async () => store.get(path)}
                      kind="texture"
                      vanillaAvailable={store.vanilla.has(path)}
                    />
                  </div>
                </div>
              </div>
            );
          })}
          {textures.length === 0 && <div className="text-xs text-neutral-500">{t('items.noTextures')}</div>}
        </div>
      </Section>

      <Section title={t('items.models')}>
        <div className="flex flex-col gap-3">
          <FileRow store={store} path={item.defPath} label={t('items.itemDefinition')} />
          {item.models.map(({ ref, model }, i) => (
            <div key={i} className="rounded bg-neutral-900 p-2">
              <div className="mb-1 text-xs">
                {ref.special && specialLayers(ref.special) ? t('items.kind.special') : t(`items.kind.${model.kind}`)}
                {ref.special && <span className="text-neutral-400"> ({ref.special.type})</span>}
              </div>
              {model.chain.map((m) => (
                <FileRow key={m} store={store} path={modelPath(m)} label={m} />
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title={t('items.relatedSounds')}>
        {sounds.length === 0 ? (
          <div className="text-xs text-neutral-500">{t('items.noRelatedSounds', { name: item.id.split(':')[1] })}</div>
        ) : (
          <div className="flex flex-col gap-1">
            {sounds.map((e) => (
              <SoundEventRow key={e.id} event={e} compact />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

const COLORS = Object.keys(DYE);
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

function ColorSelect({ value, onChange, none }: { value: string | undefined; onChange: (c: string | undefined) => void; none?: string }) {
  const names = useApp((s) => s.names);
  return (
    <span className="flex items-center gap-1">
      <span className="inline-block h-3 w-3 rounded-sm ring-1 ring-neutral-600" style={{ background: value ? hex(DYE[value]) : 'transparent' }} />
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value || undefined)} className="rounded bg-neutral-800 px-1 py-0.5 text-xs">
        {none && <option value="">{none}</option>}
        {COLORS.map((c) => (
          <option key={c} value={c}>
            {names[`color.minecraft.${c}`] ?? c.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
    </span>
  );
}

/** Preview-only pattern layers for banners and shields (in game they come from item components). */
function PatternEditor({ store, kind, value, onChange }: {
  store: AssetStore;
  kind: 'banner' | 'shield';
  value: SpecialOptions;
  onChange: (o: SpecialOptions) => void;
}) {
  const t = useT();
  const names = useApp((s) => s.names);
  const all = useMemo(() => availablePatterns(store.list(`assets/minecraft/textures/entity/${kind}/`), kind), [store, kind]);
  const layers = value.patterns ?? [];
  const setLayers = (patterns: NonNullable<SpecialOptions['patterns']>) => onChange({ ...value, patterns });
  const update = (i: number, change: Partial<(typeof layers)[number]>) => setLayers(layers.map((x, j) => (j === i ? { ...x, ...change } : x)));
  const move = (i: number, d: number) => {
    const next = [...layers];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setLayers(next);
  };
  const small = 'rounded bg-neutral-800 px-1.5 hover:bg-neutral-700 disabled:opacity-30';

  return (
    <div className="flex flex-col gap-2 text-xs">
      <p className="text-neutral-400">{t('items.patternsInfo')}</p>
      {kind === 'shield' && (
        <label className="flex items-center gap-2">
          <span className="text-neutral-400">{t('items.baseColor')}</span>
          <ColorSelect value={value.baseColor} onChange={(baseColor) => onChange({ ...value, baseColor })} none={t('items.noBaseColor')} />
        </label>
      )}
      {layers.map((l, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5" title={names[`block.minecraft.banner.${l.pattern}.${l.color}`]}>
          <span className="w-4 text-right text-neutral-500">{i + 1}</span>
          <select value={l.pattern} onChange={(e) => update(i, { pattern: e.target.value })} className="max-w-40 rounded bg-neutral-800 px-1 py-0.5">
            {all.map((p) => (
              <option key={p} value={p}>
                {p.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
          <ColorSelect value={l.color} onChange={(color) => update(i, { color: color ?? 'white' })} />
          <button className={small} disabled={i === 0} onClick={() => move(i, -1)} title={t('items.moveUp')}>
            ↑
          </button>
          <button className={small} disabled={i === layers.length - 1} onClick={() => move(i, 1)} title={t('items.moveDown')}>
            ↓
          </button>
          <button className={small} onClick={() => setLayers(layers.filter((_, j) => j !== i))} title={t('items.removePattern')}>
            ✕
          </button>
        </div>
      ))}
      <div>
        <Btn
          onClick={() => setLayers([...layers, { pattern: all.includes('creeper') ? 'creeper' : all[0], color: 'black' }])}
          disabled={all.length === 0 || layers.length >= 16}
        >
          {t('items.addPattern')}
        </Btn>
      </div>
    </div>
  );
}

/** Preview-only pottery sherds per side of a decorated pot. */
function SherdEditor({ store, value, onChange }: { store: AssetStore; value: SpecialOptions; onChange: (o: SpecialOptions) => void }) {
  const t = useT();
  const names = useApp((s) => s.names);
  const all = useMemo(() => availableSherds(store.list('assets/minecraft/textures/entity/decorated_pot/')), [store]);
  const label = (p: string) => names[`item.minecraft.${p.replace(/_pattern$/, '_sherd')}`] ?? p.replace(/_/g, ' ');
  return (
    <div className="flex flex-col gap-2 text-xs">
      <p className="text-neutral-400">{t('items.sherdsInfo')}</p>
      {POT_SIDES.map((side) => (
        <label key={side} className="flex items-center gap-2">
          <span className="w-14 text-neutral-400">{t(`items.side.${side}`)}</span>
          <select
            value={value.sherds?.[side] ?? ''}
            onChange={(e) => onChange({ ...value, sherds: { ...value.sherds, [side]: e.target.value || undefined } })}
            className="max-w-56 rounded bg-neutral-800 px-1 py-0.5"
          >
            <option value="">{t('items.plainSide')}</option>
            {all.map((p) => (
              <option key={p} value={p}>
                {label(p)}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

function FileRow({ store, path, label }: { store: AssetStore; path: string; label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-neutral-300" title={path}>
        {label}
      </span>
      <SourceBadge source={store.source(path)} />
      <AssetActions
        path={path}
        source={store.source(path)}
        load={async () => store.get(path)}
        kind="file"
        vanillaAvailable={store.vanilla.has(path)}
      />
    </div>
  );
}
