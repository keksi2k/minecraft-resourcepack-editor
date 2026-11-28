import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { drawAnimationFrame, parseAnimation, subscribeTicks } from '../render/animation';
import { blankPixels, isIdentity, remapFrameOrder, splitFrames, stackFrames } from '../render/frames';
import {
  clearRect,
  constrain,
  copyRect,
  drawRect,
  flatten,
  intersect,
  mergeInto,
  paste,
  putRect,
  rectBetween,
  rectMask,
  replaceColor,
  restoreRect,
  shapeBounds,
  type PaintLayer,
  type Rect,
} from '../render/paintTools';
import { snapToPalette } from '../render/palettes';
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
import { isPenEraser, PinchTracker } from './gestures';
import { previewTexture } from '../render/textures';
import { useApp } from '../state/appStore';
import { useEditor } from '../state/editorStore';
import { Btn } from './common';
import { LayersPanel, type LayerActions } from './texture/LayersPanel';
import { PalettePanel } from './texture/PalettePanel';
import { ReplaceColorPanel } from './texture/ReplaceColorPanel';
import { css, HexInput, sameColor, Section, Swatches } from './texture/parts';

type Tool = 'pencil' | 'eraser' | 'fill' | 'picker' | 'line' | 'rect' | 'select' | 'move';
const TOOLS: [Tool, string, string][] = [
  ['pencil', '✎', 'b'],
  ['eraser', '⌫', 'e'],
  ['fill', '🪣', 'g'],
  ['picker', '💧', 'i'],
  ['line', '╱', 'l'],
  ['rect', '▭', 'r'],
  ['select', '⬚', 'm'],
  ['move', '✥', 'v'],
];
const BRUSH: Tool[] = ['pencil', 'eraser', 'line', 'rect'];
const HISTORY = 100;
const MAX_CANVAS = 12000;
const CLEAR: RGBA = [0, 0, 0, 0];

/** Copied pixels; kept while the editor is closed, so they can go into another texture. */
let clipboard: Pixels | undefined;

/** Paints pixels onto a 1:1 canvas, used as the source for scaled drawing. */
function toCanvas(p: Pixels, into?: HTMLCanvasElement): HTMLCanvasElement {
  const c = into ?? document.createElement('canvas');
  if (c.width !== p.width) c.width = p.width;
  if (c.height !== p.height) c.height = p.height;
  c.getContext('2d')!.putImageData(new ImageData(p.data, p.width, p.height), 0, 0);
  return c;
}

/** An undo step: every layer (the sheet's height changes when frames are added or removed). */
interface Snapshot {
  layers: (Omit<PaintLayer, 'px'> & { data: Uint8ClampedArray })[];
  height: number;
  active: number;
  origin: number[];
}

/** A drag with the line, rectangle, selection or move tool. */
type Drag =
  | { kind: 'line' | 'rect'; start: [number, number]; base: Uint8ClampedArray; last: Rect; color: RGBA; clip?: Rect }
  | { kind: 'select'; start: [number, number]; moved: boolean }
  | { kind: 'move'; start: [number, number]; base: Uint8ClampedArray; piece: Pixels; from: Rect; last: Rect; clip: Rect; withSel: boolean };

export function TextureEditor({ path, bytes, onDone }: { path: string; bytes: Uint8Array; onDone: () => void }) {
  const t = useT();
  const { store, setFile } = useApp();
  const [layers, setLayers] = useState<PaintLayer[]>([]);
  const [active, setActive] = useState(0);
  const [error, setError] = useState<string>();
  const [tool, setTool] = useState<Tool>('pencil');
  const [color, setColor] = useState<RGBA>([255, 255, 255, 255]);
  const [recent, setRecent] = useState<RGBA[]>([]);
  const [size, setSize] = useState(1);
  const [fillAll, setFillAll] = useState(false);
  const [filledRect, setFilledRect] = useState(false);
  const [tolerance, setTolerance] = useState(0);
  const [zoom, setZoom] = useState(16);
  const [grid, setGrid] = useState(true);
  const [tile, setTile] = useState(false);
  const [hsl, setHsl] = useState<[number, number, number]>([0, 0, 0]);
  const [hover, setHover] = useState<[number, number]>();
  const [rev, setRev] = useState(0); // bumped on every change to redraw
  const [saving, setSaving] = useState(false);
  /** The selection, relative to the shown area (the current frame, or the whole sheet). */
  const [selRel, setSelRel] = useState<Rect>();
  const [hasClip, setHasClip] = useState(!!clipboard);
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
  const stroke = useRef<{ last: [number, number]; erase: boolean; clip?: Rect } | null>(null);
  const drag = useRef<Drag | null>(null);
  const lastPoint = useRef<[number, number]>();
  const nextId = useRef(2);
  const view = useRef<HTMLCanvasElement>(null);
  const preview = useRef<HTMLCanvasElement>(null);
  const src = useRef<HTMLCanvasElement>();
  const area = useRef<HTMLDivElement>(null);
  const live = useRef<Awaited<ReturnType<typeof previewTexture>>>();
  const liveFrame = useRef(0);
  const metaAnim = store?.json<any>(`${path}.mcmeta`)?.animation;

  const img: Pixels | undefined = layers[active]?.px;
  const W = layers[0]?.px.width ?? 1;
  const H = layers[0]?.px.height ?? 1;

  useEffect(() => {
    decodeImage(bytes).then(
      (p) => {
        // vertical strips are edited frame by frame; other sheets as a whole
        const anim = parseAnimation(metaAnim, p.width, p.height);
        const frameH = anim && anim.columns === 1 ? anim.fh : p.height;
        setFh(frameH);
        origin.current = Array.from({ length: Math.floor(p.height / frameH) }, (_, i) => i);
        setLayers([{ id: 1, name: t('editor.texture.layerN', { n: 1 }), px: p, visible: true, opacity: 100 }]);
        setActive(0);
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

  const frames = layers.length ? Math.max(1, Math.floor(H / fh)) : 1;
  const animated = frames > 1;
  const single = animated && !sheetView;
  const region = { y0: single ? cur * fh : 0, h: single ? fh : H };
  const regionRect: Rect = { x: 0, y: region.y0, w: W, h: region.h };
  /** The selection in sheet pixels, cut to what's shown. */
  const sel = selRel ? intersect({ ...selRel, y: selRel.y + region.y0 }, regionRect) : undefined;
  useEffect(() => {
    if (cur >= frames) setCur(frames - 1);
  }, [cur, frames]);
  // the whole sheet and a single frame don't share a selection
  useEffect(() => setSelRel(undefined), [sheetView]);

  /** The frame (sheet view: the frame under `y`) painting is kept inside, cut to the selection. */
  const limitAt = (y: number): Rect | undefined => {
    const frame = single ? regionRect : animated ? { x: 0, y: Math.floor(y / fh) * fh, w: W, h: fh } : undefined;
    if (sel) return frame ? intersect(frame, sel) : sel;
    return frame;
  };

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

  /** Runs a transform on the selection (if any) or on the frame. */
  const within = (fn: (p: Pixels) => void | boolean) => (p: Pixels) => {
    if (!sel) return scoped(fn)(p);
    const piece = copyRect(p, sel);
    if (fn(piece) === false) return false;
    putRect(p, piece, sel.x, sel.y);
  };

  /** Pixels a colour change touches: the selection, or the current frame in single-frame view. */
  const mask = useMemo(() => {
    if (!layers.length) return undefined;
    if (sel) return rectMask(W, H, sel);
    if (!single) return undefined;
    return rectMask(W, H, regionRect);
  }, [layers.length, W, H, single, cur, fh, sel?.x, sel?.y, sel?.w, sel?.h]);

  const adjusting = hsl.some((v) => v !== 0);
  /** What all visible layers make together. */
  const flat = useMemo(() => (layers.length ? flatten(layers, W, H) : undefined), [layers, rev, W, H]);
  /** What's shown: the picture, with an unapplied colour adjustment previewed on the active layer. */
  const shown = useMemo(() => {
    if (!img || !adjusting) return flat;
    const p = copyPixels(img);
    adjustHsl(p, ...hsl, mask);
    return flatten(
      layers.map((l, i) => (i === active ? { ...l, px: p } : l)),
      W,
      H,
    );
  }, [flat, layers, rev, hsl, mask, active]);

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
    if (adjusting || rev) touched.current = true;
    if (!touched.current) return;
    cancelAnimationFrame(liveFrame.current);
    liveFrame.current = requestAnimationFrame(() => live.current?.apply(shown.data, shown.width, shown.height));
  }, [shown, rev, adjusting]);

  // recounted after each stroke, not on every pixel of it
  const [paletteRev, setPaletteRev] = useState(0);
  const palette = useMemo(() => (flat ? usedColors(flat, 48) : []), [flat, paletteRev]);

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
    if (sel) {
      // marching ants without the marching: black and white dashes, readable on any colour
      const r = [sel.x * zoom + 0.5, (sel.y - region.y0) * zoom + 0.5, sel.w * zoom - 1, sel.h * zoom - 1] as const;
      g.lineWidth = 1;
      g.setLineDash([4, 4]);
      g.strokeStyle = '#000';
      g.strokeRect(...r);
      g.lineDashOffset = 4;
      g.strokeStyle = '#fff';
      g.strokeRect(...r);
      g.setLineDash([]);
      g.lineDashOffset = 0;
    }
    if (hover) {
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 1;
      const brush = BRUSH.includes(tool);
      const off = brush ? Math.floor((size - 1) / 2) : 0;
      const s = brush ? size : 1;
      g.strokeRect((hover[0] - off) * zoom + 0.5, (hover[1] - region.y0 - off) * zoom + 0.5, s * zoom - 1, s * zoom - 1);
    }
  }, [shown, rev, zoom, grid, hover, frames, fh, tool, size, single, onion, cur, region.y0, region.h, animated, sel?.x, sel?.y, sel?.w, sel?.h]);

  // the frame order as it will be saved, for playing the animation in the preview
  const playAnim = useMemo(() => {
    if (!layers.length || !animated || !metaAnim || typeof metaAnim !== 'object') return undefined;
    const order = Array.isArray(metaAnim.frames) ? remapFrameOrder(metaAnim.frames, origin.current) : undefined;
    return parseAnimation({ ...metaAnim, frames: order }, W, H);
    // origin changes together with rev
  }, [layers.length, W, H, animated, metaAnim, rev]);

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
    if (!stroke.current && !drag.current) setPaletteRev((r) => r + 1);
  }, []);

  const snapshot = (): Snapshot => ({
    layers: layers.map(({ px, ...meta }) => ({ ...meta, data: px.data.slice() })),
    height: H,
    active,
    origin: [...origin.current],
  });
  const remember = (s: Snapshot) => {
    undo.current.push(s);
    if (undo.current.length > HISTORY) undo.current.shift();
    redo.current = [];
  };
  /** Brings back an undo step; names, visibility and opacity stay as they are now (they aren't undo steps). */
  const restore = (s: Snapshot) => {
    origin.current = s.origin;
    setLayers(
      s.layers.map(({ data, ...meta }) => {
        const now = layers.find((l) => l.id === meta.id);
        return { ...meta, ...(now && { name: now.name, visible: now.visible, opacity: now.opacity }), px: { width: W, height: s.height, data } };
      }),
    );
    setActive(Math.min(s.active, s.layers.length - 1));
  };

  /** Saves the current state for undo, then lets `fn` change the active layer. */
  const edit = useCallback(
    (fn: (p: Pixels) => void | boolean) => {
      if (!img) return;
      const before = snapshot();
      if (fn(img) === false) return;
      remember(before);
      commit();
    },
    [img, layers, active, commit],
  );

  /** Changes the layers themselves (added, removed, merged …) as one undo step. */
  const changeLayers = (next: PaintLayer[], select: number) => {
    remember(snapshot());
    setLayers(next);
    setActive(Math.max(0, Math.min(next.length - 1, select)));
    commit();
  };
  const blankLayer = (name?: string): PaintLayer => {
    const id = nextId.current++;
    return { id, name: name ?? t('editor.texture.layerN', { n: id }), px: blankPixels(W, H), visible: true, opacity: 100 };
  };
  const layerActions: LayerActions = {
    select: setActive,
    add: () => {
      const next = [...layers];
      next.splice(active + 1, 0, blankLayer());
      changeLayers(next, active + 1);
    },
    duplicate: () => {
      const l = layers[active];
      const next = [...layers];
      next.splice(active + 1, 0, { ...l, id: nextId.current++, name: t('editor.texture.layerCopy', { name: l.name }), px: copyPixels(l.px) });
      changeLayers(next, active + 1);
    },
    remove: () => {
      if (layers.length <= 1) return;
      changeLayers(
        layers.filter((_, i) => i !== active),
        active - 1,
      );
    },
    mergeDown: () => {
      if (active <= 0) return;
      const below = { ...layers[active - 1], px: copyPixels(layers[active - 1].px) };
      const top = layers[active];
      if (top.visible) mergeInto(below.px, top.px, top.opacity);
      changeLayers(
        layers.flatMap((l, i) => (i === active ? [] : i === active - 1 ? [below] : [l])),
        active - 1,
      );
    },
    move: (by) => {
      const to = active + by;
      if (to < 0 || to >= layers.length) return;
      const next = [...layers];
      [next[active], next[to]] = [next[to], next[active]];
      changeLayers(next, to);
    },
    update: (i, change) => {
      setLayers(layers.map((l, k) => (k === i ? { ...l, ...change } : l)));
      // a different name doesn't change the picture
      if ('visible' in change || 'opacity' in change) commit();
    },
  };

  /** Rebuilds the frames of every layer (added, removed, moved); ids follow along to keep the frame order. */
  const setFrames = (change: <T>(list: T[], fresh: (copyOf?: T) => T) => void, select: number) => {
    if (!layers.length) return;
    remember(snapshot());
    const ids = Array.from({ length: frames }, (_, i) => i);
    change(ids, () => -1);
    origin.current = ids.map((i) => (i < 0 ? -1 : origin.current[i]));
    setLayers(
      layers.map((l) => {
        const list = splitFrames(l.px, fh);
        change(list, (copyOf) => (copyOf ? copyPixels(copyOf) : blankPixels(W, fh)));
        return { ...l, px: stackFrames(list, W, fh) };
      }),
    );
    setCur(Math.max(0, Math.min(ids.length - 1, select)));
    commit();
  };
  const frameOps = {
    add: () => setFrames((list, fresh) => void list.splice(cur + 1, 0, fresh()), cur + 1),
    duplicate: () => setFrames((list, fresh) => void list.splice(cur + 1, 0, fresh(list[cur])), cur + 1),
    remove: () => setFrames((list) => void list.splice(cur, 1), cur),
    move: (by: -1 | 1) => {
      const to = cur + by;
      if (to < 0 || to >= frames) return;
      setFrames((list) => void ([list[cur], list[to]] = [list[to], list[cur]]), to);
    },
  };

  const step = (from: typeof undo, to: typeof undo) => {
    const prev = from.current.pop();
    if (!layers.length || !prev) return;
    to.current.push(snapshot());
    restore(prev);
    commit();
  };

  const useColor = (c: RGBA) => {
    setColor(c);
    setRecent((r) => [c, ...r.filter((x) => !sameColor(x, c))].slice(0, 12));
  };

  /** Pixel under the pointer, in sheet coordinates. */
  const pixelAt = (e: React.PointerEvent): [number, number] => {
    const r = view.current!.getBoundingClientRect();
    return [Math.floor(((e.clientX - r.left) / r.width) * W), region.y0 + Math.floor(((e.clientY - r.top) / r.height) * region.h)];
  };
  const inside = ([x, y]: [number, number]) => !!img && x >= 0 && x < W && y >= region.y0 && y < region.y0 + region.h;
  const clamp = ([x, y]: [number, number]): [number, number] => [Math.max(0, Math.min(W - 1, x)), Math.max(region.y0, Math.min(region.y0 + region.h - 1, y))];
  /** Draws a pencil line, kept inside the current frame and the selection. */
  const line = (p: Pixels, a: [number, number], b: [number, number], c: RGBA, clip: Rect | undefined) => drawLine(p, a[0], a[1], b[0], b[1], c, size, clip);

  /** Lifts the selection (or the whole frame) off the active layer, to be moved. */
  const lift = (start: [number, number]): Extract<Drag, { kind: 'move' }> | undefined => {
    if (!img) return undefined;
    const frame = single ? regionRect : animated && !sel ? { x: 0, y: Math.floor(start[1] / fh) * fh, w: W, h: fh } : { x: 0, y: 0, w: W, h: H };
    const from = sel ?? frame;
    remember(snapshot());
    const piece = copyRect(img, from);
    clearRect(img, from);
    const base = img.data.slice();
    paste(img, piece, from.x, from.y, frame);
    return { kind: 'move', start, base, piece, from, last: from, clip: frame, withSel: !!sel };
  };
  const moveTo = (d: Extract<Drag, { kind: 'move' }>, dx: number, dy: number) => {
    if (!img) return;
    restoreRect(img, d.base, d.last);
    const at = { ...d.from, x: d.from.x + dx, y: d.from.y + dy };
    paste(img, d.piece, at.x, at.y, d.clip);
    d.last = at;
    if (d.withSel) setSelRel({ ...at, y: at.y - region.y0 });
    commit();
  };

  // touch: two fingers zoom and pan; once a pen was used, a resting hand doesn't draw
  const pinch = useRef(new PinchTracker());
  const gesture = useRef<{ zoom: number } | null>(null);
  const penSeen = useRef(false);
  /** Takes back the stroke just begun (a second finger came down: it was a gesture after all). */
  const cancelStroke = () => {
    const wasEdit = stroke.current || (drag.current && drag.current.kind !== 'select');
    stroke.current = null;
    drag.current = null;
    const prev = wasEdit ? undo.current.pop() : undefined;
    if (prev) restore(prev);
    commit();
  };

  const onDown = (e: React.PointerEvent) => {
    if (!img || adjusting) return;
    e.preventDefault();
    if (e.pointerType === 'pen') penSeen.current = true;
    if (e.pointerType === 'touch') {
      (e.target as Element).setPointerCapture(e.pointerId);
      if (pinch.current.down(e.pointerId, e.clientX, e.clientY)) {
        if (stroke.current || drag.current) cancelStroke();
        gesture.current ??= { zoom };
        return;
      }
      if (penSeen.current) return;
    }
    const p = pixelAt(e);
    const erasing = e.button === 2 || isPenEraser(e);
    const use: Tool = e.altKey ? 'picker' : erasing && (tool === 'line' || tool === 'rect') ? tool : erasing ? 'eraser' : tool;
    if (use === 'select' || use === 'move') {
      (e.target as Element).setPointerCapture(e.pointerId);
      if (use === 'select') {
        const s = clamp(p);
        drag.current = { kind: 'select', start: s, moved: false };
      } else drag.current = lift(p) ?? null;
      return;
    }
    if (!inside(p)) return;
    if (use === 'picker') {
      useColor(getPixel(flat ?? img, ...p));
      // Alt+click keeps the current tool, so only the picker tool itself hands over to the pencil
      if (tool === 'picker') setTool('pencil');
      return;
    }
    const clip = limitAt(p[1]);
    if (sel && !clip) return;
    if (use === 'fill') {
      const b = clip && { x0: clip.x, x1: clip.x + clip.w, y0: clip.y, y1: clip.y + clip.h };
      // without a selection, "every pixel of that colour" means the whole sheet in sheet view
      const bounds = fillAll && !sel && !single ? undefined : b;
      edit((px) => floodFill(px, p[0], p[1], color, !fillAll, tolerance, bounds) > 0);
      useColor(color);
      return;
    }
    const c: RGBA = use === 'eraser' || erasing ? CLEAR : color;
    (e.target as Element).setPointerCapture(e.pointerId);
    if (use === 'line' || use === 'rect') {
      remember(snapshot());
      const base = img.data.slice();
      const last = shapeBounds(p, p, size);
      drag.current = { kind: use, start: p, base, last, color: c, clip };
      if (use === 'line') line(img, p, p, c, clip);
      else drawRect(img, p, p, c, filledRect, size, clip);
      commit();
    } else {
      const from = e.shiftKey && lastPoint.current && inside(lastPoint.current) ? lastPoint.current : p;
      edit((px) => line(px, from, p, c, clip));
      stroke.current = { last: p, erase: c === CLEAR, clip };
      lastPoint.current = p;
    }
    if (c !== CLEAR) useColor(color);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!img) return;
    if (e.pointerType === 'touch') {
      const step = pinch.current.move(e.pointerId, e.clientX, e.clientY);
      if (step && gesture.current) {
        gesture.current.zoom = Math.max(1, Math.min(48, gesture.current.zoom * step.scale));
        setZoom(Math.round(gesture.current.zoom));
        area.current?.scrollBy(-step.dx, -step.dy);
      }
      if (gesture.current || (penSeen.current && !stroke.current && !drag.current)) return;
    }
    const p = pixelAt(e);
    setHover(inside(p) ? p : undefined);
    const d = drag.current;
    if (d) {
      if (d.kind === 'select') {
        const end = clamp(p);
        if (!d.moved && end[0] === d.start[0] && end[1] === d.start[1]) return;
        d.moved = true;
        const r = rectBetween(d.start, end, regionRect);
        setSelRel(r && { ...r, y: r.y - region.y0 });
      } else if (d.kind === 'move') moveTo(d, p[0] - d.start[0], p[1] - d.start[1]);
      else {
        const end = e.shiftKey ? constrain(d.start, p, d.kind === 'rect') : p;
        restoreRect(img, d.base, d.last);
        if (d.kind === 'line') line(img, d.start, end, d.color, d.clip);
        else drawRect(img, d.start, end, d.color, filledRect, size, d.clip);
        d.last = shapeBounds(d.start, end, size);
        commit();
      }
      return;
    }
    const s = stroke.current;
    if (!s || (p[0] === s.last[0] && p[1] === s.last[1])) return;
    line(img, s.last, p, s.erase ? CLEAR : color, s.clip);
    s.last = p;
    lastPoint.current = p;
    commit();
  };

  const onUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      pinch.current.up(e.pointerId);
      if (!pinch.current.count) gesture.current = null;
    }
    const d = drag.current;
    // a click with the selection tool drops the selection
    if (d?.kind === 'select' && !d.moved) setSelRel(undefined);
    if (stroke.current || d) setPaletteRev((r) => r + 1);
    stroke.current = null;
    drag.current = null;
  };

  // selection and clipboard
  const selectAll = () => {
    setSelRel({ x: 0, y: 0, w: W, h: region.h });
    setTool('select');
  };
  const copy = () => {
    if (!img) return;
    clipboard = copyRect(img, sel ?? regionRect);
    setHasClip(true);
    // other programs get it too, where the browser allows that
    void encodePng(clipboard)
      .then((png) => navigator.clipboard?.write?.([new ClipboardItem({ 'image/png': new Blob([png], { type: 'image/png' }) })]))
      .catch(() => undefined);
  };
  const deleteSel = () => sel && edit((p) => clearRect(p, sel));
  /** Pastes an image into a new layer, at the selection (or the top left corner), ready to be moved. */
  const pasteLayer = (piece: Pixels) => {
    if (!layers.length) return;
    const at = sel ?? regionRect;
    const layer = blankLayer(t('editor.texture.pastedLayer'));
    paste(layer.px, piece, at.x, at.y, regionRect);
    const next = [...layers];
    next.splice(active + 1, 0, layer);
    changeLayers(next, active + 1);
    const r = intersect({ x: at.x, y: at.y, w: piece.width, h: piece.height }, regionRect);
    setSelRel(r && { ...r, y: r.y - region.y0 });
    setTool('move');
  };
  const nudge = (dx: number, dy: number) => {
    if (!sel) return;
    const d = lift([sel.x, sel.y]);
    if (d) moveTo(d, dx, dy);
    setPaletteRev((r) => r + 1);
  };

  const close = () => {
    if (!dirty.current || confirm(t('editor.unsaved'))) onDone();
  };

  const save = async () => {
    if (!layers.length) return;
    setSaving(true);
    try {
      const png = await encodePng(flatten(layers, W, H));
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
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
    const k = e.key.toLowerCase();
    const mod = e.ctrlKey || e.metaKey;
    if (mod && k === 'z') {
      e.preventDefault();
      return e.shiftKey ? step(redo, undo) : step(undo, redo);
    }
    if (mod && k === 'y') {
      e.preventDefault();
      return step(redo, undo);
    }
    if (mod && k === 's') {
      e.preventDefault();
      return void save();
    }
    if (mod && k === 'a') {
      e.preventDefault();
      return selectAll();
    }
    if (mod && k === 'd') {
      e.preventDefault();
      return setSelRel(undefined);
    }
    if (mod && (k === 'c' || k === 'x')) {
      e.preventDefault();
      copy();
      if (k === 'x') deleteSel();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
      e.preventDefault();
      return deleteSel();
    }
    if (sel && e.key.startsWith('Arrow')) {
      e.preventDefault();
      const by = e.shiftKey ? 4 : 1;
      return nudge(e.key === 'ArrowLeft' ? -by : e.key === 'ArrowRight' ? by : 0, e.key === 'ArrowUp' ? -by : e.key === 'ArrowDown' ? by : 0);
    }
    if (e.key === 'Escape') return sel ? setSelRel(undefined) : close();
    if (animated && (k === ',' || k === '.')) return setCur((c) => (c + (k === ',' ? frames - 1 : 1)) % frames);
    const found = TOOLS.find(([, , key]) => key === k);
    if (found && !mod) setTool(found[0]);
  };
  // pasting: an image from another program, else what was copied here
  const onPaste = useRef<(e: ClipboardEvent) => void>();
  onPaste.current = (e: ClipboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    e.preventDefault();
    if (file) void decodeImage(file).then(pasteLayer, () => clipboard && pasteLayer(clipboard));
    else if (clipboard) pasteLayer(clipboard);
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current?.(e);
    const p = (e: ClipboardEvent) => onPaste.current?.(e);
    window.addEventListener('keydown', h);
    window.addEventListener('paste', p);
    return () => {
      window.removeEventListener('keydown', h);
      window.removeEventListener('paste', p);
    };
  }, []);

  const square = !!img && (sel ? sel.w === sel.h : W === fh);
  const scopeLabel = (whole: string, frame: string) => (sel ? t('editor.texture.inSelection', { what: whole }) : single ? frame : whole);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <span className="font-semibold">{t('editor.texture.title')}</span>
        <span className="min-w-0 truncate font-mono text-xs text-neutral-400">{path}</span>
        {img && (
          <span className="text-xs text-neutral-500">
            {W}×{H}
            {animated && ` · ${t('editor.texture.frames', { count: frames })}`}
            {layers.length > 1 && ` · ${t('editor.texture.layerCount', { count: layers.length })}`}
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
        {sel && <span className="text-neutral-400">{t('editor.texture.selectionSize', { w: sel.w, h: sel.h })}</span>}
        {animated && sheetView && <span className="ml-auto text-[11px] text-neutral-500">{t('editor.texture.framesHint')}</span>}
      </div>
      {error && <div className="m-3 rounded bg-red-950 p-2 text-xs text-red-200">{t('editor.loadFailed', { error })}</div>}
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-64 shrink-0 flex-col gap-3 overflow-y-auto border-r border-neutral-800 p-3 text-xs">
          <div className="grid grid-cols-4 gap-1">
            {TOOLS.map(([id, icon, key]) => (
              <button
                key={id}
                onClick={() => setTool(id)}
                title={`${t(`editor.texture.${id}`)} (${key.toUpperCase()})`}
                aria-label={t(`editor.texture.${id}`)}
                aria-pressed={tool === id}
                className={`rounded py-1.5 text-base ${tool === id ? 'bg-emerald-700' : 'bg-neutral-800 hover:bg-neutral-700'}`}
              >
                {icon}
              </button>
            ))}
          </div>
          <div className="text-neutral-300">{t(`editor.texture.${tool}`)}</div>
          {BRUSH.includes(tool) && (
            <label className="flex items-center gap-2">
              {t('editor.texture.size')}
              <input type="range" min={1} max={8} value={size} onChange={(e) => setSize(Number(e.target.value))} className="flex-1" />
              <span className="w-4 text-right">{size}</span>
            </label>
          )}
          {tool === 'rect' && (
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={filledRect} onChange={(e) => setFilledRect(e.target.checked)} />
              {t('editor.texture.filled')}
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
          {(tool === 'select' || tool === 'move' || sel) && (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap gap-1">
                <Btn onClick={selectAll}>{t('editor.texture.selectAll')}</Btn>
                <Btn onClick={() => setSelRel(undefined)} disabled={!sel}>{t('editor.texture.deselect')}</Btn>
                <Btn onClick={copy}>{t('editor.texture.copy')}</Btn>
                <Btn onClick={() => clipboard && pasteLayer(clipboard)} disabled={!hasClip} title={t('editor.texture.pasteTitle')}>
                  {t('editor.texture.paste')}
                </Btn>
                <Btn onClick={deleteSel} disabled={!sel}>{t('editor.texture.clear')}</Btn>
              </div>
              <p className="text-[11px] leading-snug text-neutral-500">{t('editor.texture.selectHint')}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="checker h-9 w-9 shrink-0 overflow-hidden rounded ring-1 ring-neutral-600">
              <div className="h-full w-full" style={{ background: css(color) }} />
            </div>
            <input type="color" value={toHex(color)} onChange={(e) => setColor(fromHex(e.target.value, color[3]))} className="h-9 w-12 cursor-pointer bg-transparent" />
            <HexInput color={color} onChange={setColor} label={t('editor.texture.hex')} />
          </div>
          <label className="flex items-center gap-2">
            {t('editor.texture.alpha')}
            <input type="range" min={0} max={255} value={color[3]} onChange={(e) => setColor([color[0], color[1], color[2], Number(e.target.value)])} className="flex-1" />
            <span className="w-7 text-right">{Math.round((color[3] / 255) * 100)}%</span>
          </label>
          {recent.length > 0 && <Swatches label={t('editor.texture.recent')} colors={recent} current={color} onPick={setColor} />}
          <Swatches label={t('editor.texture.colors')} colors={palette} current={color} onPick={setColor} />
          <p className="text-[11px] leading-snug text-neutral-500">{t('editor.texture.toolHint')}</p>
          {layers.length > 0 && <LayersPanel layers={layers} active={active} actions={layerActions} />}
          <PalettePanel current={color} onPick={setColor} busy={adjusting} onSnap={(colors) => edit((p) => snapToPalette(p, colors, mask) > 0)} />
          <ReplaceColorPanel
            path={path}
            current={color}
            onHere={(from, to, tol) => {
              let n = 0;
              edit((p) => (n = replaceColor(p, from, to, tol, mask)) > 0);
              return n;
            }}
          />
          <Section title={scopeLabel(t('editor.texture.transform'), t('editor.texture.transformFrame'))}>
            <div className="flex flex-wrap gap-1">
              <Btn onClick={() => edit(within((p) => flip(p, 'h', sel ? p.height : fh)))}>{t('editor.texture.flipH')}</Btn>
              <Btn onClick={() => edit(within((p) => flip(p, 'v', sel ? p.height : fh)))}>{t('editor.texture.flipV')}</Btn>
              <Btn onClick={() => edit(within((p) => rotate(p, true, sel ? p.height : fh)))} disabled={!square} title={square ? undefined : t('editor.texture.rotateHint')}>
                {t('editor.texture.rotateCw')}
              </Btn>
              <Btn onClick={() => edit(within((p) => rotate(p, false, sel ? p.height : fh)))} disabled={!square} title={square ? undefined : t('editor.texture.rotateHint')}>
                {t('editor.texture.rotateCcw')}
              </Btn>
            </div>
            <div className="text-neutral-400">{t('editor.texture.shift')}</div>
            <div className="flex gap-1">
              <Btn onClick={() => edit(within((p) => shift(p, -1, 0, sel ? p.height : fh)))}>←</Btn>
              <Btn onClick={() => edit(within((p) => shift(p, 1, 0, sel ? p.height : fh)))}>→</Btn>
              <Btn onClick={() => edit(within((p) => shift(p, 0, -1, sel ? p.height : fh)))}>↑</Btn>
              <Btn onClick={() => edit(within((p) => shift(p, 0, 1, sel ? p.height : fh)))}>↓</Btn>
            </div>
          </Section>
          <Section title={scopeLabel(t('editor.texture.adjust'), t('editor.texture.adjustFrame'))}>
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
                    edit((p) => adjustHsl(p, ...hsl, mask));
                    setHsl([0, 0, 0]);
                  }}
                >
                  {t('editor.texture.applyAdjust')}
                </Btn>
                <Btn onClick={() => setHsl([0, 0, 0])}>{t('editor.texture.resetAdjust')}</Btn>
              </div>
            )}
            <div className="flex gap-1">
              <Btn onClick={() => edit(within(grayscale))} disabled={adjusting}>{t('editor.texture.grayscale')}</Btn>
              <Btn onClick={() => edit(within(invert))} disabled={adjusting}>{t('editor.texture.invert')}</Btn>
            </div>
          </Section>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={area} className="relative min-h-0 flex-1 overflow-auto bg-neutral-900 p-6" onContextMenu={(e) => e.preventDefault()}>
            {img && (
              <canvas
                ref={view}
                aria-label={t('editor.texture.canvas')}
                className={`checker mx-auto block touch-none shadow-lg ${tool === 'move' ? 'cursor-move' : 'cursor-crosshair'}`}
                style={{ width: W * zoom, height: region.h * zoom }}
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
          {img && animated && (
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
                {flat &&
                  Array.from({ length: frames }, (_, i) => <FrameThumb key={i} img={flat} fh={fh} index={i} rev={rev} active={i === cur} onClick={() => setCur(i)} />)}
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
