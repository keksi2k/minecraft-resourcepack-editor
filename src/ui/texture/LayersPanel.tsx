import { useT } from '../../i18n';
import type { PaintLayer } from '../../render/paintTools';
import { Btn } from '../common';
import { Section } from './parts';

export interface LayerActions {
  select(i: number): void;
  add(): void;
  duplicate(): void;
  remove(): void;
  mergeDown(): void;
  move(by: -1 | 1): void;
  /** Changes name, visibility or opacity; `final` false while a slider is still being dragged. */
  update(i: number, change: Partial<Pick<PaintLayer, 'name' | 'visible' | 'opacity'>>, final?: boolean): void;
}

/** The layer list, top layer first, like in other paint programs. */
export function LayersPanel({ layers, active, actions }: { layers: PaintLayer[]; active: number; actions: LayerActions }) {
  const t = useT();
  const cur = layers[active];
  return (
    <Section title={t('editor.texture.layers')}>
      <div className="flex flex-col gap-0.5" role="listbox" aria-label={t('editor.texture.layers')}>
        {layers
          .map((l, i) => ({ l, i }))
          .reverse()
          .map(({ l, i }) => (
            <div
              key={l.id}
              role="option"
              aria-selected={i === active}
              onClick={() => actions.select(i)}
              className={`flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 ${i === active ? 'bg-emerald-900/60 ring-1 ring-emerald-600' : 'bg-neutral-800/60 hover:bg-neutral-800'}`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  actions.update(i, { visible: !l.visible });
                }}
                title={l.visible ? t('editor.texture.hideLayer') : t('editor.texture.showLayer')}
                className={`w-5 shrink-0 text-center ${l.visible ? '' : 'opacity-30'}`}
              >
                👁
              </button>
              {i === active ? (
                <input
                  value={l.name}
                  onChange={(e) => actions.update(i, { name: e.target.value })}
                  aria-label={t('editor.texture.layerName')}
                  className="min-w-0 flex-1 rounded bg-neutral-900 px-1"
                />
              ) : (
                <span className="min-w-0 flex-1 truncate">{l.name}</span>
              )}
              {l.opacity < 100 && <span className="text-[10px] text-neutral-400">{l.opacity}%</span>}
            </div>
          ))}
      </div>
      {cur && (
        <label className="flex items-center gap-2">
          {t('editor.texture.layerOpacity')}
          <input
            type="range"
            min={0}
            max={100}
            value={cur.opacity}
            onChange={(e) => actions.update(active, { opacity: Number(e.target.value) }, false)}
            onPointerUp={(e) => actions.update(active, { opacity: Number((e.target as HTMLInputElement).value) })}
            onKeyUp={(e) => actions.update(active, { opacity: Number((e.target as HTMLInputElement).value) })}
            className="min-w-0 flex-1"
          />
          <span className="w-8 text-right">{cur.opacity}%</span>
        </label>
      )}
      <div className="flex flex-wrap gap-1">
        <Btn onClick={actions.add} title={t('editor.texture.addLayerTitle')}>{t('editor.texture.addLayer')}</Btn>
        <Btn onClick={actions.duplicate} title={t('editor.texture.duplicateLayerTitle')}>⧉</Btn>
        <Btn onClick={() => actions.move(1)} disabled={active >= layers.length - 1} title={t('editor.texture.layerUp')}>▲</Btn>
        <Btn onClick={() => actions.move(-1)} disabled={active <= 0} title={t('editor.texture.layerDown')}>▼</Btn>
        <Btn onClick={actions.mergeDown} disabled={active <= 0} title={t('editor.texture.mergeDownTitle')}>{t('editor.texture.mergeDown')}</Btn>
        <Btn onClick={actions.remove} tone="danger" disabled={layers.length <= 1} title={t('editor.texture.removeLayer')}>✕</Btn>
      </div>
      {layers.length > 1 && <p className="text-[11px] leading-snug text-neutral-500">{t('editor.texture.layersHint')}</p>}
    </Section>
  );
}
