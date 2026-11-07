import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { parseAnimation } from '../render/animation';
import {
  adjustHsl,
  copyPixels,
  drawLine,
  flip,
  floodFill,
  fromHex,
  getPixel,
  grayscale,
  invert,
  rotate,
  shift,
  toHex,
  usedColors,
  type Pixels,
  type RGBA,
} from '../render/pixelEdit';
import { previewTexture } from '../render/textures';
import { useApp } from '../state/appStore';
import { useEditor } from '../state/editorStore';
import { Btn } from './common';

type Tool = 'pencil' | 'eraser' | 'fill' | 'picker';
const TOOLS: [Tool, string, string][] = [
  ['pencil', '✎', 'b'],
  ['eraser', '⌫', 'e'],
  ['fill', '🪣', 'g'],
  ['picker', '💧', 'i'],
];
const HISTORY = 100;
const MAX_CANVAS = 12000;

async function decodePng(bytes: Uint8Array): Promise<Pixels> {
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  bmp.close();
  const img = g.getImageData(0, 0, c.width, c.height);
  return { width: img.width, height: img.height, data: img.data };
}

async function encodePng(p: Pixels): Promise<Uint8Array> {
  const c = document.createElement('canvas');
  c.width = p.width;
  c.height = p.height;
  c.getContext('2d')!.putImageData(new ImageData(p.data.slice(), p.width, p.height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Paints pixels onto a 1:1 canvas, used as the source for scaled drawing. */
function toCanvas(p: Pixels, into?: HTMLCanvasElement): HTMLCanvasElement {
  const c = into ?? document.createElement('canvas');
  if (c.width !== p.width) c.width = p.width;
  if (c.height !== p.height) c.height = p.height;
  c.getContext('2d')!.putImageData(new ImageData(p.data, p.width, p.height), 0, 0);
  return c;
}

const sameColor = (a: RGBA, b: RGBA) => a.every((v, i) => v === b[i]);

export function TextureEditor({ path, bytes, onDone }: { path: string; bytes: Uint8Array; onDone: () => void }) {
  const t = useT();
  const { store, setFile } = useApp();
  const [img, setImg] = useState<Pixels>();
  const [error, setError] = useState<string>();
  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState<RGBA>([255, 255, 255, 255]);
  const [recent, setRecent] = useState<RGBA[]>([]);
  const [size, setSize] = useState(1);
  const [fillAll, setFillAll] = useState(false);
  const [tolerance, setTolerance] = useState(0);
  const [zoom, setZoom] = useState(16);
  const [grid, setGrid] = useState(true);
  const [tile, setTile] = useState(false);
  const [hsl, setHsl] = useState<[number, number, number]>([0, 0, 0]);
  const [hover, setHover] = useState<[number, number]>();
  const [rev, setRev] = useState(0); // bumped on every change to redraw
  const [saving, setSaving] = useState(false);
  const undo = useRef<Uint8ClampedArray[]>([]);
  const redo = useRef<Uint8ClampedArray[]>([]);
  const dirty = useRef(false);
  const stroke = useRef<{ last: [number, number]; erase: boolean } | null>(null);
  const lastPoint = useRef<[number, number]>();
  const view = useRef<HTMLCanvasElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const src = useRef<HTMLCanvasElement>();
  const area = useRef<HTMLDivElement>(null);
  const live = useRef<Awaited<ReturnType<typeof previewTexture>>>();
  const liveFrame = useRef(0);

  // frame height of an animated texture (vertical strips), so tools can work per frame
  const frameHeight = useMemo(() => {
    if (!img) return 1;
    const anim = parseAnimation(store?.json<any>(`${path}.mcmeta`)?.animation, img.width, img.height);
    return anim && anim.columns === 1 ? anim.fh : img.height;
  }, [img?.width, img?.height, store, path]);
  const frames = img ? Math.max(1, Math.floor(img.height / frameHeight)) : 1;

  useEffect(() => {
    decodePng(bytes).then(
      (p) => {
        setImg(p);
        // fit the frame (not the whole animation strip) into the editing area
        const box = area.current?.getBoundingClientRect();
        const fh = Math.min(p.height, p.width);
        const fit = box ? Math.min((box.width - 48) / p.width, (box.height - 48) / fh) : 560 / p.width;
        const z = Math.max(1, Math.min(48, Math.floor(fit), Math.floor(MAX_CANVAS / Math.max(p.width, p.height))));
        setZoom(z);
        const c = usedColors(p, 1)[0];
        if (c) setColor(c);
      },
      (e) => setError((e as Error).message),
    );
  }, [bytes]);

  /** What's shown: the image, with an unapplied colour adjustment previewed on top. */
  const shown = useMemo(() => {
    if (!img || hsl.every((v) => v === 0)) return img;
    const p = copyPixels(img);
    adjustHsl(p, ...hsl);
    return p;
  }, [img, rev, hsl]);

  // live preview: the 3D views (and everything else using the decoded texture) follow every change
  useEffect(() => {
    let alive = true;
    let handle: Awaited<ReturnType<typeof previewTexture>>;
    if (store) void previewTexture(store, path).then((h) => {
      handle = h;
      if (alive) live.current = h;
      else h?.restore();
    });
    return () => {
      alive = false;
      cancelAnimationFrame(liveFrame.current);
      live.current = undefined;
      handle?.restore(); // after saving, the saved file replaces this texture anyway
    };
  }, [store, path]);
  const touched = useRef(false);
  useEffect(() => {
    if (!shown) return;
    if (shown !== img || rev) touched.current = true;
    if (!touched.current) return;
    cancelAnimationFrame(liveFrame.current);
    liveFrame.current = requestAnimationFrame(() => live.current?.apply(shown.data, shown.width, shown.height));
  }, [shown, rev, img]);

  // recounted after each stroke, not on every pixel of it
  const [paletteRev, setPaletteRev] = useState(0);
  const palette = useMemo(() => (img ? usedColors(img, 48) : []), [img, paletteRev]);

  // redraw the zoomed view
  useEffect(() => {
    const c = view.current;
    if (!c || !shown) return;
    src.current = toCanvas(shown, src.current);
    const w = shown.width * zoom;
    const h = shown.height * zoom;
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, w, h);
    g.drawImage(src.current, 0, 0, w, h);
    if (grid && zoom >= 6) {
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 1; x < shown.width; x++) g.moveTo(x * zoom + 0.5, 0), g.lineTo(x * zoom + 0.5, h);
      for (let y = 1; y < shown.height; y++) g.moveTo(0, y * zoom + 0.5), g.lineTo(w, y * zoom + 0.5);
      g.stroke();
    }
    if (frames > 1) {
      g.strokeStyle = 'rgba(16,185,129,0.9)';
      g.lineWidth = 2;
      g.beginPath();
      for (let f = 1; f < frames; f++) g.moveTo(0, f * frameHeight * zoom), g.lineTo(w, f * frameHeight * zoom);
      g.stroke();
    }
    if (hover) {
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 1;
      const off = tool === 'pencil' || tool === 'eraser' ? Math.floor((size - 1) / 2) : 0;
      const s = tool === 'pencil' || tool === 'eraser' ? size : 1;
      g.strokeRect((hover[0] - off) * zoom + 0.5, (hover[1] - off) * zoom + 0.5, s * zoom - 1, s * zoom - 1);
    }
  }, [shown, rev, zoom, grid, hover, frames, frameHeight, tool, size]);

  // small preview: first frame at a readable size, optionally tiled 3×3 like a block surface
  useEffect(() => {
    const c = preview.current;
    if (!c || !shown || !src.current) return;
    const n = tile ? 3 : 1;
    const scale = Math.max(1, Math.floor(120 / (shown.width * n)));
    const fw = shown.width * scale;
    const fh = frameHeight * scale;
    c.width = fw * n;
    c.height = fh * n;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) g.drawImage(src.current, 0, 0, shown.width, frameHeight, x * fw, y * fh, fw, fh);
  }, [shown, rev, tile, frameHeight]);

  const commit = useCallback(() => {
    dirty.current = true;
    useEditor.setState({ dirty: true });
    setRev((r) => r + 1);
    if (!stroke.current) setPaletteRev((r) => r + 1);
  }, []);

  /** Saves the current state for undo, then lets `fn` change the image. */
  const edit = useCallback(
    (fn: (p: Pixels) => void | boolean) => {
      if (!img) return;
      const before = img.data.slice();
      if (fn(img) === false) return;
      undo.current.push(before);
      if (undo.current.length > HISTORY) undo.current.shift();
      redo.current = [];
      commit();
    },
    [img, commit],
  );

  const step = (from: typeof undo, to: typeof undo) => {
    const prev = from.current.pop();
    if (!img || !prev) return;
    to.current.push(img.data.slice());
    img.data.set(prev);
    commit();
  };

  const useColor = (c: RGBA) => {
    setColor(c);
    setRecent((r) => [c, ...r.filter((x) => !sameColor(x, c))].slice(0, 12));
  };

  const pixelAt = (e: React.PointerEvent): [number, number] => {
    const r = view.current!.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * img!.width), Math.floor(((e.clientY - r.top) / r.height) * img!.height)];
  };
  const inside = ([x, y]: [number, number]) => !!img && x >= 0 && y >= 0 && x < img.width && y < img.height;

  const onDown = (e: React.PointerEvent) => {
    if (!img || hsl.some((v) => v !== 0)) return;
    e.preventDefault();
    const p = pixelAt(e);
    if (!inside(p)) return;
    const active: Tool = e.altKey ? 'picker' : e.button === 2 ? 'eraser' : tool;
    if (active === 'picker') {
      useColor(getPixel(img, ...p));
      // Alt+click keeps the current tool, so only the picker tool itself hands over to the pencil
      if (tool === 'picker') setTool('pencil');
      return;
    }
    if (active === 'fill') {
      const f = Math.floor(p[1] / frameHeight) * frameHeight;
      edit((px) => floodFill(px, p[0], p[1], color, !fillAll, tolerance, { y0: f, y1: f + frameHeight }) > 0);
      useColor(color);
      return;
    }
    const erase = active === 'eraser';
    const c: RGBA = erase ? [0, 0, 0, 0] : color;
    const from = e.shiftKey && lastPoint.current ? lastPoint.current : p;
    edit((px) => drawLine(px, from[0], from[1], p[0], p[1], c, size));
    stroke.current = { last: p, erase };
    lastPoint.current = p;
    (e.target as Element).setPointerCapture(e.pointerId);
    if (!erase) useColor(color);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!img) return;
    const p = pixelAt(e);
    setHover(inside(p) ? p : undefined);
    const s = stroke.current;
    if (!s || (p[0] === s.last[0] && p[1] === s.last[1])) return;
    drawLine(img, s.last[0], s.last[1], p[0], p[1], s.erase ? [0, 0, 0, 0] : color, size);
    s.last = p;
    lastPoint.current = p;
    commit();
  };

  const onUp = () => {
    if (stroke.current) setPaletteRev((r) => r + 1);
    stroke.current = null;
  };

  const close = () => {
    if (!dirty.current || confirm(t('editor.unsaved'))) onDone();
  };

  const save = async () => {
    if (!img) return;
    setSaving(true);
    try {
      const png = await encodePng(img);
      dirty.current = false;
      useEditor.setState({ dirty: false });
      setFile(path, png);
      onDone();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // keyboard shortcuts
  const keys = useRef<(e: KeyboardEvent) => void>();
  keys.current = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      return e.shiftKey ? step(redo, undo) : step(undo, redo);
    }
    if ((e.ctrlKey || e.metaKey) && k === 'y') {
      e.preventDefault();
      return step(redo, undo);
    }
    if ((e.ctrlKey || e.metaKey) && k === 's') {
      e.preventDefault();
      return void save();
    }
    if (e.key === 'Escape') return close();
    const found = TOOLS.find(([, , key]) => key === k);
    if (found && !e.ctrlKey && !e.metaKey) setTool(found[0]);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current?.(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const adjusting = hsl.some((v) => v !== 0);
  const square = !!img && img.width === frameHeight;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <span className="font-semibold">{t('editor.texture.title')}</span>
        <span className="min-w-0 truncate font-mono text-xs text-neutral-400">{path}</span>
        {img && (
          <span className="text-xs text-neutral-500">
            {img.width}×{img.height}
            {frames > 1 && ` · ${t('editor.texture.frames', { count: frames })}`}
          </span>
        )}
        <div className="ml-auto flex gap-1">
          <Btn onClick={() => step(undo, redo)} disabled={!undo.current.length}>{t('editor.undo')}</Btn>
          <Btn onClick={() => step(redo, undo)} disabled={!redo.current.length}>{t('editor.redo')}</Btn>
          <Btn onClick={close}>{t('editor.cancel')}</Btn>
          <Btn tone="primary" onClick={() => void save()} disabled={!img || saving || adjusting}>
            {saving ? t('editor.saving') : t('editor.save')}
          </Btn>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-3 py-1.5 text-xs">
        <label className="flex items-center gap-2">
          {t('editor.texture.zoom')}
          <input type="range" min={1} max={48} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-32" />
          <span className="w-8">{zoom}×</span>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={grid} onChange={(e) => setGrid(e.target.checked)} />
          {t('editor.texture.grid')}
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={tile} onChange={(e) => setTile(e.target.checked)} />
          {t('editor.texture.tile')}
        </label>
        <span className="text-neutral-500">{hover && t('editor.texture.position', { x: hover[0], y: hover[1] })}</span>
        {frames > 1 && <span className="ml-auto text-[11px] text-neutral-500">{t('editor.texture.framesHint')}</span>}
      </div>
      {error && <div className="m-3 rounded bg-red-950 p-2 text-xs text-red-200">{t('editor.loadFailed', { error })}</div>}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 shrink-0 flex-col gap-3 overflow-y-auto border-r border-neutral-800 p-3 text-xs">
          <div className="grid grid-cols-4 gap-1">
            {TOOLS.map(([id, icon, key]) => (
              <button
                key={id}
                onClick={() => setTool(id)}
                title={`${t(`editor.texture.${id}`)} (${key.toUpperCase()})`}
                className={`rounded py-1.5 text-base ${tool === id ? 'bg-emerald-700' : 'bg-neutral-800 hover:bg-neutral-700'}`}
              >
                {icon}
              </button>
            ))}
          </div>
          <div className="text-neutral-300">{t(`editor.texture.${tool}`)}</div>
          {(tool === 'pencil' || tool === 'eraser') && (
            <label className="flex items-center gap-2">
              {t('editor.texture.size')}
              <input type="range" min={1} max={8} value={size} onChange={(e) => setSize(Number(e.target.value))} className="flex-1" />
              <span className="w-4 text-right">{size}</span>
            </label>
          )}
          {tool === 'fill' && (
            <>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={fillAll} onChange={(e) => setFillAll(e.target.checked)} />
                {t('editor.texture.replaceAll')}
              </label>
              <label className="flex items-center gap-2">
                {t('editor.texture.tolerance')}
                <input type="range" min={0} max={128} value={tolerance} onChange={(e) => setTolerance(Number(e.target.value))} className="flex-1" />
                <span className="w-6 text-right">{tolerance}</span>
              </label>
            </>
          )}
          <div className="flex items-center gap-2">
            <div className="checker h-9 w-9 shrink-0 overflow-hidden rounded ring-1 ring-neutral-600">
              <div className="h-full w-full" style={{ background: `rgba(${color[0]},${color[1]},${color[2]},${color[3] / 255})` }} />
            </div>
            <input type="color" value={toHex(color)} onChange={(e) => setColor(fromHex(e.target.value, color[3]))} className="h-9 w-12 cursor-pointer bg-transparent" />
            <input
              value={toHex(color)}
              onChange={(e) => /^#[0-9a-f]{6}$/i.test(e.target.value) && setColor(fromHex(e.target.value, color[3]))}
              className="w-full rounded bg-neutral-800 px-1 py-1 font-mono"
            />
          </div>
          <label className="flex items-center gap-2">
            {t('editor.texture.alpha')}
            <input type="range" min={0} max={255} value={color[3]} onChange={(e) => setColor([color[0], color[1], color[2], Number(e.target.value)])} className="flex-1" />
            <span className="w-7 text-right">{Math.round((color[3] / 255) * 100)}%</span>
          </label>
          {recent.length > 0 && <Swatches label={t('editor.texture.recent')} colors={recent} current={color} onPick={setColor} />}
          <Swatches label={t('editor.texture.colors')} colors={palette} current={color} onPick={setColor} />
          <p className="text-[11px] leading-snug text-neutral-500">{t('editor.texture.toolHint')}</p>
          <Section title={t('editor.texture.transform')}>
            <div className="flex flex-wrap gap-1">
              <Btn onClick={() => edit((p) => flip(p, 'h', frameHeight))}>{t('editor.texture.flipH')}</Btn>
              <Btn onClick={() => edit((p) => flip(p, 'v', frameHeight))}>{t('editor.texture.flipV')}</Btn>
              <Btn onClick={() => edit((p) => rotate(p, true, frameHeight))} disabled={!square} title={square ? undefined : t('editor.texture.rotateHint')}>
                {t('editor.texture.rotateCw')}
              </Btn>
              <Btn onClick={() => edit((p) => rotate(p, false, frameHeight))} disabled={!square} title={square ? undefined : t('editor.texture.rotateHint')}>
                {t('editor.texture.rotateCcw')}
              </Btn>
            </div>
            <div className="text-neutral-400">{t('editor.texture.shift')}</div>
            <div className="flex gap-1">
              <Btn onClick={() => edit((p) => shift(p, -1, 0, frameHeight))}>←</Btn>
              <Btn onClick={() => edit((p) => shift(p, 1, 0, frameHeight))}>→</Btn>
              <Btn onClick={() => edit((p) => shift(p, 0, -1, frameHeight))}>↑</Btn>
              <Btn onClick={() => edit((p) => shift(p, 0, 1, frameHeight))}>↓</Btn>
            </div>

          </Section>
          <Section title={t('editor.texture.adjust')}>
            {(['hue', 'saturation', 'lightness'] as const).map((k, i) => (
              <label key={k} className="flex items-center gap-2">
                <span className="w-16">{t(`editor.texture.${k}`)}</span>
                <input
                  type="range"
                  min={i === 0 ? -180 : -100}
                  max={i === 0 ? 180 : 100}
                  value={hsl[i]}
                  onChange={(e) => {
                    const next = [...hsl] as [number, number, number];
                    next[i] = Number(e.target.value);
                    setHsl(next);
                  }}
                  className="min-w-0 flex-1"
                />
                <span className="w-8 text-right">{hsl[i]}</span>
              </label>
            ))}
            {adjusting && (
              <div className="flex gap-1">
                <Btn
                  tone="primary"
                  onClick={() => {
                    edit((p) => adjustHsl(p, ...hsl));
                    setHsl([0, 0, 0]);
                  }}
                >
                  {t('editor.texture.applyAdjust')}
                </Btn>
                <Btn onClick={() => setHsl([0, 0, 0])}>{t('editor.texture.resetAdjust')}</Btn>
              </div>
            )}
            <div className="flex gap-1">
              <Btn onClick={() => edit(grayscale)} disabled={adjusting}>{t('editor.texture.grayscale')}</Btn>
              <Btn onClick={() => edit(invert)} disabled={adjusting}>{t('editor.texture.invert')}</Btn>
            </div>
          </Section>
        </aside>

        <div ref={area} className="relative min-w-0 flex-1 overflow-auto bg-neutral-900 p-6" onContextMenu={(e) => e.preventDefault()}>
          {img && (
            <canvas
              ref={view}
              className="checker mx-auto block cursor-crosshair touch-none shadow-lg"
              style={{ width: img.width * zoom, height: img.height * zoom }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              onPointerLeave={() => setHover(undefined)}
            />
          )}
          <canvas
            ref={preview}
            title={t('editor.texture.preview')}
            className="checker pixelated pointer-events-none absolute bottom-3 right-3 rounded shadow-lg ring-1 ring-neutral-700"
          />
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details open className="border-t border-neutral-800 pt-2">
      <summary className="mb-2 cursor-pointer select-none text-neutral-400">{title}</summary>
      <div className="flex flex-col gap-2">{children}</div>
    </details>
  );
}

function Swatches({ label, colors, current, onPick }: { label: string; colors: RGBA[]; current: RGBA; onPick: (c: RGBA) => void }) {
  if (!colors.length) return null;
  return (
    <div>
      <div className="mb-1 text-neutral-400">{label}</div>
      <div className="flex flex-wrap gap-0.5">
        {colors.map((c) => (
          <button
            key={c.join()}
            onClick={() => onPick(c)}
            title={`${toHex(c)} · ${Math.round((c[3] / 255) * 100)}%`}
            className={`checker h-5 w-5 overflow-hidden rounded-sm ${sameColor(c, current) ? 'ring-2 ring-emerald-400' : 'ring-1 ring-neutral-700'}`}
          >
            <span className="block h-full w-full" style={{ background: `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})` }} />
          </button>
        ))}
      </div>
    </div>
  );
}
