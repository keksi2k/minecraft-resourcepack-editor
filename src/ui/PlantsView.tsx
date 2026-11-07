import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { AssetStore } from '../assets/AssetStore';
import { useLocale, useT } from '../i18n';
import type { PlantEntry, PlantStage } from '../models/plants';
import { modelPath } from '../models/resourceLocation';
import { downloadBlob } from '../pack/exportPack';
import { buildItemObject } from '../render/buildMesh';
import { plantThumbnail } from '../render/thumbnails';
import { eventsLinkedTo } from '../sounds/soundLinks';
import { useApp } from '../state/appStore';
import { useEditing } from '../state/editorStore';
import { Btn, SourceBadge, useInView } from './common';
import { EditorPanel } from './EditorPanel';
import { FileRow, Section, StageStrip, TextureRow } from './ItemDetail';
import { ObjectViewer } from './ItemViewer';
import { SoundEventRow, useSoundLinks } from './SoundsView';

export function PlantThumb({ store, plant, stage = plant.stages[plant.stages.length - 1], className = 'h-12 w-12' }: {
  store: AssetStore;
  plant: PlantEntry;
  stage?: PlantStage;
  className?: string;
}) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!inView) return;
    let alive = true;
    plantThumbnail(store, plant, stage).then((u) => alive && setUrl(u), () => alive && setUrl(''));
    return () => {
      alive = false;
    };
  }, [inView, store, plant, stage]);
  return (
    <div ref={ref} className={`flex items-center justify-center ${className}`}>
      {url ? <img src={url} alt="" className="pixelated h-full w-full object-contain" draggable={false} /> : url === '' ? <span className="text-neutral-600">?</span> : null}
    </div>
  );
}

const Tile = memo(function Tile({ store, plant, selected, onSelect }: {
  store: AssetStore;
  plant: PlantEntry;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const ring = plant.source === 'edited' ? 'ring-amber-500' : plant.source === 'pack' ? 'ring-sky-600' : 'ring-transparent';
  return (
    <button
      onClick={() => onSelect(plant.id)}
      title={`${plant.name}\n${plant.id}`}
      className={`relative flex flex-col items-center gap-1 rounded p-1.5 ring-1 ${ring} ${selected ? 'bg-neutral-600' : 'bg-neutral-800 hover:bg-neutral-700'}`}
    >
      <PlantThumb store={store} plant={plant} />
      <span className="w-full truncate text-center text-[10px] text-neutral-300">{plant.name}</span>
    </button>
  );
});

export function PlantsView() {
  const { store, plants, selectedPlant, selectPlant } = useApp();
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const [query, setQuery] = useState('');
  const q = useDeferredValue(query.trim().toLowerCase());
  const editing = useEditing('plants');

  const visible = useMemo(() => {
    const collator = new Intl.Collator(locale);
    return plants.filter((p) => !q || p.name.toLowerCase().includes(q) || p.id.includes(q)).sort((a, b) => collator.compare(a.name, b.name));
  }, [plants, q, locale]);
  const current = plants.find((p) => p.id === selectedPlant);

  if (!store) return null;
  return (
    <div className="flex h-full">
      {editing && <EditorPanel />}
      <section className={`min-w-0 flex-1 flex-col ${editing ? 'hidden' : 'flex'}`}>
        <div className="flex items-center gap-2 border-b border-neutral-800 p-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('plants.search')}
            className="w-64 rounded bg-neutral-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <span className="ml-auto text-xs text-neutral-500">{t('items.shown', { count: visible.length })}</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5">
            {visible.map((plant) => (
              <Tile key={plant.id} store={store} plant={plant} selected={plant.id === selectedPlant} onSelect={selectPlant} />
            ))}
          </div>
        </div>
      </section>
      {current && (
        <aside className="w-[460px] shrink-0 overflow-y-auto border-l border-neutral-800 bg-neutral-950">
          <PlantDetail store={store} plant={current} />
        </aside>
      )}
    </div>
  );
}

function PlantDetail({ store, plant }: { store: AssetStore; plant: PlantEntry }) {
  const { soundEvents, selectPlant } = useApp();
  const t = useT();
  const links = useSoundLinks();
  const sounds = useMemo(() => eventsLinkedTo(soundEvents, links, plant.id), [soundEvents, links, plant.id]);
  const last = plant.stages.length - 1;
  // the grown plant first: it fills the view, so the camera frames every stage
  const [picked, setPicked] = useState(last);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    setPicked(plant.stages.length - 1);
    setPlaying(false);
  }, [plant.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = Math.min(picked, last);
  const stage = plant.stages[current];
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(() => setPicked((current + 1) % plant.stages.length), 500);
    return () => clearTimeout(id);
  }, [playing, current, plant.stages.length]);

  const downloadRender = async () => {
    const url = await plantThumbnail(store, plant, stage, 512);
    if (url) downloadBlob(await (await fetch(url)).blob(), `${plant.id.split(':')[1]}_${current + 1}.png`);
  };

  return (
    <div>
      <div className="flex items-start gap-3 p-3">
        <PlantThumb store={store} plant={plant} className="checker h-16 w-16 shrink-0 rounded p-1" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold">{plant.name}</h2>
            <SourceBadge source={plant.source} />
          </div>
          <div className="truncate font-mono text-xs text-neutral-400">{plant.id}</div>
        </div>
        <button onClick={() => selectPlant(undefined)} className="text-neutral-500 hover:text-neutral-200" title={t('actions.close')}>
          ✕
        </button>
      </div>

      <div className="px-3">
        <div className="h-72">
          <ObjectViewer
            fit
            buildKey={`${plant.id}|${plant.depsKey}|${stage.key}`}
            build={async () => {
              const obj = await buildItemObject(store, stage.models, 'none');
              // standing on the grid; crops reach a pixel below it, into the farmland
              obj.position.y = 0.5;
              return obj;
            }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-neutral-400">
          <span>{t('plants.age', { ages: stage.ages.join(', ') })}</span>
          <Btn onClick={() => void downloadRender()} title={t('plants.renderTitle')}>
            {t('actions.render')}
          </Btn>
        </div>
      </div>

      <Section title={t('items.stages', { count: plant.stages.length })}>
        <StageStrip
          stages={plant.stages}
          info={t('plants.stagesInfo')}
          current={current}
          playing={playing}
          onPlay={setPlaying}
          onPick={(s) => {
            setPlaying(false);
            setPicked(plant.stages.indexOf(s));
          }}
          title={(s) => `${t('plants.age', { ages: s.ages.join(', ') })}\n${s.textures.join('\n')}`}
          thumb={(s) => <PlantThumb store={store} plant={plant} stage={s} className="checker aspect-square w-full rounded-sm" />}
        />
      </Section>

      <Section title={t('items.textures', { count: stage.textures.length })}>
        <div className="flex flex-col gap-2">
          {stage.textures.map((id) => (
            <TextureRow key={id} store={store} id={id} />
          ))}
          {stage.textures.length === 0 && <div className="text-xs text-neutral-500">{t('items.noTextures')}</div>}
        </div>
      </Section>

      <Section title={t('items.models')}>
        <div className="flex flex-col gap-3">
          <FileRow store={store} path={plant.defPath} label={t('plants.blockState')} />
          {stage.models.map(({ model }) => (
            <div key={model.id} className="rounded bg-neutral-900 p-2">
              {model.chain.map((m) => (
                <FileRow key={m} store={store} path={modelPath(m)} label={m} />
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title={t('items.relatedSounds')}>
        {sounds.length === 0 ? (
          <div className="text-xs text-neutral-500">{t('items.noRelatedSounds', { name: plant.id.split(':')[1] })}</div>
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
