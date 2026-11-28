import { useMemo, useState } from 'react';
import type { AssetStore } from '../../assets/AssetStore';
import { useT } from '../../i18n';
import { texturePath } from '../../models/resourceLocation';
import { drawSprite, pixelsCanvas } from '../../scenes/draw';
import { DECORATION, drawMapTerrain, MAP_FRAME, mapDecorations, PLACED } from '../../scenes/map';
import { useApp } from '../../state/appStore';
import { Section, TextureRow } from '../ItemDetail';
import { TextureThumb } from '../TexturesView';
import { SceneLayout } from './ScenesView';
import { GuiCanvas, useElementSize, useSprites } from './gui';

const BACKGROUND = 'minecraft:map/map_background';
const CHECKERBOARD = 'minecraft:map/map_background_checkerboard';
const SIZE = 128 + 2 * MAP_FRAME;
const decoration = (name: string) => `minecraft:map/decorations/${name}`;

/** A map held in the hand: the pack's background and decorations over made-up land. */
export function MapScreen({ store }: { store: AssetStore }) {
  const t = useT();
  const revision = useApp((s) => s.revision);
  const all = useMemo(() => mapDecorations(store), [store, revision]);
  const [selected, setSelected] = useState(decoration('player'));
  const [seed, setSeed] = useState(1);
  const terrain = useMemo(() => pixelsCanvas(drawMapTerrain(seed)), [seed]);
  const ids = useMemo(() => [BACKGROUND, ...new Set([...PLACED.map((p) => decoration(p.name)), selected])], [selected]);
  const sprites = useSprites(store, ids);
  const [ref, [cw, ch]] = useElementSize<HTMLDivElement>();
  const scale = Math.max(1, Math.floor(Math.min(cw, ch) / SIZE));
  const extra = !PLACED.some((p) => decoration(p.name) === selected);

  const draw = (ctx: CanvasRenderingContext2D) => {
    if (!sprites) return;
    drawSprite(ctx, sprites[BACKGROUND], 0, 0, SIZE, SIZE);
    ctx.drawImage(terrain, MAP_FRAME, MAP_FRAME);
    const place = (id: string, x: number, y: number, rot: number) => {
      const s = sprites[id];
      if (!s) return;
      ctx.save();
      ctx.translate(MAP_FRAME + x, MAP_FRAME + y);
      ctx.rotate((rot * Math.PI) / 8);
      ctx.drawImage(s.tex.canvas, -DECORATION / 2, -DECORATION / 2, DECORATION, DECORATION);
      ctx.restore();
    };
    for (const p of PLACED) place(decoration(p.name), p.x, p.y, p.rot);
    // the chosen decoration beside the player, if it isn't on the map already
    if (extra) place(selected, 80, 64, 0);
  };

  return (
    <SceneLayout
      main={
        <div ref={ref} className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#3b3024]">
          {cw > 0 && <GuiCanvas width={SIZE} height={SIZE} scale={scale} draw={draw} />}
        </div>
      }
      aside={
        <>
          <div className="p-3">
            <h2 className="text-base font-semibold">{t('scenes.map.title')}</h2>
            <p className="text-xs text-neutral-400">{t('scenes.map.hint')}</p>
            <button onClick={() => setSeed(seed + 1)} className="mt-2 rounded bg-neutral-800 px-2 py-1 text-xs hover:bg-neutral-700">
              {t('scenes.map.newLand')}
            </button>
          </div>
          <Section title={t('scenes.map.decorations')}>
            <div className="grid grid-cols-8 gap-1">
              {all.map((id) => (
                <button
                  key={id}
                  onClick={() => setSelected(id)}
                  title={id.split('/').pop()}
                  className={`rounded p-0.5 ${selected === id ? 'bg-neutral-600 ring-1 ring-emerald-500' : 'bg-neutral-800 hover:bg-neutral-700'}`}
                >
                  <TextureThumb store={store} path={texturePath(id)} className="h-8 w-8 [&_img]:[image-rendering:pixelated] [&_img]:h-full [&_img]:w-full" />
                </button>
              ))}
            </div>
            <div className="mt-3">
              <TextureRow store={store} id={selected} />
            </div>
          </Section>
          <Section title={t('scenes.map.background')}>
            <TextureRow store={store} id={BACKGROUND} />
            <div className="mt-2">
              <TextureRow store={store} id={CHECKERBOARD} />
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">{t('scenes.map.checkerboardHint')}</p>
          </Section>
        </>
      }
    />
  );
}
