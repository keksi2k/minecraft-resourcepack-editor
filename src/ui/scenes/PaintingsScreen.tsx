import { useMemo, useState } from 'react';
import { parseLenientJson, pngSize, type AssetStore } from '../../assets/AssetStore';
import { useT } from '../../i18n';
import { normalizeRL, texturePath } from '../../models/resourceLocation';
import { useApp } from '../../state/appStore';
import { Section, TextureRow } from '../ItemDetail';
import { TextureThumb } from '../TexturesView';
import { SceneLayout } from './ScenesView';

export interface Painting {
  id: string;
  /** Texture id (painting/<asset>). */
  texture: string;
  /** Size in blocks. */
  width: number;
  height: number;
}

const VARIANT = /^data\/([^/]+)\/painting_variant\/([^/]+)\.json$/;

/** The game's paintings with their sizes (from the vanilla data, which packs can't change). */
export function listPaintings(store: AssetStore): Painting[] {
  const out: Painting[] = [];
  for (const [path, bytes] of store.vanilla) {
    const m = VARIANT.exec(path);
    if (!m) continue;
    let json: any;
    try {
      json = parseLenientJson(new TextDecoder().decode(bytes));
    } catch {
      continue;
    }
    const asset = normalizeRL(typeof json?.asset_id === 'string' ? json.asset_id : `${m[1]}:${m[2]}`);
    out.push({ id: `${m[1]}:${m[2]}`, texture: asset.replace(/:/, ':painting/'), width: Number(json?.width) || 1, height: Number(json?.height) || 1 });
  }
  return out.sort((a, b) => b.width * b.height - a.width * a.height || a.id.localeCompare(b.id));
}

const PX = 48;

/** Every painting at its size on a wall, with its title and artist. */
export function PaintingsScreen({ store }: { store: AssetStore }) {
  const t = useT();
  const { names, revision } = useApp();
  const paintings = useMemo(() => listPaintings(store), [store]);
  const [selected, setSelected] = useState<string>();
  const current = paintings.find((p) => p.id === selected);
  void revision;
  const title = (p: Painting) => names[`painting.${p.id.replace(':', '.')}.title`] ?? p.id.split(':')[1];
  const author = (p: Painting) => names[`painting.${p.id.replace(':', '.')}.author`];
  /** A texture that isn't width:height like the painting gets stretched in game. */
  const misfit = (p: Painting) => {
    const bytes = store.get(texturePath(p.texture));
    const size = bytes && pngSize(bytes);
    return !!size && Math.abs(size[0] / size[1] - p.width / p.height) > 1e-6;
  };

  return (
    <SceneLayout
      main={
        <div
          className="absolute inset-0 overflow-y-auto bg-[#6b5a43] p-6"
          style={{ backgroundImage: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0 2px, transparent 2px 48px)' }}
        >
          {paintings.length === 0 && <p className="text-sm text-neutral-200">{t('scenes.paintings.none')}</p>}
          <div className="flex flex-wrap items-end gap-6">
            {paintings.map((p) => {
              const src = store.source(texturePath(p.texture));
              return (
                <button
                  key={p.id}
                  onClick={() => setSelected(p.id)}
                  title={`${title(p)}${author(p) ? ` – ${author(p)}` : ''}\n${p.width}×${p.height}`}
                  className={`flex flex-col items-center gap-1 rounded p-1 ${selected === p.id ? 'bg-black/40 ring-2 ring-emerald-500' : 'hover:bg-black/20'}`}
                >
                  <div className="relative shadow-lg shadow-black/50 ring-1 ring-black/40" style={{ width: p.width * PX, height: p.height * PX }}>
                    <TextureThumb store={store} path={texturePath(p.texture)} className="h-full w-full [&_img]:h-full [&_img]:w-full [&_img]:object-fill" />
                    {(src === 'edited' || src === 'pack') && <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${src === 'edited' ? 'bg-amber-500' : 'bg-sky-500'}`} />}
                    {misfit(p) && <span className="absolute left-1 top-1 rounded bg-red-800 px-1 text-[9px] text-white">{t('scenes.paintings.misfit')}</span>}
                  </div>
                  <span className="max-w-full truncate text-[10px] text-neutral-100" style={{ maxWidth: Math.max(80, p.width * PX) }}>
                    {title(p)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      }
      aside={
        <>
          <div className="p-3">
            <h2 className="text-base font-semibold">{current ? title(current) : t('scenes.paintings.title')}</h2>
            {current ? (
              <p className="text-xs text-neutral-400">
                {author(current) && `${author(current)} · `}
                {t('scenes.paintings.size', { w: current.width, h: current.height, pw: current.width * 16, ph: current.height * 16 })}
              </p>
            ) : (
              <p className="text-xs text-neutral-400">{t('scenes.paintings.hint')}</p>
            )}
          </div>
          {current && (
            <Section title={t('scenes.paintings.texture')}>
              <TextureRow store={store} id={current.texture} />
              {misfit(current) && <p className="mt-2 text-xs text-red-400">{t('scenes.paintings.misfitHint', { w: current.width, h: current.height })}</p>}
            </Section>
          )}
          <Section title={t('scenes.paintings.back')}>
            <TextureRow store={store} id="minecraft:painting/back" />
          </Section>
        </>
      }
    />
  );
}
