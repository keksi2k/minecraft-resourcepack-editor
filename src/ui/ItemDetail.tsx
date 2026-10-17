import { useMemo, useState } from 'react';
import type { AssetStore } from '../assets/AssetStore';
import type { ItemEntry } from '../models/items';
import type { DisplayContext } from '../models/modelResolver';
import { modelPath, texturePath } from '../models/resourceLocation';
import { downloadBlob } from '../pack/exportPack';
import { itemThumbnail } from '../render/thumbnails';
import { soundsForItem } from '../sounds/soundsJson';
import { useApp } from '../state/appStore';
import { AssetActions, Btn, SourceBadge } from './common';
import { ItemThumb } from './ItemsView';
import { CONTEXTS, ItemViewer } from './ItemViewer';
import { SoundEventRow } from './SoundsView';
import { TextureThumb } from './TexturesView';

const KIND_LABEL = {
  generated: 'Flaches Item (item/generated)',
  elements: '3D-Modell',
  builtin: 'Spezialmodell – Vorschau vereinfacht',
  missing: 'Modell fehlt',
};

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
  const [context, setContext] = useState<DisplayContext>('gui');
  const sounds = useMemo(() => soundsForItem(soundEvents, item.id), [soundEvents, item.id]);

  const downloadRender = async () => {
    const url = await itemThumbnail(store, item, 512);
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
        <button onClick={() => select(undefined)} className="text-neutral-500 hover:text-neutral-200" title="Schließen">
          ✕
        </button>
      </div>

      <div className="px-3">
        <div className="h-72">
          <ItemViewer store={store} item={item} context={context} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {CONTEXTS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setContext(id)}
              className={`rounded px-2 py-0.5 text-[11px] ${context === id ? 'bg-emerald-700' : 'bg-neutral-800 hover:bg-neutral-700'}`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto">
            <Btn onClick={() => void downloadRender()} title="Inventar-Render als PNG (512 px)">
              ⬇ Render
            </Btn>
          </span>
        </div>
      </div>

      <Section title={`Texturen (${item.textures.length})`}>
        <div className="flex flex-col gap-2">
          {item.textures.map((t) => {
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
          {item.textures.length === 0 && <div className="text-xs text-neutral-500">Keine Texturen.</div>}
        </div>
      </Section>

      <Section title="Modelle">
        <div className="flex flex-col gap-3">
          <FileRow store={store} path={item.defPath} label="Item-Definition" />
          {item.models.map(({ ref, model }, i) => (
            <div key={i} className="rounded bg-neutral-900 p-2">
              <div className="mb-1 text-xs">
                {KIND_LABEL[model.kind]}
                {ref.special && <span className="text-neutral-400"> ({ref.special})</span>}
              </div>
              {model.chain.map((m) => (
                <FileRow key={m} store={store} path={modelPath(m)} label={m} />
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Passende Sounds (nach Name)">
        {sounds.length === 0 ? (
          <div className="text-xs text-neutral-500">Keine Sound-Events mit „{item.id.split(':')[1]}“ im Namen.</div>
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
