import { useEffect, useMemo, useState } from 'react';
import type { AssetStore } from '../../assets/AssetStore';
import { useLocale, useT, type MessageKey } from '../../i18n';
import { itemThumbnail, mobThumbnail } from '../../render/thumbnails';
import { MOBS } from '../../entities/catalog';
import { ARMOR_SLOTS } from '../../entities/equipment';
import { CONTAINERS, containerSlots, drawContainer, drawHud, HUD_SPRITES, type HudState, type ItemImages, type Stack } from '../../scenes/hud';
import { useApp } from '../../state/appStore';
import { Btn } from '../common';
import { Section, TextureRow } from '../ItemDetail';
import { ItemThumb } from '../ItemsView';
import { SceneLayout } from './ScenesView';
import { useVanillaPanorama } from './TitleScreen';
import { GuiCanvas, guiScale, useElementSize, useFont, useSprites } from './gui';

type Mode = 'hud' | (typeof CONTAINERS)[number]['id'];
const MODES: Mode[] = ['hud', ...CONTAINERS.map((c) => c.id)];

const m = (id: string, count?: number): Stack => ({ id: `minecraft:${id}`, count });
const HOTBAR: (Stack | undefined)[] = [
  m('diamond_sword'),
  m('diamond_pickaxe'),
  m('bow'),
  m('cooked_beef', 23),
  m('torch', 64),
  m('oak_planks', 48),
  m('water_bucket'),
  m('golden_apple', 3),
  m('compass'),
];
const INVENTORY: (Stack | undefined)[] = [
  m('arrow', 64),
  m('cobblestone', 64),
  undefined,
  m('bread', 12),
  m('iron_ingot', 9),
  undefined,
  undefined,
  m('redstone', 32),
  m('ender_pearl', 16),
  undefined,
  m('oak_log', 20),
  m('glass', 64),
  undefined,
  m('flint_and_steel'),
  undefined,
  m('emerald', 5),
  undefined,
  undefined,
  m('lapis_lazuli', 17),
  undefined,
  m('book'),
  m('feather', 7),
  undefined,
  m('string', 11),
  undefined,
  m('bone', 4),
  m('rotten_flesh', 30),
];
const OWN: Record<string, (Stack | undefined)[]> = {
  inventory: [
    m('diamond_helmet'),
    m('diamond_chestplate'),
    m('diamond_leggings'),
    m('diamond_boots'),
    m('shield'),
    m('oak_planks'),
    m('oak_planks'),
    undefined,
    undefined,
    m('crafting_table'),
  ],
  chest: [
    m('gold_ingot', 7),
    undefined,
    m('diamond', 2),
    undefined,
    m('saddle'),
    undefined,
    m('name_tag'),
    undefined,
    m('enchanted_book'),
    undefined,
    m('golden_carrot', 9),
    undefined,
    m('obsidian', 4),
    undefined,
    undefined,
    m('music_disc_cat'),
    undefined,
    m('iron_horse_armor'),
    m('map'),
    undefined,
    undefined,
    m('experience_bottle', 12),
    undefined,
    undefined,
    m('clock'),
    undefined,
    m('heart_of_the_sea'),
  ],
  crafting_table: [m('diamond'), m('diamond'), m('diamond'), undefined, m('stick'), undefined, undefined, m('stick'), undefined, m('diamond_pickaxe')],
  furnace: [m('raw_iron', 12), m('coal', 5), m('iron_ingot', 3)],
};

/** Item renders as images, for drawing into the GUI canvas. */
function useItemImages(store: AssetStore, ids: string[]): ItemImages {
  const items = useApp((s) => s.items);
  const [images, setImages] = useState<ItemImages>(new Map());
  const key = ids.join(',');
  useEffect(() => {
    let alive = true;
    const byId = new Map(items.map((i) => [i.id, i]));
    void Promise.all(
      [...new Set(ids)].map(async (id) => {
        const item = byId.get(id);
        const url = item ? await itemThumbnail(store, item).catch(() => '') : '';
        if (!url) return undefined;
        const img = new Image();
        img.src = url;
        await img.decode().catch(() => undefined);
        return [id, img] as const;
      }),
    ).then((list) => alive && setImages(new Map(list.filter((x): x is readonly [string, HTMLImageElement] => !!x))));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, key, items]);
  return images;
}

/** The HUD and a few container screens, drawn from the pack's GUI textures and font. */
export function HudScreen({ store }: { store: AssetStore }) {
  const t = useT();
  const locale = useLocale((s) => s.locale);
  const { names, items } = useApp();
  useVanillaPanorama();
  const [mode, setMode] = useState<Mode>('hud');
  const def = CONTAINERS.find((c) => c.id === mode);
  const font = useFont(store);
  const spriteIds = useMemo(() => [...HUD_SPRITES, ...CONTAINERS.map((c) => c.texture), 'minecraft:gui/title/background/panorama_0'], []);
  const sprites = useSprites(store, spriteIds);
  const [hotbar, setHotbar] = useState(HOTBAR);
  const [inventory, setInventory] = useState(INVENTORY);
  const [own, setOwn] = useState(OWN);
  const [offhand, setOffhand] = useState<Stack | undefined>(m('shield'));
  const [hud, setHud] = useState<HudState>({ health: 17, food: 15, armor: 20, air: 6, level: 30, progress: 0.4, selected: 0, hardcore: false, underwater: false });
  const [picking, setPicking] = useState<number>();
  const [query, setQuery] = useState('');
  const [ref, [cw, ch]] = useElementSize<HTMLDivElement>();

  const stacks = def ? [...own[def.id], ...inventory, ...hotbar] : [];
  const ids = [...hotbar, ...inventory, offhand, ...Object.values(own).flat()].flatMap((s) => (s ? [s.id] : []));
  const images = useItemImages(store, ids);
  const itemName = useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i.name]));
    return (id: string) => byId.get(id) ?? id;
  }, [items]);

  // the player in the inventory wears the armour of its armour slots
  const armor = own.inventory.slice(0, 4).map((s) => s?.id ?? '');
  const [player, setPlayer] = useState<HTMLImageElement>();
  const revision = useApp((s) => s.revision);
  useEffect(() => {
    const mob = MOBS.find((x) => x.id === 'player');
    if (!mob) return;
    let alive = true;
    const worn = Object.fromEntries(
      ARMOR_SLOTS.flatMap((slot, i) => {
        const mm = /^(\w+):(\w+)_(helmet|chestplate|leggings|boots)$/.exec(armor[i]);
        return mm && mm[3] === slot ? [[slot, `${mm[1]}:${mm[2] === 'golden' ? 'gold' : mm[2]}`]] : [];
      }),
    );
    void mobThumbnail(store, mob, 200, { armor: worn }).then(async (url) => {
      if (!url || !alive) return;
      const img = new Image();
      img.src = url;
      await img.decode().catch(() => undefined);
      if (alive) setPlayer(img);
    }, (e) => console.warn('Could not draw the player', e));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, armor.join(','), revision]);

  const scale = guiScale(cw, ch);
  const gw = Math.max(1, Math.floor(cw / scale));
  const gh = Math.max(1, Math.floor(ch / scale));

  /** Sets the stack of a slot (numbered like `stacks`; the HUD's hotbar is −1 … −9). */
  const setSlot = (slot: number, stack: Stack | undefined) => {
    if (slot < 0) return setHotbar((h) => h.map((s, i) => (i === -slot - 1 ? stack : s)));
    if (!def) return;
    const n = def.slots.length;
    if (slot < n) setOwn((o) => ({ ...o, [def.id]: o[def.id].map((s, i) => (i === slot ? stack : s)) }));
    else if (slot < n + 27) setInventory((inv) => inv.map((s, i) => (i === slot - n ? stack : s)));
    else setHotbar((h) => h.map((s, i) => (i === slot - n - 27 ? stack : s)));
  };
  useEffect(() => setPicking(undefined), [mode]);

  const pickable = useMemo(() => {
    const q = query.trim().toLowerCase();
    const collator = new Intl.Collator(locale);
    return items
      .filter((i) => !q || i.name.toLowerCase().includes(q) || i.id.includes(q))
      .sort((a, b) => collator.compare(a.name, b.name))
      .slice(0, 120);
  }, [items, query, locale]);

  const hudSlot = (x: number, y: number) => {
    const i = Math.floor((x - (Math.floor(gw / 2) - 91)) / 20);
    return y >= gh - 22 && i >= 0 && i < 9 ? i : -1;
  };

  const usedSprites = def
    ? [
        def.texture,
        'minecraft:gui/sprites/container/slot_highlight_back',
        'minecraft:gui/sprites/container/slot_highlight_front',
        'minecraft:gui/sprites/tooltip/background',
        'minecraft:gui/sprites/tooltip/frame',
        ...(def.furnace ? ['minecraft:gui/sprites/container/furnace/lit_progress', 'minecraft:gui/sprites/container/furnace/burn_progress'] : []),
      ]
    : HUD_SPRITES.filter((id) => id.includes('/hud/'));

  const num = (key: keyof HudState, max: number, step = 1) => (
    <label className="flex items-center gap-2">
      <span className="w-28 text-neutral-400">{t(`scenes.hud.${key}` as 'scenes.hud.health')}</span>
      <input type="range" min={0} max={max} step={step} value={hud[key] as number} onChange={(e) => setHud({ ...hud, [key]: Number(e.target.value) })} className="flex-1" />
      <span className="w-8 text-right tabular-nums">{key === 'progress' ? Math.round(hud.progress * 100) + '%' : (hud[key] as number)}</span>
    </label>
  );

  return (
    <SceneLayout
      main={
        <div
          ref={ref}
          className="absolute inset-0 overflow-hidden bg-neutral-800"
          onWheel={(e) => mode === 'hud' && setHud((h) => ({ ...h, selected: (h.selected + (e.deltaY > 0 ? 1 : 8)) % 9 }))}
        >
          {font && sprites && cw > 0 && (
            <GuiCanvas
              width={gw}
              height={gh}
              scale={scale}
              animate
              draw={(ctx, s) => {
                // the world behind: the front panorama image, darkened behind a screen like in game
                const bg = sprites['minecraft:gui/title/background/panorama_0'];
                if (!bg.tex.missing) {
                  const k = Math.max(gw / bg.tex.width, gh / bg.tex.height);
                  ctx.imageSmoothingEnabled = true;
                  ctx.drawImage(bg.tex.canvas, (gw - bg.tex.width * k) / 2, (gh - bg.tex.height * k) / 2, bg.tex.width * k, bg.tex.height * k);
                  ctx.imageSmoothingEnabled = false;
                }
                if (def) {
                  const g = ctx.createLinearGradient(0, 0, 0, gh);
                  g.addColorStop(0, 'rgba(16,16,16,0.75)');
                  g.addColorStop(1, 'rgba(16,16,16,0.82)');
                  ctx.fillStyle = g;
                  ctx.fillRect(0, 0, gw, gh);
                  drawContainer(ctx, gw, gh, font, sprites, images, { def, bg: sprites[def.texture], stacks, names, itemName, player }, s.time, s.mouse);
                } else {
                  if (hud.underwater) {
                    ctx.fillStyle = 'rgba(20,60,160,0.35)';
                    ctx.fillRect(0, 0, gw, gh);
                  }
                  drawHud(ctx, gw, gh, font, sprites, images, hotbar, offhand, hud);
                }
              }}
              onClick={(x, y) => {
                if (def) {
                  const ox = Math.floor((gw - def.width) / 2);
                  const oy = Math.floor((gh - def.height) / 2);
                  const i = containerSlots(def).findIndex(([sx, sy]) => x >= ox + sx - 1 && x < ox + sx + 17 && y >= oy + sy - 1 && y < oy + sy + 17);
                  if (i >= 0) setPicking(i);
                } else {
                  const i = hudSlot(x, y);
                  if (i >= 0) {
                    setHud((h) => ({ ...h, selected: i }));
                    setPicking(-i - 1);
                  }
                }
              }}
            />
          )}
        </div>
      }
      aside={
        <>
          <div className="p-3">
            <h2 className="text-base font-semibold">{t('scenes.hud.title')}</h2>
            <p className="text-xs text-neutral-400">{t('scenes.hud.hint')}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {MODES.map((id) => (
                <button key={id} onClick={() => setMode(id)} className={`rounded px-2 py-1 text-xs ${mode === id ? 'bg-emerald-700' : 'bg-neutral-800 hover:bg-neutral-700'}`}>
                  {t(`scenes.hud.modes.${id}` as MessageKey)}
                </button>
              ))}
            </div>
          </div>
          {picking !== undefined && (
            <Section title={t('scenes.hud.pick')}>
              <div className="mb-2 flex items-center gap-2">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('items.search')}
                  className="min-w-0 flex-1 rounded bg-neutral-800 px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <Btn onClick={() => (setSlot(picking, undefined), setPicking(undefined))}>{t('scenes.hud.empty')}</Btn>
                <Btn onClick={() => setPicking(undefined)}>✕</Btn>
              </div>
              <div className="grid max-h-64 grid-cols-8 gap-1 overflow-y-auto">
                {pickable.map((item) => (
                  <button
                    key={item.id}
                    title={item.name}
                    onClick={() => {
                      setSlot(picking, { id: item.id });
                      setPicking(undefined);
                    }}
                    className="rounded bg-neutral-800 p-0.5 hover:bg-neutral-700"
                  >
                    <ItemThumb store={store} item={item} className="aspect-square w-full" />
                  </button>
                ))}
              </div>
            </Section>
          )}
          {mode === 'hud' && (
            <Section title={t('scenes.hud.player')}>
              <div className="flex flex-col gap-1 text-xs">
                {num('health', 20)}
                {num('food', 20)}
                {num('armor', 20)}
                {num('level', 100)}
                {num('progress', 1, 0.01)}
                <div className="mt-1 flex gap-4">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={hud.hardcore} onChange={(e) => setHud({ ...hud, hardcore: e.target.checked })} /> {t('scenes.hud.hardcore')}
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={hud.underwater} onChange={(e) => setHud({ ...hud, underwater: e.target.checked })} /> {t('scenes.hud.underwater')}
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={!!offhand} onChange={(e) => setOffhand(e.target.checked ? m('shield') : undefined)} /> {t('scenes.hud.offhand')}
                  </label>
                </div>
                {hud.underwater && num('air', 10)}
                <p className="mt-1 text-neutral-500">{t('scenes.hud.wheelHint')}</p>
              </div>
            </Section>
          )}
          <Section title={t('scenes.hud.files')}>
            <div className="flex flex-col gap-3">
              {usedSprites.map((id) => (
                <TextureRow key={id} store={store} id={id} />
              ))}
            </div>
          </Section>
        </>
      }
    />
  );
}
