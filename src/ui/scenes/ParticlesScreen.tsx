import { useEffect, useMemo, useState } from 'react';
import type { AssetStore } from '../../assets/AssetStore';
import { useT } from '../../i18n';
import { normalizeRL, texturePath } from '../../models/resourceLocation';
import { useApp } from '../../state/appStore';
import { Section, TextureRow } from '../ItemDetail';
import { TextureThumb } from '../TexturesView';
import { SceneLayout } from './ScenesView';

export interface Particle {
  id: string;
  /** Texture ids of its sprites, in the order the game plays them. */
  textures: string[];
}

const PARTICLE = /^assets\/([^/]+)\/particles\/([^/]+)\.json$/;

/** Particles and their sprites (assets/<ns>/particles/*.json); sprites live in textures/particle/. */
export function listParticles(store: AssetStore): Particle[] {
  const out: Particle[] = [];
  for (const path of store.list('assets/')) {
    const m = PARTICLE.exec(path);
    if (!m) continue;
    const json = store.json<{ textures?: unknown }>(path);
    const textures = Array.isArray(json?.textures) ? json.textures.filter((x): x is string => typeof x === 'string').map((x) => normalizeRL(x).replace(/:/, ':particle/')) : [];
    if (textures.length) out.push({ id: `${m[1]}:${m[2]}`, textures });
  }
  return out;
}

/** Shared frame counter, 8 sprites a second (particles age by game ticks; this is close). */
function useTicker(fps = 8) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), 1000 / fps);
    return () => clearInterval(id);
  }, [fps]);
  return n;
}

function ParticleCard({ store, particle, frame, selected, onSelect }: { store: AssetStore; particle: Particle; frame: number; selected: boolean; onSelect: () => void }) {
  const shown = frame % particle.textures.length;
  const edited = particle.textures.some((t) => store.source(texturePath(t)) === 'edited');
  const inPack = particle.textures.some((t) => store.source(texturePath(t)) === 'pack');
  const ring = edited ? 'ring-amber-500' : inPack ? 'ring-sky-600' : 'ring-transparent';
  return (
    <button
      onClick={onSelect}
      title={particle.id}
      className={`flex flex-col items-center gap-1 rounded p-1.5 ring-1 ${ring} ${selected ? 'bg-neutral-600' : 'bg-neutral-800 hover:bg-neutral-700'}`}
    >
      <div className="relative h-16 w-16 rounded bg-neutral-950">
        {/* every sprite stays mounted; only the current one shows, so playback doesn't flicker */}
        {particle.textures.map((t, i) => (
          <div key={t + i} className="absolute inset-2" style={{ opacity: i === shown ? 1 : 0 }}>
            <TextureThumb store={store} path={texturePath(t)} className="h-full w-full [&_canvas]:h-full [&_canvas]:w-full [&_img]:h-full [&_img]:w-full" />
          </div>
        ))}
      </div>
      <span className="w-full truncate text-center text-[10px] text-neutral-300">{particle.id.replace(/^minecraft:/, '')}</span>
      {particle.textures.length > 1 && <span className="text-[9px] text-neutral-500">{particle.textures.length}×</span>}
    </button>
  );
}

/** Every particle, playing its sprites, with the textures to edit. */
export function ParticlesScreen({ store }: { store: AssetStore }) {
  const t = useT();
  const revision = useApp((s) => s.revision);
  const particles = useMemo(() => listParticles(store), [store, revision]);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>();
  const frame = useTicker();
  const q = query.trim().toLowerCase();
  const visible = particles.filter((p) => !q || p.id.includes(q) || p.textures.some((x) => x.includes(q)));
  const current = particles.find((p) => p.id === selected);
  const unique = current ? [...new Set(current.textures)] : [];

  return (
    <SceneLayout
      main={
        <div className="absolute inset-0 flex flex-col">
          <div className="flex items-center gap-2 border-b border-neutral-800 p-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('scenes.particles.search')}
              className="w-64 rounded bg-neutral-800 px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <span className="ml-auto text-xs text-neutral-500">{t('items.shown', { count: visible.length })}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(92px,1fr))] gap-1.5">
              {visible.map((p) => (
                <ParticleCard key={p.id} store={store} particle={p} frame={frame} selected={p.id === selected} onSelect={() => setSelected(p.id)} />
              ))}
            </div>
          </div>
        </div>
      }
      aside={
        <>
          <div className="p-3">
            <h2 className="text-base font-semibold">{current ? current.id : t('scenes.particles.title')}</h2>
            <p className="text-xs text-neutral-400">{t('scenes.particles.hint')}</p>
          </div>
          {current && (
            <Section title={t('items.textures', { count: unique.length })}>
              <div className="flex flex-col gap-3">
                {unique.map((id) => (
                  <TextureRow key={id} store={store} id={id} />
                ))}
              </div>
            </Section>
          )}
        </>
      }
    />
  );
}
