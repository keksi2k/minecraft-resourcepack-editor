import { useEffect, useMemo, useState } from 'react';
import type { AssetStore } from '../assets/AssetStore';
import { useT } from '../i18n';
import { downloadBlob } from '../pack/exportPack';
import { loadTexture } from '../render/textures';
import type { ResolvedModel } from '../models/modelResolver';
import { textureLabel } from '../models/resourceLocation';
import { defaultScale, drawTemplate, modelTemplates, type UVTemplate } from '../render/uvTemplate';
import { Btn } from './common';

const SCALES = [1, 2, 4, 8, 16, 32];

/** Preview and download of a UV template for one texture of a model. */
export function UVTemplateExport({ store, template, texture, name }: { store: AssetStore; template: UVTemplate; texture: string; name: string }) {
  const t = useT();
  const [mode, setMode] = useState<'blank' | 'texture'>('blank');
  const [scale, setScale] = useState(() => defaultScale(template.size));
  const [canvas, setCanvas] = useState<HTMLCanvasElement>();

  useEffect(() => {
    let alive = true;
    void (async () => {
      const bg = mode === 'texture' ? await loadTexture(store, texture) : undefined;
      if (alive) setCanvas(drawTemplate(template, scale, bg && !bg.missing ? bg.canvas : undefined));
    })();
    return () => {
      alive = false;
    };
  }, [store, template, texture, mode, scale]);

  const download = () =>
    canvas?.toBlob((blob) => blob && downloadBlob(blob, `${name.replace(/[^\w.-]+/g, '_')}_uv${mode === 'texture' ? '_over' : ''}_x${scale}.png`), 'image/png');
  const [w, h] = template.size;
  const preview = useMemo(() => canvas?.toDataURL(), [canvas]);

  return (
    <div className="flex flex-col gap-2 rounded bg-neutral-950 p-2 text-xs">
      {preview && <img src={preview} alt="" className="checker pixelated w-full rounded" style={{ aspectRatio: `${w} / ${h}` }} draggable={false} />}
      <div className="flex flex-wrap items-center gap-2">
        <select value={mode} onChange={(e) => setMode(e.target.value as 'blank' | 'texture')} className="rounded bg-neutral-800 px-1 py-0.5">
          <option value="blank">{t('uvTemplate.blank')}</option>
          <option value="texture">{t('uvTemplate.overTexture')}</option>
        </select>
        <select value={scale} onChange={(e) => setScale(+e.target.value)} className="rounded bg-neutral-800 px-1 py-0.5" title={t('uvTemplate.scaleTitle')}>
          {SCALES.map((s) => (
            <option key={s} value={s}>
              ×{s} ({w * s}×{h * s})
            </option>
          ))}
        </select>
        <Btn tone="primary" onClick={download} disabled={!canvas}>
          {t('uvTemplate.download')}
        </Btn>
      </div>
      <p className="text-[11px] text-neutral-500">{t('uvTemplate.hint', { count: new Set(template.faces.map((f) => f.part.split('/')[0])).size, faces: template.faces.length })}</p>
    </div>
  );
}

/** UV templates of a block or item model with elements, one per texture its faces use. */
export function ModelUVTemplates({ store, models, name, revision }: { store: AssetStore; models: ResolvedModel[]; name: string; revision: number }) {
  const t = useT();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const templates = useMemo(() => modelTemplates(store, models), [store, models, revision]);
  const ids = [...templates.keys()];
  const [picked, setPicked] = useState<string>();
  const id = picked && templates.has(picked) ? picked : ids[0];
  if (!id) return null;
  return (
    <div className="flex flex-col gap-2">
      {ids.length > 1 && (
        <select value={id} onChange={(e) => setPicked(e.target.value)} className="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[11px]" title={t('uvTemplate.textureTitle')}>
          {ids.map((x) => (
            <option key={x} value={x}>
              {textureLabel(x)}
            </option>
          ))}
        </select>
      )}
      <UVTemplateExport key={id} store={store} template={templates.get(id)!} texture={id} name={`${name}_${id.slice(id.lastIndexOf('/') + 1)}`} />
    </div>
  );
}
