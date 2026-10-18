import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { AssetStore, Source } from '../assets/AssetStore';
import { MOBS, type MobDef } from '../entities/catalog';
import { texturePath } from '../models/resourceLocation';
import { downloadBlob } from '../pack/exportPack';
import { buildMobObject, mobDeps } from '../render/entityMesh';
import { mobThumbnail } from '../render/thumbnails';
import { useT, type TFunction } from '../i18n';
import { useApp } from '../state/appStore';
import { AssetActions, Btn, SourceBadge, useInView } from './common';
import { ObjectViewer } from './ItemViewer';
import { TextureThumb } from './TexturesView';
import { UVOverlay } from './UVOverlay';

const RANK: Record<Source, number> = { vanilla: 0, pack: 1, edited: 2 };

/** Mob name from Minecraft's language files (in the UI language), plus the translated variant. */
export function mobName(names: Record<string, string>, mob: MobDef, t: TFunction): string {
  const base = names[`entity.minecraft.${mob.entity}`] ?? (mob.entity === 'player' ? t('mobs.player') : mob.entity.replace(/_/g, ' '));
  return mob.variant ? `${base} (${t(`mobs.variant.${mob.variant}`)})` : base;
}

function mobSource(store: AssetStore, mob: MobDef): Source {
  let s: Source = 'vanilla';
  for (const d of mobDeps(mob)) {
    const src = store.source(d);
    if (src && RANK[src] > RANK[s]) s = src;
  }
  return s;
}

function MobThumb({ store, mob, className = 'h-16 w-16' }: { store: AssetStore; mob: MobDef; className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [url, setUrl] = useState<string>();
  const revision = useApp((s) => s.revision);
  useEffect(() => {
    if (!inView) return;
    let alive = true;
    mobThumbnail(store, mob).then((u) => alive && setUrl(u), (e) => console.error(e));
    return () => {
      alive = false;
    };
  }, [inView, store, mob, revision]);
  return (
    <div ref={ref} className={`flex items-center justify-center ${className}`}>
      {url && <img src={url} alt="" className="h-full w-full object-contain" draggable={false} />}
    </div>
  );
}

export function MobsView() {
  const { store, revision, names, selectedMob, selectMob } = useApp();
  const t = useT();
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim().toLowerCase());
  const mobs = useMemo(
    () =>
      store
        ? MOBS.map((m) => ({ mob: m, name: mobName(names, m, t), source: mobSource(store, m) })).filter(
            (m) => !q || m.name.toLowerCase().includes(q) || m.mob.id.includes(q),
          )
        : [],
    [store, revision, q, names, t],
  );
  const current = MOBS.find((m) => m.id === selectedMob);
  if (!store) return null;

  return (
    <div className="flex h-full">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-neutral-800 p-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('mobs.search')}
            className="w-64 rounded bg-neutral-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <span className="ml-auto text-xs text-neutral-500">{t('mobs.count', { count: mobs.length })}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-1.5">
            {mobs.map(({ mob, name, source }) => {
              const ring = source === 'edited' ? 'ring-amber-500' : source === 'pack' ? 'ring-sky-600' : 'ring-transparent';
              return (
                <button
                  key={mob.id}
                  onClick={() => selectMob(mob.id)}
                  className={`flex flex-col items-center gap-1 rounded p-2 ring-1 ${ring} ${
                    selectedMob === mob.id ? 'bg-neutral-600' : 'bg-neutral-800 hover:bg-neutral-700'
                  }`}
                >
                  <MobThumb store={store} mob={mob} className="h-20 w-20" />
                  <span className="w-full truncate text-center text-[11px] text-neutral-300">{name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>
      {current && (
        <aside className="w-[460px] shrink-0 overflow-y-auto border-l border-neutral-800 bg-neutral-950">
          <MobDetail store={store} mob={current} onClose={() => selectMob(undefined)} />
        </aside>
      )}
    </div>
  );
}

function MobDetail({ store, mob, onClose }: { store: AssetStore; mob: MobDef; onClose: () => void }) {
  const names = useApp((s) => s.names);
  useApp((s) => s.revision);
  const t = useT();
  const [uvFor, setUvFor] = useState<number | undefined>(0);
  const depsKey = mobDeps(mob)
    .map((d) => store.rev(d))
    .join('.');

  const downloadRender = async () => {
    const url = await mobThumbnail(store, mob, 512);
    downloadBlob(await (await fetch(url)).blob(), `${mob.id}.png`);
  };

  return (
    <div>
      <div className="flex items-start gap-3 p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{mobName(names, mob, t)}</h2>
            <SourceBadge source={mobSource(store, mob)} />
          </div>
          <div className="font-mono text-xs text-neutral-400">minecraft:{mob.entity}</div>
        </div>
        <button onClick={onClose} className="text-neutral-500 hover:text-neutral-200" title={t('actions.close')}>
          ✕
        </button>
      </div>
      <div className="px-3">
        <div className="h-80">
          <ObjectViewer fit buildKey={`${mob.id}|${depsKey}`} build={() => buildMobObject(store, mob)} />
        </div>
        <div className="mt-2 flex items-center">
          <span className="text-[11px] text-neutral-500">{t('mobs.staticPose')}</span>
          <span className="ml-auto">
            <Btn onClick={() => void downloadRender()} title={t('mobs.renderTitle')}>
              {t('actions.render')}
            </Btn>
          </span>
        </div>
      </div>

      <section className="border-t border-neutral-800 p-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{t('mobs.textures')}</h3>
        <div className="flex flex-col gap-3">
          {mob.layers.map((layer, i) => {
            const path = texturePath(layer.texture);
            const src = store.source(path);
            return (
              <div key={i} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <TextureThumb store={store} path={path} className="checker h-10 w-10 shrink-0 rounded" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-xs">{layer.texture.replace('minecraft:entity/', '')}</span>
                      <SourceBadge source={src} />
                      {layer.emissive && <span className="text-[10px] text-neutral-500">{t('mobs.emissive')}</span>}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <AssetActions path={path} source={src} load={async () => store.get(path)} kind="texture" vanillaAvailable={store.vanilla.has(path)} />
                      <Btn onClick={() => setUvFor(uvFor === i ? undefined : i)} title={t('mobs.uvTitle')}>
                        {uvFor === i ? t('mobs.uvHide') : t('mobs.uvShow')}
                      </Btn>
                    </div>
                  </div>
                </div>
                {uvFor === i && <UVOverlay store={store} path={path} modelKey={layer.model} />}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
