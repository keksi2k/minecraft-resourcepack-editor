import { useMemo, useState } from 'react';
import type { AssetStore } from '../assets/AssetStore';
import { useT } from '../i18n';
import { layerUVRects, type TexturePick } from '../render/entityMesh';
import { TextureThumb } from './TexturesView';

const COLORS = ['#ef4444', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#a855f7', '#eab308'];

const topPart = (part: string) => part.split('/')[0] || 'root';

/** The clicked pixel, framed, with a ring around it so it is easy to find; white on a black outline. */
function PickMarker({ pick, w, h }: { pick: TexturePick; w: number; h: number }) {
  const pw = w / pick.width;
  const ph = h / pick.height;
  const x = pick.x * pw;
  const y = pick.y * ph;
  const line = Math.max(w, h) / 300;
  const ring = Math.max(w, h) / 40;
  const shapes = (stroke: string, width: number) => (
    <>
      <rect x={x} y={y} width={pw} height={ph} fill="none" stroke={stroke} strokeWidth={width} />
      <circle cx={x + pw / 2} cy={y + ph / 2} r={Math.max(pw, ph) / 2 + ring} fill="none" stroke={stroke} strokeWidth={width} />
    </>
  );
  return (
    <g className="pointer-events-none">
      {shapes('#000', line * 3)}
      {shapes('#fff', line)}
    </g>
  );
}

/**
 * The texture with the regions each model part samples drawn on top, plus a hoverable legend.
 * `pick` marks the pixel clicked in the 3D view and highlights its part.
 */
export function UVOverlay({ store, path, modelKey, pick }: { store: AssetStore; path: string; modelKey: string; pick?: TexturePick }) {
  const t = useT();
  const data = useMemo(() => layerUVRects(modelKey), [modelKey]);
  const [hovered, setHover] = useState<string>();
  const hover = hovered ?? (pick && topPart(pick.part));
  const parts = useMemo(() => [...new Set(data?.rects.map((r) => topPart(r.part)))], [data]);
  if (!data) return null;
  const [w, h] = data.tex;
  const color = (part: string) => COLORS[parts.indexOf(topPart(part)) % COLORS.length];

  return (
    <div className="flex flex-col gap-2">
      <div className="checker relative w-full rounded" style={{ aspectRatio: `${w} / ${h}` }}>
        <TextureThumb store={store} path={path} className="absolute inset-0 h-full w-full [&_img]:h-full [&_img]:w-full" />
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {data.rects.map((r, i) => {
            const active = !hover || hover === topPart(r.part);
            return (
              <rect
                key={i}
                x={r.x0}
                y={r.y0}
                width={r.x1 - r.x0}
                height={r.y1 - r.y0}
                fill={color(r.part)}
                fillOpacity={hover && active ? (hovered ? 0.35 : 0.2) : 0.12}
                stroke={color(r.part)}
                strokeOpacity={active ? 1 : 0.15}
                strokeWidth={Math.max(w, h) / 400}
                onMouseEnter={() => setHover(topPart(r.part))}
                onMouseLeave={() => setHover(undefined)}
              >
                <title>{r.part}</title>
              </rect>
            );
          })}
          {pick && <PickMarker pick={pick} w={w} h={h} />}
        </svg>
      </div>
      <div className="flex flex-wrap gap-1">
        {parts.map((p) => (
          <span
            key={p}
            onMouseEnter={() => setHover(p)}
            onMouseLeave={() => setHover(undefined)}
            className={`cursor-default rounded px-1.5 py-0.5 text-[10px] ${hover === p ? 'bg-neutral-600' : 'bg-neutral-800'}`}
          >
            <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: color(p) }} />
            {p.replace(/_/g, ' ')}
          </span>
        ))}
      </div>
      {pick && (
        <div className="text-[11px] text-neutral-300">
          {t('mobs.picked', { x: pick.x, y: pick.y, part: pick.part.replace(/_/g, ' ') || 'root' })}
        </div>
      )}
      <div className="text-[10px] text-neutral-500">
        {t('mobs.uvHint', { w, h })}
      </div>
    </div>
  );
}
