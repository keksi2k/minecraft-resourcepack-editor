import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { drawAnimationFrame, parseAnimation, subscribeTicks } from '../render/animation';
import { blankPixels, isIdentity, remapFrameOrder, splitFrames, stackFrames } from '../render/frames';
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
import { decodeImage, encodePng } from '../render/png';
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

/** Paints pixels onto a 1:1 canvas, used as the source for scaled drawing. */
function toCanvas(p: Pixels, into?: HTMLCanvasElement): HTMLCanvasElement {
  const c = into ?? document.createElement('canvas');
  if (c.width !== p.width) c.width = p.width;
  if (c.height !== p.height) c.height = p.height;
  c.getContext('2d')!.putImageData(new ImageData(p.data, p.width, p.height), 0, 0);
  return c;
}

const sameColor = (a: RGBA, b: RGBA) => a.every((v, i) => v === b[i]);

/** An undo step: the whole sheet (its height changes when frames are added or removed). */
interface Snapshot {
  data: Uint8ClampedArray;
  height: number;
  origin: number[];
}

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
  // animated textures: frame height, the frame being edited, and how frames are shown
  const [fh, setFh] = useState(1);
  const [cur, setCur] = useState(0);
  const [sheetView, setSheetView] = useState(false);
  const [onion, setOnion] = useState(false);
  const [playing, setPlaying] = useState(false);
  /** Old index of every frame (-1 for added ones), to keep a custom frame order in the .mcmeta valid. */
  const origin = useRef<number[]>([]);
  const undo = useRef<Snapshot[]>([]);
  const redo = useRef<Snapshot[]>([]);
  const dirty = useRef(false);
  const stroke = useRef<{ last: [number, number]; erase: boolean } | null>(null);
  const lastPoint = useRef<[number, number]>();
  const view = useRef<HTMLCanvasElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const src = useRef<HTMLCanvasElement>();
  const area = useRef<HTMLDivElement>(null);
  const live = useRef<Awaited<ReturnType<typeof previewTexture>>>();
  const liveFrame = useRef(0);
  const metaAnim = store?.json<any>(`${path}.mcmeta`)?.animation;

  useEffect(() => {
    decodeImage(bytes).then(
      (p) => {
        // vertical strips are edited frame by frame; other sheets as a whole
        const anim = parseAnimation(metaAnim, p.width, p.height);
        const frameH = anim && anim.columns === 1 ? anim.fh : p.height;
        setFh(frameH);
        origin.current = Array.from({ length: Math.floor(p.height / frameH) }, (_, i) => i);
        setImg(p);
        // fit the frame (not the whole animation strip) into the editing area
        const box = area.current?.getBoundingClientRect();
        const fit = box ? Math.min((box.width - 48) / p.width, (box.height - 48) / frameH) : 560 / p.width;
        const z = Math.max(1, Math.min(48, Math.floor(fit), Math.floor(MAX_CANVAS / Math.max(p.width, p.height))));
        setZoom(z);
        const c = usedColors(p, 1)[0];
        if (c) setColor(c);
      },
      (e) => setError((e as Error).message),
    );
  }, [bytes]);

  const frames = img ? Math.max(1, Math.floor(img.height / fh)) : 1;
  const animated = frames > 1;
  const single = animated && !sheetView;
  const region = { y0: single ? cur * fh : 0, h: single ? fh : (img?.height ?? 1) };
  useEffect(() => {
    if (cur >= frames) setCur(frames - 1);
  }, [cur, frames]);

  /** Limits an operation to the frame being edited (in single-frame view). */
  const scoped = useCallback(
    (fn: (p: Pixels) => void | boolean) =>
      (p: Pixels): void | boolean => {
        if (!single) return fn(p);
        const row = p.width * 4;
        const start = cur * fh * row;
        const part = { width: p.width, height: fh, data: p.data.slice(start, start + fh * row) };
        if (fn(part) === false) return false;
        p.data.set(part.data, start);
      },
    [single, cur, fh],
  );

  /** Pixels a colour adjustment touches: the current frame in single-frame view. */
  const frameMask = useMemo(() => {
    if (!img || !single) return undefined;
    const m = new Uint8Array(img.width * img.height);
    m.fill(1, cur * fh * img.width, (cur + 1) * fh * img.width);
    return m;
  }, [img, single, cur, fh]);

  /** What's shown: the image, with an unapplied colour adjustment previewed on top. */
  const shown = useMemo(() => {
    if (!img || hsl.every((v) => v === 0)) return img;
    const p = copyPixels(img);
    adjustHsl(p, ...hsl, frameMask);
    return p;
  }, [img, rev, hsl, frameMask]);

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

  // redraw the zoomed view: the current frame (with the previous one faintly below it), or the whole sheet
  useEffect(() => {
    const c = view.current;
    if (!c || !shown) return;
    src.current = toCanvas(shown, src.current);
    const w = shown.width * zoom;
    const h = region.h * zoom;
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, w, h);
    if (single && onion) {
      g.globalAlpha = 0.3;
      g.drawImage(src.current, 0, ((cur - 1 + frames) % frames) * fh, shown.width, fh, 0, 0, w, h);
      g.globalAlpha = 1;
    }
    g.drawImage(src.current, 0, region.y0, shown.width, region.h, 0, 0, w, h);
    if (grid && zoom >= 6) {
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 1; x < shown.width; x++) g.moveTo(x * zoom + 0.5, 0), g.lineTo(x * zoom + 0.5, h);
      for (let y = 1; y < region.h; y++) g.moveTo(0, y * zoom + 0.5), g.lineTo(w, y * zoom + 0.5);
      g.stroke();
    }
    if (animated && !single) {
      g.strokeStyle = 'rgba(16,185,129,0.9)';
      g.lineWidth = 2;
      g.beginPath();
      for (let f = 1; f < frames; f++) g.moveTo(0, f * fh * zoom), g.lineTo(w, f * fh * zoom);
      g.stroke();
    }
    if (hover) {
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 1;
      const off = tool === 'pencil' || tool === 'eraser' ? Math.floor((size - 1) / 2) : 0;
      const s = tool === 'pencil' || tool === 'eraser' ? size : 1;
      g.strokeRect((hover[0] - off) * zoom + 0.5, (hover[1] - region.y0 - off) * zoom + 0.5, s * zoom - 1, s * zoom - 1);
    }
  }, [shown, rev, zoom, grid, hover, frames, fh, tool, size, single, onion, cur, region.y0, region.h, animated]);

  // the frame order as it will be saved, for playing the animation in the preview
  const playAnim = useMemo(() => {
    if (!img || !animated || !metaAnim || typeof metaAnim !== 'object') return undefined;
    const order = Array.isArray(metaAnim.frames) ? remapFrameOrder(metaAnim.frames, origin.current) : undefined;
    return parseAnimation({ ...metaAnim, frames: order }, img.width, img.height);
    // origin changes together with rev
  }, [img, animated, metaAnim, rev]);

  // small preview: the current frame at a readable size, optionally tiled 3×3 like a block surface; or the animation
  useEffect(() => {
    const c = preview.current;
    if (!c || !shown || !src.current) return;
    const n = tile ? 3 : 1;
    const scale = Math.max(1, Math.floor(120 / (shown.width * n)));
    c.width = shown.width * n;
    c.height = fh * n;
    c.style.width = `${shown.width * n * scale}px`;
    c.style.height = `${fh * n * scale}px`;
    const g = c.getContext('2d')!;
    const frame = document.createElement('canvas');
    frame.width = shown.width;
    frame.height = fh;
    const fg = frame.getContext('2d')!;
    const draw = (ticks?: number) => {
      if (ticks !== undefined && playAnim) drawAnimationFrame(fg, src.current!, playAnim, ticks);
      else {
        fg.clearRect(0, 0, shown.width, fh);
        fg.drawImage(src.current!, 0, (animated ? cur : 0) * fh, shown.width, fh, 0, 0, shown.width, fh);
      }
      g.clearRect(0, 0, c.width, c.height);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) g.drawImage(frame, x * shown.width, y * fh);
    };
    if (playing && playAnim) return subscribeTicks((ticks) => draw(ticks));
    draw();
  }, [shown, rev, tile, fh, cur, animated, playing, playAnim]);

  const commit = useCallback(() => {
    dirty.current = true;
    useEditor.setState({ dirty: true });
    setRev((r) => r + 1);
    if (!stroke.current) setPaletteRev((r) => r + 1);
  }, []);

  const snapshot = (p: Pixels): Snapshot => ({ data: p.data.slice(), height: p.height, origin: [...origin.current] });
  const remember = (s: Snapshot) => {
    undo.current.push(s);
    if (undo.current.length > HISTORY) undo.current.shift();
    redo.current = [];
  };

  /** Saves the current state for undo, then lets `fn` change the image. */
  const edit = useCallback(
    (fn: (p: Pixels) => void | boolean) => {
      if (!img) return;
      const before = snapshot(img);
      if (fn(img) === false) return;
      remember(before);
      commit();
    },
    [img, commit],
  );

  /** Replaces the frames (added, removed, moved); `from` is the old index of each new frame (-1 = new). */
  const setFrames = (list: Pixels[], from: number[], select: number) => {
    if (!img) return;
    remember(snapshot(img));
    origin.current = from.map((i) => (i < 0 ? -1 : origin.current[i]));
    setImg(stackFrames(list, img.width, fh));
    setCur(Math.max(0, Math.min(list.length - 1, select)));
    commit();
  };
  const frameOps = img && {
    add: () => {
      const list = splitFrames(img, fh);
      const ids = list.map((_, i) => i);
      list.splice(cur + 1, 0, blankPixels(img.width, fh));
      ids.splice(cur + 1, 0, -1);
      setFrames(list, ids, cur + 1);
    },
    duplicate: () => {
      const list = splitFrames(img, fh);
      const ids = list.map((_, i) => i);
      list.splice(cur + 1, 0, copyPixels(list[cur]));
      ids.splice(cur + 1, 0, -1);
      setFrames(list, ids, cur + 1);
    },
    remove: () => {
      const list = splitFrames(img, fh);
      const ids = list.map((_, i) => i);
      list.splice(cur, 1);
      ids.splice(cur, 1);
      setFrames(list, ids, cur);
    },
    move: (by: -1 | 1) => {
      const to = cur + by;
      if (to < 0 || to >= frames) return;
      const list = splitFrames(img, fh);
      const ids = list.map((_, i) => i);
      [list[cur], list[to]] = [list[to], list[cur]];
      [ids[cur], ids[to]] = [ids[to], ids[cur]];
      setFrames(list, ids, to);
    },
  };

  const step = (from: typeof undo, to: typeof undo) => {
    const prev = from.current.pop();
    if (!img || !prev) return;
    to.current.push(snapshot(img));
    origin.current = prev.origin;
    if (prev.height === img.height) img.data.set(prev.data);
    else setImg({ width: img.width, height: prev.height, data: prev.data });
    commit();
  };

  const useColor = (c: RGBA) => {
    setColor(c);
    setRecent((r) => [c, ...r.filter((x) => !sameColor(x, c))].slice(0, 12));
  };

  /** Pixel under the pointer, in sheet coordinates. */
  const pixelAt = (e: React.PointerEvent): [number, number] => {
    const r = view.current!.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * img!.width), region.y0 + Math.floor(((e.clientY - r.top) / r.height) * region.h)];
  };
  const inside = ([x, y]: [number, number]) => !!img && x >= 0 && x < img.width && y >= region.y0 && y < region.y0 + region.h;
  /** Draws a line, kept inside the current frame in single-frame view. */
  const line = (p: Pixels, a: [number, number], b: [number, number], c: RGBA) =>
    scoped((q) => drawLine(q, a[0], a[1] - (single ? region.y0 : 0), b[0], b[1] - (single ? region.y0 : 0), c, size))(p);

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
      if (single) edit(scoped((px) => floodFill(px, p[0], p[1] - region.y0, color, !fillAll, tolerance) > 0));
      else {
        const f = Math.floor(p[1] / fh) * fh;
        edit((px) => floodFill(px, p[0], p[1], color, !fillAll, tolerance, { y0: f, y1: f + fh }) > 0);
      }
      useColor(color);
      return;
    }
    const erase = active === 'eraser';
    const c: RGBA = erase ? [0, 0, 0, 0] : color;
    const from = e.shiftKey && lastPoint.current && inside(lastPoint.current) ? lastPoint.current : p;
    edit((px) => line(px, from, p, c));
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
    line(img, s.last, p, s.erase ? [0, 0, 0, 0] : color);
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
      // a custom frame order has to follow frames that were moved, added or removed
      if (metaAnim && Array.isArray(metaAnim.frames) && !isIdentity(origin.current, frames)) {
        const meta = store!.json<any>(`${path}.mcmeta`);
        const next = { ...meta, animation: { ...metaAnim, frames: remapFrameOrder(metaAnim.frames, origin.current) } };
        setFile(`${path}.mcmeta`, new TextEncoder().encode(JSON.stringify(next, null, 2)));
      }
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
    if (animated && (k === ',' || k === '.')) return setCur((c) => (c + (k === ',' ? frames - 1 : 1)) % frames);
    const found = TOOLS.find(([, , key]) => key === k);
    if (found && !e.ctrlKey && !e.metaKey) setTool(found[0]);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current?.(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const adjusting = hsl.some((v) => v !== 0);
  const square = !!img && img.width === fh;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <span className="font-semibold">{t('editor.texture.title')}</span>
        <span className="min-w-0 truncate font-mono text-xs text-neutral-400">{path}</span>
        {img && (
          <span className="text-xs text-neutral-500">
            {img.width}×{img.height}
            {animated && ` · ${t('editor.texture.frames', { count: frames })}`}
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
        <span className="text-neutral-500">{hover && t('editor.texture.position', { x: hover[0], y: hover[1] - region.y0 })}</span>
        {animated && sheetView && <span className="ml-auto text-[11px] text-neutral-500">{t('editor.texture.framesHint')}</span>}
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
          <Section title={single ? t('editor.texture.transformFrame') : t('editor.texture.transform')}>
            <div className="flex flex-wrap gap-1">
              <Btn onClick={() => edit(scoped((p) => flip(p, 'h', fh)))}>{t('editor.texture.flipH')}</Btn>
              <Btn onClick={() => edit(scoped((p) => flip(p, 'v', fh)))}>{t('editor.texture.flipV')}</Btn>
              <Btn onClick={() => edit(scoped((p) => rotate(p, true, fh)))} disabled={!square} title={square ? undefined : t('editor.texture.rotateHint')}>
                {t('editor.texture.rotateCw')}
              </Btn>
              <Btn onClick={() => edit(scoped((p) => rotate(p, false, fh)))} disabled={!square} title={square ? undefined : t('editor.texture.rotateHint')}>
                {t('editor.texture.rotateCcw')}
              </Btn>
            </div>
            <div className="text-neutral-400">{t('editor.texture.shift')}</div>
            <div className="flex gap-1">
              <Btn onClick={() => edit(scoped((p) => shift(p, -1, 0, fh)))}>←</Btn>
              <Btn onClick={() => edit(scoped((p) => shift(p, 1, 0, fh)))}>→</Btn>
              <Btn onClick={() => edit(scoped((p) => shift(p, 0, -1, fh)))}>↑</Btn>
              <Btn onClick={() => edit(scoped((p) => shift(p, 0, 1, fh)))}>↓</Btn>
            </div>
          </Section>
          <Section title={single ? t('editor.texture.adjustFrame') : t('editor.texture.adjust')}>
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
                    edit((p) => adjustHsl(p, ...hsl, frameMask));
                    setHsl([0, 0, 0]);
                  }}
                >
                  {t('editor.texture.applyAdjust')}
                </Btn>
                <Btn onClick={() => setHsl([0, 0, 0])}>{t('editor.texture.resetAdjust')}</Btn>
              </div>
            )}
            <div className="flex gap-1">
              <Btn onClick={() => edit(scoped(grayscale))} disabled={adjusting}>{t('editor.texture.grayscale')}</Btn>
              <Btn onClick={() => edit(scoped(invert))} disabled={adjusting}>{t('editor.texture.invert')}</Btn>
            </div>
          </Section>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={area} className="relative min-h-0 flex-1 overflow-auto bg-neutral-900 p-6" onContextMenu={(e) => e.preventDefault()}>
            {img && (
              <canvas
                ref={view}
                className="checker mx-auto block cursor-crosshair touch-none shadow-lg"
                style={{ width: img.width * zoom, height: region.h * zoom }}
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
          {img && animated && frameOps && (
            <div className="flex flex-col gap-1.5 border-t border-neutral-800 bg-neutral-950 px-3 py-2 text-xs">
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 font-medium text-neutral-300">{t('editor.texture.frameOf', { n: cur + 1, count: frames })}</span>
                <Btn onClick={() => setPlaying(!playing)} disabled={!playAnim}>{playing ? `⏸ ${t('editor.texture.pause')}` : `▶ ${t('editor.texture.play')}`}</Btn>
                <Btn onClick={frameOps.add} title={t('editor.texture.addFrameTitle')}>{t('editor.texture.addFrame')}</Btn>
                <Btn onClick={frameOps.duplicate} title={t('editor.texture.duplicateFrameTitle')}>{t('editor.texture.duplicateFrame')}</Btn>
                <Btn onClick={() => frameOps.move(-1)} disabled={cur === 0} title={t('editor.texture.moveFrameLeft')}>◀</Btn>
                <Btn onClick={() => frameOps.move(1)} disabled={cur === frames - 1} title={t('editor.texture.moveFrameRight')}>▶</Btn>
                <Btn onClick={frameOps.remove} tone="danger" disabled={frames <= 2} title={t('editor.texture.removeFrameTitle')}>{t('editor.texture.removeFrame')}</Btn>
                <label className="ml-2 flex items-center gap-1" title={t('editor.texture.onionTitle')}>
                  <input type="checkbox" checked={onion} onChange={(e) => setOnion(e.target.checked)} disabled={sheetView} />
                  {t('editor.texture.onion')}
                </label>
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={sheetView} onChange={(e) => setSheetView(e.target.checked)} />
                  {t('editor.texture.sheetView')}
                </label>
              </div>
              <div className="flex gap-1 overflow-x-auto pb-1">
                {Array.from({ length: frames }, (_, i) => (
                  <FrameThumb key={i} img={img} fh={fh} index={i} rev={rev} active={i === cur} onClick={() => setCur(i)} />
                ))}
              </div>
              <p className="text-[11px] text-neutral-500">{t('editor.texture.framesStripHint')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FrameThumb({ img, fh, index, rev, active, onClick }: { img: Pixels; fh: number; index: number; rev: number; active: boolean; onClick: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = img.width;
    c.height = fh;
    const row = img.width * 4;
    c.getContext('2d')!.putImageData(new ImageData(img.data.slice(index * fh * row, (index + 1) * fh * row), img.width, fh), 0, 0);
  }, [img, fh, index, rev]);
  const scale = 40 / Math.max(img.width, fh);
  return (
    <button
      onClick={onClick}
      className={`relative shrink-0 rounded p-0.5 ring-1 ${active ? 'bg-neutral-600 ring-emerald-500' : 'bg-neutral-800 ring-transparent hover:bg-neutral-700'}`}
    >
      <canvas ref={ref} className="checker pixelated block" style={{ width: img.width * scale, height: fh * scale }} />
      <span className="absolute bottom-0 right-0.5 font-mono text-[9px] text-neutral-300">{index + 1}</span>
    </button>
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
