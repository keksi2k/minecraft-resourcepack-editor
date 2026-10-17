import { memo, useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { AssetStore } from '../assets/AssetStore';
import type { ItemEntry } from '../models/items';
import { itemThumbnail } from '../render/thumbnails';
import { useApp } from '../state/appStore';
import { useInView } from './common';
import { ItemDetail } from './ItemDetail';

type Filter = 'all' | 'changed' | 'edited';

export function ItemThumb({ store, item, className = 'h-12 w-12' }: { store: AssetStore; item: ItemEntry; className?: string }) {
  const [ref, inView] = useInView<HTMLDivElement>();
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!inView) return;
    let alive = true;
    itemThumbnail(store, item).then((u) => alive && setUrl(u), () => alive && setUrl(''));
    return () => {
      alive = false;
    };
  }, [inView, store, item]);
  return (
    <div ref={ref} className={`flex items-center justify-center ${className}`}>
      {url ? (
        <img src={url} alt="" className="pixelated h-full w-full object-contain" draggable={false} />
      ) : url === '' ? (
        <span className="text-neutral-600">?</span>
      ) : null}
    </div>
  );
}

const Tile = memo(function Tile({ store, item, selected, onSelect }: {
  store: AssetStore;
  item: ItemEntry;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const ring = item.source === 'edited' ? 'ring-amber-500' : item.source === 'pack' ? 'ring-sky-600' : 'ring-transparent';
  return (
    <button
      onClick={() => onSelect(item.id)}
      title={`${item.name}\n${item.id}`}
      className={`relative flex flex-col items-center gap-1 rounded p-1.5 ring-1 ${ring} ${
        selected ? 'bg-neutral-600' : 'bg-neutral-800 hover:bg-neutral-700'
      }`}
    >
      <ItemThumb store={store} item={item} />
      <span className="w-full truncate text-center text-[10px] text-neutral-300">{item.name}</span>
    </button>
  );
});

export function ItemsView() {
  const { store, items, selectedItem, select } = useApp();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const q = useDeferredValue(query.trim().toLowerCase());

  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          (filter === 'all' || (filter === 'changed' ? i.source !== 'vanilla' : i.source === 'edited')) &&
          (!q || i.name.toLowerCase().includes(q) || i.id.includes(q)),
      ),
    [items, q, filter],
  );
  const current = items.find((i) => i.id === selectedItem);
  const counts = useMemo(
    () => ({ changed: items.filter((i) => i.source !== 'vanilla').length, edited: items.filter((i) => i.source === 'edited').length }),
    [items],
  );

  if (!store) return null;
  return (
    <div className="flex h-full">
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-neutral-800 p-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Items suchen …"
            className="w-64 rounded bg-neutral-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {(
            [
              ['all', `Alle (${items.length})`],
              ['changed', `Im Pack (${counts.changed})`],
              ['edited', `Bearbeitet (${counts.edited})`],
            ] as [Filter, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              className={`rounded px-2 py-1 text-xs ${filter === id ? 'bg-neutral-600' : 'bg-neutral-800 hover:bg-neutral-700'}`}
            >
              {label}
            </button>
          ))}
          <span className="ml-auto text-xs text-neutral-500">{visible.length} angezeigt</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-1.5">
            {visible.map((item) => (
              <Tile key={item.id} store={store} item={item} selected={item.id === selectedItem} onSelect={select} />
            ))}
          </div>
        </div>
      </section>
      {current && (
        <aside className="w-[460px] shrink-0 overflow-y-auto border-l border-neutral-800 bg-neutral-950">
          <ItemDetail store={store} item={current} />
        </aside>
      )}
    </div>
  );
}
