import { OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { AssetStore } from '../../assets/AssetStore';
import { useLocale, useT } from '../../i18n';
import { modelTextures, resolveModel } from '../../models/modelResolver';
import { parseRL } from '../../models/resourceLocation';
import type { Pixels } from '../../render/pixelEdit';
import { buildItemObject, disposeObject } from '../../render/buildMesh';
import { addLayer, lightBrightness, setBrightness } from '../../render/layers';
import { biomeColors, colormapPath, COLORMAPS, listBiomes, type Colormap } from '../../scenes/colormap';
import {
  blockModels,
  blockParts,
  blockStatePath,
  blockTint,
  cellKey,
  ctmModels,
  DEFAULT_TINTS,
  emissiveModels,
  floor,
  listBlocks,
  parseCell,
  parseCells,
  pickVariant,
  positionSeed,
  serializeCells,
  type Cells,
  type Tints,
} from '../../scenes/sandbox';
import { useApp } from '../../state/appStore';
import { emissiveSuffix, loadCtmRules, overlayRulesFor, ruleFor, SHOWN_METHODS, type CtmRule, type CtmWorld } from '../../optifine/optifine';
import { resolveFaceTexture, type FaceDir } from '../../models/modelResolver';
import { Btn } from '../common';
import { Section, TextureRow } from '../ItemDetail';
import { ItemThumb } from '../ItemsView';
import { useDecoded } from './BiomesScreen';
import { SceneLayout } from './ScenesView';

const STORAGE = 'sandbox:cells';
const CLICK_SLOP = 4;

function loadCells(): Cells {
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved) return parseCells(saved);
  } catch {
    // storage may be blocked; start with a floor
  }
  return floor('minecraft:grass_block', 8);
}

/** Built blocks by look, shared by every cell that shows the same thing; cleared when anything changes. */
class BlockCache {
  private map = new Map<string, Promise<THREE.Object3D>>();
  get(key: string, build: () => Promise<THREE.Object3D>) {
    let p = this.map.get(key);
    if (!p) this.map.set(key, (p = build()));
    return p;
  }
  dispose() {
    for (const p of this.map.values()) void p.then(disposeObject, () => undefined);
    this.map.clear();
  }
}

/** What the blocks need to know about OptiFine features. */
interface OptiFine {
  rules: CtmRule[];
  world: CtmWorld;
  suffix?: string;
  /** Light level 0…15 */
  light: number;
}

function Block({
  cache,
  store,
  cell,
  block,
  tints,
  revision,
  optifine,
  onPick,
  onHover,
}: {
  cache: BlockCache;
  store: AssetStore;
  cell: string;
  block: string;
  tints: Tints;
  revision: number;
  optifine: OptiFine;
  onPick: (cell: string, normal: THREE.Vector3, e: ThreeEvent<MouseEvent>) => void;
  onHover: (cell: string | undefined) => void;
}) {
  const [x, y, z] = parseCell(cell);
  const parts = useMemo(() => blockParts(store.json(blockStatePath(block))), [store, block, revision]);
  const seed = positionSeed(x, y, z);
  const choice = parts.map((v) => pickVariant(v, seed));
  // connected textures depend on the neighbours, so the tiles are part of what makes blocks alike
  const { models, overlays, key: tiles } = ctmModels(
    blockModels(store, block, parts, choice, tints),
    parts,
    choice,
    optifine.rules,
    optifine.world,
    [x, y, z],
    block,
    (b) => blockTint(b, tints),
  );
  const glow = emissiveModels(store, models, optifine.suffix);
  const key = `${block}|${choice.join('.')}|${tints.grass}.${tints.foliage}.${tints.water}|${revision}|${tiles}|${glow ? 'g' : ''}`;
  const [obj, setObj] = useState<THREE.Object3D>();
  useEffect(() => {
    let alive = true;
    const build = async () => {
      const o = await buildItemObject(store, models, 'none');
      // overlay tiles on top of the faces, then emissive textures that never darken
      if (overlays) await addLayer(store, o, overlays, 'none', false);
      if (glow) await addLayer(store, o, glow, 'none', true);
      return o;
    };
    void cache.get(key, build).then((o) => alive && setObj(o.clone(true)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cache, key]);
  // light level (materials are shared, so this is cheap); glowing textures stay bright
  useEffect(() => {
    if (obj) setBrightness(obj, lightBrightness(optifine.light));
  }, [obj, optifine.light]);
  if (!obj) return null;
  return (
    <primitive
      object={obj}
      position={[x, y, z]}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (e.delta > CLICK_SLOP || !e.face) return;
        onPick(cell, e.face.normal.clone().transformDirection(e.object.matrixWorld).round(), e);
      }}
      onContextMenu={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onPick(cell, new THREE.Vector3(), Object.assign(e, { shiftKey: true }));
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (e.face)
          onHover(cellKey(...(new THREE.Vector3(x, y, z).add(e.face.normal.clone().transformDirection(e.object.matrixWorld).round()).toArray() as [number, number, number])));
      }}
      onPointerOut={() => onHover(undefined)}
    />
  );
}

/** Light levels worth a click: daylight, a torch nearby, moonlight, where mobs spawn, darkness. */
const LIGHT_PRESETS = [
  ['day', 15],
  ['torch', 12],
  ['moon', 4],
  ['spawn', 0],
] as const;

/** The sky behind the blocks: blue by day, dark blue at night. */
function skyColor(light: number): string {
  return `#${new THREE.Color('#0b1024').lerp(new THREE.Color('#79a6ff'), Math.max(0, (light - 4) / 11)).getHexString()}`;
}

/** A little world to place blocks in and see how the textures look side by side. */
export function SandboxScreen({ store }: { store: AssetStore }) {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const { items, names, revision } = useApp();
  const [cells, setCells] = useState<Cells>(loadCells);
  const [block, setBlock] = useState('minecraft:grass_block');
  const [mode, setMode] = useState<'place' | 'remove'>('place');
  const [query, setQuery] = useState('');
  const [hover, setHover] = useState<string>();
  const [biome, setBiome] = useState('minecraft:plains');
  const [useCtm, setUseCtm] = useState(true);
  const [light, setLight] = useState(15);
  const cache = useMemo(() => new BlockCache(), [store]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => cache.dispose(), [cache]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE, serializeCells(cells));
    } catch {
      // not saved; the scene still works
    }
  }, [cells]);

  const blocks = useMemo(() => listBlocks(store), [store, revision]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const nameOf = (id: string) => {
    const { ns, path } = parseRL(id);
    return names[`block.${ns}.${path}`] ?? path.replace(/_/g, ' ');
  };
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const collator = new Intl.Collator(locale);
    return blocks
      .filter((b) => !q || b.includes(q) || nameOf(b).toLowerCase().includes(q))
      .sort((a, b) => collator.compare(nameOf(a), nameOf(b)))
      .slice(0, 160);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, query, locale, names]);

  // biome colours for grass, leaves and water
  const biomes = useMemo(() => listBiomes(store), [store]);
  const maps = useDecoded(
    store,
    useMemo(() => COLORMAPS.map(colormapPath), []),
  );
  const tints: Tints = useMemo(() => {
    const b = biomes.find((x) => x.id === biome);
    if (!b || !maps) return DEFAULT_TINTS;
    const c = biomeColors(b, Object.fromEntries(COLORMAPS.map((m, i) => [m, maps[i]])) as Partial<Record<Colormap, Pixels>>);
    return { grass: c.grass, foliage: c.foliage, water: c.water };
  }, [biomes, biome, maps]);

  // OptiFine / Continuity: connected textures and emissive overlays
  const ctmRules = useMemo(() => loadCtmRules(store), [store, revision]);
  const suffix = useMemo(() => emissiveSuffix(store), [store, revision]);
  const texturesOf = useMemo(() => {
    const memo = new Map<string, Set<string>>();
    return (b: string) => {
      let set = memo.get(b);
      if (!set) memo.set(b, (set = new Set(blockParts(store.json(blockStatePath(b))).flatMap((vs) => vs.flatMap((v) => modelTextures(resolveModel(store, v.model)))))));
      return set;
    };
  }, [store, revision]);
  const optifine: OptiFine = useMemo(
    () => ({ rules: useCtm ? ctmRules : [], world: { blockAt: (p) => cells.get(cellKey(...p)), texturesOf }, suffix, light }),
    [useCtm, ctmRules, cells, texturesOf, suffix, light],
  );

  // a file change (an edit, a new random variant) rebuilds the blocks
  const [rebuild, setRebuild] = useState(revision);
  useEffect(() => {
    cache.dispose();
    setRebuild(revision);
  }, [cache, revision]);

  const pick = (cell: string, normal: THREE.Vector3, e: ThreeEvent<MouseEvent>) => {
    const next = new Map(cells);
    if (mode === 'remove' || e.shiftKey) next.delete(cell);
    else {
      const [x, y, z] = parseCell(cell);
      next.set(cellKey(x + normal.x, y + normal.y, z + normal.z), block);
    }
    setCells(next);
  };
  const placeOnGround = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > CLICK_SLOP || mode === 'remove' || e.shiftKey) return;
    setCells(new Map(cells).set(cellKey(Math.round(e.point.x), 0, Math.round(e.point.z)), block));
  };

  const selectedParts = useMemo(() => blockParts(store.json(blockStatePath(block))), [store, block, revision]);
  const variantCount = selectedParts.reduce((n, p) => Math.max(n, p.length), 0);
  const textures = useMemo(() => [...new Set(selectedParts.flatMap((variants) => variants.flatMap((v) => modelTextures(resolveModel(store, v.model)))))], [store, selectedParts]);
  const hoverPos = hover ? parseCell(hover) : undefined;
  // CTM rules for the selected block's faces
  const blockRules = useMemo(() => {
    const out = new Set<CtmRule>();
    for (const variants of selectedParts)
      for (const v of variants) {
        const m = resolveModel(store, v.model);
        for (const el of m.elements)
          for (const [dir, face] of Object.entries(el.faces)) {
            const tex = face && resolveFaceTexture(m.textures, face.texture);
            if (!tex) continue;
            const r = ruleFor(ctmRules, block, tex, dir as FaceDir);
            if (r) out.add(r);
            for (const o of overlayRulesFor(ctmRules, block, tex, dir as FaceDir)) out.add(o);
          }
      }
    return [...out];
  }, [selectedParts, ctmRules, block, store]);

  return (
    <SceneLayout
      main={
        <div className="absolute inset-0" onContextMenu={(e) => e.preventDefault()}>
          <Canvas camera={{ position: [9, 8, 11], fov: 45, near: 0.05, far: 300 }} onCreated={({ gl }) => (gl.outputColorSpace = THREE.SRGBColorSpace)}>
            <color attach="background" args={[skyColor(light)]} />
            {[...cells].map(([cell, b]) => (
              <Block key={cell} cache={cache} store={store} cell={cell} block={b} tints={tints} revision={rebuild} optifine={optifine} onPick={pick} onHover={setHover} />
            ))}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, -0.5, 0]}
              onClick={placeOnGround}
              onPointerMove={(e) => (e.stopPropagation(), setHover(cellKey(Math.round(e.point.x), 0, Math.round(e.point.z))))}
              onPointerOut={() => setHover(undefined)}
            >
              <planeGeometry args={[64, 64]} />
              <meshBasicMaterial color="#4a5a3a" transparent opacity={cells.size ? 0.35 : 0.6} />
            </mesh>
            <gridHelper args={[64, 64, '#3b4a30', '#3b4a30']} position={[0.5, -0.499, 0.5]} />
            {hoverPos && mode === 'place' && (
              <lineSegments position={hoverPos}>
                <edgesGeometry args={[new THREE.BoxGeometry(1.002, 1.002, 1.002)]} />
                <lineBasicMaterial color="#ffffff" />
              </lineSegments>
            )}
            <OrbitControls makeDefault enableDamping target={[0, 0, 0]} />
          </Canvas>
          <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/50 px-2 py-1 text-[11px] text-neutral-200">{t('scenes.sandbox.controls')}</div>
        </div>
      }
      aside={
        <>
          <div className="p-3">
            <h2 className="text-base font-semibold">{t('scenes.sandbox.title')}</h2>
            <p className="text-xs text-neutral-400">{t('scenes.sandbox.hint')}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1">
              <button onClick={() => setMode('place')} className={`rounded px-2 py-1 text-xs ${mode === 'place' ? 'bg-emerald-700' : 'bg-neutral-800 hover:bg-neutral-700'}`}>
                {t('scenes.sandbox.place')}
              </button>
              <button onClick={() => setMode('remove')} className={`rounded px-2 py-1 text-xs ${mode === 'remove' ? 'bg-red-800' : 'bg-neutral-800 hover:bg-neutral-700'}`}>
                {t('scenes.sandbox.remove')}
              </button>
              <span className="mx-1 h-4 w-px bg-neutral-700" />
              <Btn onClick={() => setCells(floor(block, 8))}>{t('scenes.sandbox.floor')}</Btn>
              <Btn
                onClick={() =>
                  setCells(
                    new Map([
                      ...cells,
                      ...[...floor(block, 8)]
                        .filter(([k]) => parseCell(k)[2] === -4)
                        .flatMap(([k]) =>
                          [1, 2, 3, 4].map((y) => {
                            const [x, , z] = parseCell(k);
                            return [cellKey(x, y, z), block] as [string, string];
                          }),
                        ),
                    ]),
                  )
                }
              >
                {t('scenes.sandbox.wall')}
              </Btn>
              <Btn tone="danger" onClick={() => setCells(new Map())}>
                {t('scenes.sandbox.clear')}
              </Btn>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs" title={t('scenes.sandbox.lightTitle')}>
              <span className="text-neutral-400">{t('scenes.sandbox.light')}</span>
              <input type="range" min={0} max={15} value={light} onChange={(e) => setLight(Number(e.target.value))} className="min-w-0 flex-1" />
              <span className="w-24 text-right">
                {light} · {Math.round(lightBrightness(light) * 100)}%
              </span>
            </label>
            <div className="mt-1 flex flex-wrap gap-1">
              {LIGHT_PRESETS.map(([key, level]) => (
                <button key={key} onClick={() => setLight(level)} className={`rounded px-2 py-0.5 text-[11px] ${light === level ? 'bg-emerald-700' : 'bg-neutral-800 hover:bg-neutral-700'}`}>
                  {t(`scenes.sandbox.lightPreset.${key}`)}
                </button>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs">
              <span className="text-neutral-400">{t('scenes.sandbox.biome')}</span>
              <select value={biome} onChange={(e) => setBiome(e.target.value)} className="min-w-0 flex-1 rounded bg-neutral-800 px-1 py-0.5">
                {biomes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {names[`biome.${b.id.replace(':', '.')}`] ?? b.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {(ctmRules.length > 0 || suffix) && (
            <div className="border-t border-neutral-800 p-3 text-xs">
              <div className="font-semibold">{t('optifine.title')}</div>
              <p className="mb-2 text-neutral-400">{t('optifine.sandboxHint', { rules: ctmRules.length, suffix: suffix ?? '–' })}</p>
              <div className="flex flex-wrap gap-3">
                {ctmRules.length > 0 && (
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={useCtm} onChange={(e) => setUseCtm(e.target.checked)} />
                    {t('optifine.ctm')}
                  </label>
                )}
              </div>
            </div>
          )}
          <Section title={t('scenes.sandbox.blocks')}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('scenes.sandbox.search')}
              className="mb-2 w-full rounded bg-neutral-800 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <div className="grid max-h-72 grid-cols-7 gap-1 overflow-y-auto">
              {shown.map((b) => {
                const item = itemById.get(b);
                return (
                  <button
                    key={b}
                    title={nameOf(b)}
                    onClick={() => (setBlock(b), setMode('place'))}
                    className={`flex aspect-square items-center justify-center rounded p-0.5 ${block === b ? 'bg-emerald-800 ring-1 ring-emerald-400' : 'bg-neutral-800 hover:bg-neutral-700'}`}
                  >
                    {item ? (
                      <ItemThumb store={store} item={item} className="h-full w-full" />
                    ) : (
                      <span className="line-clamp-2 break-all text-[8px] leading-tight text-neutral-400">{parseRL(b).path}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </Section>
          <Section title={nameOf(block)}>
            {variantCount > 1 && <p className="mb-2 text-xs text-neutral-400">{t('scenes.sandbox.variants', { count: variantCount })}</p>}
            {blockRules.map((r) => (
              <div key={r.file} className="mb-2 rounded bg-neutral-950 px-2 py-1 text-[11px]">
                <span className="text-emerald-300">CTM {r.method}</span>
                {!SHOWN_METHODS.has(r.method) && <span className="text-amber-300"> · {t('optifine.notShown')}</span>}
                <div className="break-all font-mono text-neutral-500">{r.file.replace(/^assets\/[^/]+\//, '')}</div>
              </div>
            ))}
            <div className="flex flex-col gap-3">
              {textures.map((id) => (
                <TextureRow key={id} store={store} id={id} />
              ))}
            </div>
          </Section>
        </>
      }
    />
  );
}
