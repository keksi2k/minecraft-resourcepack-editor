import { useMemo, useState } from 'react';
import type { AssetStore } from '../../assets/AssetStore';
import { useT } from '../../i18n';
import { drawSprite, drawText } from '../../scenes/draw';
import { textWidth } from '../../scenes/font';
import { RARITY, tooltipLayout, tooltipSprites, tooltipStyles, type Rarity } from '../../scenes/tooltip';
import { useApp } from '../../state/appStore';
import { Section, TextureRow } from '../ItemDetail';
import { SceneLayout } from './ScenesView';
import { GuiCanvas, guiScale, useElementSize, useFont, useSprites } from './gui';

const SAMPLE = 'Diamond Sword\n§5§oA trusty blade\n\n§7When in Main Hand:\n§2 7 Attack Damage\n§2 1.6 Attack Speed';

/** An item tooltip in the pack's tooltip sprites and font, in any tooltip style the pack has. */
export function TooltipScreen({ store }: { store: AssetStore }) {
  const t = useT();
  const revision = useApp((s) => s.revision);
  const font = useFont(store);
  const styles = useMemo(() => tooltipStyles(store), [store, revision]);
  const [style, setStyle] = useState('');
  const [rarity, setRarity] = useState<Rarity>('common');
  const [text, setText] = useState(SAMPLE);
  const ids = useMemo(() => {
    const s = tooltipSprites(style || undefined);
    return [s.background, s.frame];
  }, [style]);
  const sprites = useSprites(store, ids);
  const [ref, [cw, ch]] = useElementSize<HTMLDivElement>();
  const scale = guiScale(cw, ch);
  const w = Math.max(1, Math.floor(cw / scale));
  const h = Math.max(1, Math.floor(ch / scale));
  const lines = text.split('\n');

  const draw = (ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = '#20232a';
    ctx.fillRect(0, 0, w, h);
    if (!font || !sprites) return;
    const layout = tooltipLayout(lines.map((l) => textWidth(font, l)));
    const x = Math.floor((w - layout.width) / 2);
    const y = Math.floor((h - layout.height) / 2);
    const { box } = layout;
    drawSprite(ctx, sprites[ids[0]], x + box.x, y + box.y, box.w, box.h);
    drawSprite(ctx, sprites[ids[1]], x + box.x, y + box.y, box.w, box.h);
    lines.forEach((line, i) => drawText(ctx, font, line, x, y + layout.lineY[i], { color: i === 0 ? RARITY[rarity] : '#ffffff' }));
  };

  return (
    <SceneLayout
      main={
        <div ref={ref} className="absolute inset-0 flex items-center justify-center overflow-hidden bg-[#20232a]">
          {cw > 0 && <GuiCanvas width={w} height={h} scale={scale} draw={draw} />}
        </div>
      }
      aside={
        <>
          <div className="p-3">
            <h2 className="text-base font-semibold">{t('scenes.tooltip.title')}</h2>
            <p className="text-xs text-neutral-400">{t('scenes.tooltip.hint')}</p>
            <label className="mt-3 flex items-center gap-2 text-xs">
              <span className="w-16 text-neutral-400">{t('scenes.tooltip.style')}</span>
              <select value={style} onChange={(e) => setStyle(e.target.value)} className="min-w-0 flex-1 rounded bg-neutral-800 px-1 py-0.5">
                <option value="">{t('scenes.tooltip.defaultStyle')}</option>
                {styles.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-2 flex items-center gap-2 text-xs">
              <span className="w-16 text-neutral-400">{t('scenes.tooltip.rarity')}</span>
              <select value={rarity} onChange={(e) => setRarity(e.target.value as Rarity)} className="min-w-0 flex-1 rounded bg-neutral-800 px-1 py-0.5">
                {(Object.keys(RARITY) as Rarity[]).map((r) => (
                  <option key={r} value={r}>
                    {t(`scenes.tooltip.rarities.${r}`)}
                  </option>
                ))}
              </select>
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={6}
              spellCheck={false}
              aria-label={t('scenes.tooltip.text')}
              className="mt-2 w-full rounded bg-neutral-800 p-2 font-mono text-xs"
            />
            <p className="text-[11px] text-neutral-500">{t('scenes.tooltip.textHint')}</p>
            {style && <p className="mt-2 rounded bg-neutral-900 p-2 font-mono text-[11px] text-neutral-300">/give @s diamond_sword[tooltip_style="{style}"]</p>}
          </div>
          <Section title={t('scenes.tooltip.background')}>
            <TextureRow store={store} id={ids[0]} />
          </Section>
          <Section title={t('scenes.tooltip.frame')}>
            <TextureRow store={store} id={ids[1]} />
          </Section>
        </>
      }
    />
  );
}
