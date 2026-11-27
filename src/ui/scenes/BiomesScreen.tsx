import { useEffect, useMemo, useState } from 'react';
import type { AssetStore } from '../../assets/AssetStore';
import { useT } from '../../i18n';
import type { Pixels } from '../../render/pixelEdit';
import { decodeImage } from '../../render/png';
import { biomeColors, colormapPath, COLORMAPS, colormapSpot, hex, listBiomes, type Biome, type BiomeColors, type Colormap } from '../../scenes/colormap';
import { useApp } from '../../state/appStore';
import { Section, TextureRow } from '../ItemDetail';
import { SceneLayout } from './ScenesView';

/** Textures tinted by the biome colours, shown for each biome. */
const TILES = [
  { key: 'grass', texture: 'minecraft:block/grass_block_top' },
  { key: 'foliage', texture: 'minecraft:block/oak_leaves' },
  { key: 'dryFoliage', texture: 'minecraft:block/leaf_litter' },
  { key: 'water', texture: 'minecraft:block/water_still' },
] as const;

/** Decodes the files at `paths` (undefined where missing), again when one of them changes. */
export function useDecoded(store: AssetStore, paths: readonly string[]): (Pixels | undefined)[] | undefined {
  const revision = useApp((s) => s.revision);
  void revision;
  const key = paths.map((p) => `${p}@${store.rev(p)}`).join('|');
  const [out, setOut] = useState<(Pixels | undefined)[]>();
  useEffect(() => {
    let alive = true;
    void Promise.all(paths.map((p) => (store.get(p) ? decodeImage(store.get(p)!).catch(() => undefined) : undefined))).then((list) => alive && setOut(list));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, key]);
  return out;
}

const texPath = (id: string) => `assets/minecraft/textures/${id.split(':')[1]}.png`;

/** The texture multiplied by a colour, as a data URL; for animated strips only the first frame. */
function tinted(p: Pixels | undefined, color: number): string {
  if (!p) return '';
  const size = Math.min(p.width, p.height);
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const img = new ImageData(size, size);
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  for (let i = 0; i < size * size * 4; i += 4) {
    img.data[i] = (p.data[i] * r) / 255;
    img.data[i + 1] = (p.data[i + 1] * g) / 255;
    img.data[i + 2] = (p.data[i + 2] * b) / 255;
    img.data[i + 3] = p.data[i + 3];
  }
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c.toDataURL();
}

function ColormapView({
  name,
  map,
  biomes,
  hovered,
  onHover,
  label,
}: {
  name: Colormap;
  map?: Pixels;
  biomes: Biome[];
  hovered?: string;
  onHover: (id?: string) => void;
  label: string;
}) {
  const t = useT();
  const url = useMemo(() => {
    if (!map) return '';
    const c = document.createElement('canvas');
    c.width = map.width;
    c.height = map.height;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(map.data), map.width, map.height), 0, 0);
    return c.toDataURL();
  }, [map]);
  const [at, setAt] = useState<{ x: number; y: number; color: number }>();
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="text-xs font-semibold">{label}</div>
      <div
        className="checker relative h-48 w-48 rounded"
        onMouseMove={(e) => {
          if (!map) return;
          const r = e.currentTarget.getBoundingClientRect();
          const x = Math.min(map.width - 1, Math.floor(((e.clientX - r.left) / r.width) * map.width));
          const y = Math.min(map.height - 1, Math.floor(((e.clientY - r.top) / r.height) * map.height));
          const i = (y * map.width + x) * 4;
          setAt({ x, y, color: (map.data[i] << 16) | (map.data[i + 1] << 8) | map.data[i + 2] });
        }}
        onMouseLeave={() => setAt(undefined)}
      >
        {url ? (
          <img src={url} alt="" className="pixelated h-full w-full" draggable={false} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-neutral-500">{t('source.missing')}</div>
        )}
        {biomes.map((b) => {
          const [x, y] = colormapSpot(b.temperature, b.downfall);
          const own = name === 'grass' ? b.grassColor !== undefined : name === 'foliage' ? b.foliageColor !== undefined : b.dryFoliageColor !== undefined;
          if (own) return null;
          return (
            <span
              key={b.id}
              onMouseEnter={() => onHover(b.id)}
              onMouseLeave={() => onHover(undefined)}
              className={`absolute -ml-1 -mt-1 h-2 w-2 rounded-full ring-1 ${hovered === b.id ? 'z-10 scale-150 bg-white ring-black' : 'bg-black/60 ring-white/80'}`}
              style={{ left: `${((x + 0.5) / 256) * 100}%`, top: `${((y + 0.5) / 256) * 100}%` }}
            />
          );
        })}
      </div>
      <div className="h-4 font-mono text-[10px] text-neutral-400">
        {at && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: hex(at.color) }} />
            {at.x},{at.y} {hex(at.color)}
          </span>
        )}
      </div>
    </div>
  );
}

function BiomeCard({
  biome,
  colors,
  tiles,
  name,
  hovered,
  onHover,
}: {
  biome: Biome;
  colors: BiomeColors;
  tiles: (Pixels | undefined)[];
  name: string;
  hovered: boolean;
  onHover: (id?: string) => void;
}) {
  const t = useT();
  const urls = useMemo(() => TILES.map((tile, i) => tinted(tiles[i], colors[tile.key])), [tiles, colors]);
  return (
    <div
      onMouseEnter={() => onHover(biome.id)}
      onMouseLeave={() => onHover(undefined)}
      className={`flex flex-col gap-1.5 rounded p-2 ring-1 ${hovered ? 'bg-neutral-700 ring-emerald-500' : 'bg-neutral-800 ring-transparent'}`}
    >
      <div className="truncate text-xs font-semibold" title={biome.id}>
        {name}
      </div>
      <div className="flex gap-1">
        {TILES.map((tile, i) => (
          <div
            key={tile.key}
            className="flex flex-col items-center gap-0.5"
            title={`${t(`scenes.biomes.tiles.${tile.key}`)} ${hex(colors[tile.key])}${tile.key !== 'water' && colors.fixed[tile.key] ? ` · ${t('scenes.biomes.fixed')}` : ''}`}
          >
            {urls[i] ? (
              <img src={urls[i]} alt="" className="pixelated h-10 w-10" draggable={false} />
            ) : (
              <div className="h-10 w-10 rounded" style={{ background: hex(colors[tile.key]) }} />
            )}
            <span className={`text-[9px] ${tile.key !== 'water' && colors.fixed[tile.key] ? 'text-amber-400' : 'text-neutral-500'}`}>{t(`scenes.biomes.tiles.${tile.key}`)}</span>
          </div>
        ))}
      </div>
      <div className="font-mono text-[10px] text-neutral-500">{t('scenes.biomes.climate', { temperature: biome.temperature, downfall: biome.downfall })}</div>
    </div>
  );
}

/** Grass, leaves, leaf litter and water in every biome, with the colormaps they come from. */
export function BiomesScreen({ store }: { store: AssetStore }) {
  const t = useT();
  const names = useApp((s) => s.names);
  const biomes = useMemo(() => listBiomes(store), [store]);
  const maps = useDecoded(
    store,
    useMemo(() => COLORMAPS.map(colormapPath), []),
  );
  const tiles = useDecoded(
    store,
    useMemo(() => TILES.map((tile) => texPath(tile.texture)), []),
  );
  const [hovered, setHovered] = useState<string>();
  const mapByName = useMemo(() => Object.fromEntries(COLORMAPS.map((m, i) => [m, maps?.[i]])) as Partial<Record<Colormap, Pixels>>, [maps]);
  const colors = useMemo(() => new Map(biomes.map((b) => [b.id, biomeColors(b, mapByName)])), [biomes, mapByName]);
  const nameOf = (id: string) => names[`biome.${id.replace(':', '.')}`] ?? id.split(':')[1].replace(/_/g, ' ');

  return (
    <SceneLayout
      main={
        <div className="absolute inset-0 overflow-y-auto p-4">
          <div className="mb-4 flex flex-wrap justify-center gap-6">
            {COLORMAPS.map((m, i) => (
              <ColormapView key={m} name={m} map={maps?.[i]} biomes={biomes} hovered={hovered} onHover={setHovered} label={t(`scenes.biomes.maps.${m}`)} />
            ))}
          </div>
          {biomes.length === 0 ? (
            <p className="text-sm text-neutral-400">{t('scenes.biomes.noBiomes')}</p>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
              {biomes.map((b) => (
                <BiomeCard key={b.id} biome={b} colors={colors.get(b.id)!} tiles={tiles ?? []} name={nameOf(b.id)} hovered={hovered === b.id} onHover={setHovered} />
              ))}
            </div>
          )}
        </div>
      }
      aside={
        <>
          <div className="p-3">
            <h2 className="text-base font-semibold">{t('scenes.biomes.title')}</h2>
            <p className="text-xs text-neutral-400">{t('scenes.biomes.hint')}</p>
            <p className="mt-2 text-xs text-neutral-500">{t('scenes.biomes.fixedHint')}</p>
          </div>
          <Section title={t('scenes.biomes.colormaps')}>
            <div className="flex flex-col gap-3">
              {COLORMAPS.map((m) => (
                <TextureRow key={m} store={store} id={`minecraft:colormap/${m}`} />
              ))}
            </div>
          </Section>
          <Section title={t('scenes.biomes.tinted')}>
            <div className="flex flex-col gap-3">
              {TILES.map((tile) => (
                <TextureRow key={tile.key} store={store} id={tile.texture} />
              ))}
            </div>
          </Section>
        </>
      }
    />
  );
}
