import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssetStore } from '../../assets/AssetStore';
import { texturePath } from '../../models/resourceLocation';
import { decodeImage } from '../../render/png';
import { loadSprite, type Sprite } from '../../scenes/draw';
import { fontProviders, loadFont, type Font } from '../../scenes/font';
import { useApp } from '../../state/appStore';

/** The default font of the pack (reloaded when a font file or glyph sheet changes). */
export function useFont(store: AssetStore, id = 'minecraft:default'): Font | undefined {
  const revision = useApp((s) => s.revision);
  const key = useMemo(() => {
    const providers = fontProviders(store, id);
    const files = new Set<string>();
    for (const p of providers) {
      files.add(p.defPath);
      if (p.type === 'bitmap') files.add(p.file);
    }
    return [...files].map((f) => `${f}@${store.rev(f)}`).join('|') + `|${id}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, id, revision]);
  const [font, setFont] = useState<Font>();
  useEffect(() => {
    let alive = true;
    void loadFont(store, id, decodeImage).then((f) => alive && setFont(f));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return font;
}

/** GUI sprites and textures by texture id, reloaded when one of them changes. */
export function useSprites(store: AssetStore, ids: readonly string[]): Record<string, Sprite> | undefined {
  const revision = useApp((s) => s.revision);
  const key = ids.map((id) => `${id}@${store.rev(texturePath(id))}.${store.rev(`${texturePath(id)}.mcmeta`)}`).join('|');
  void revision;
  const [sprites, setSprites] = useState<Record<string, Sprite>>();
  useEffect(() => {
    let alive = true;
    void Promise.all(ids.map((id) => loadSprite(store, id))).then((list) => {
      if (alive) setSprites(Object.fromEntries(ids.map((id, i) => [id, list[i]])));
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, key]);
  return sprites;
}

export interface DrawState {
  /** Milliseconds since the canvas started drawing. */
  time: number;
  /** The mouse in GUI pixels, if it's over the canvas. */
  mouse?: [number, number];
}

/**
 * A canvas in Minecraft GUI pixels, shown `scale` times larger without smoothing. `draw` runs on
 * every animation frame while `animate` is set, else whenever it changes.
 */
export function GuiCanvas({
  width,
  height,
  scale,
  draw,
  animate,
  onClick,
  className = '',
}: {
  width: number;
  height: number;
  scale: number;
  draw: (ctx: CanvasRenderingContext2D, s: DrawState) => void;
  animate?: boolean;
  onClick?: (x: number, y: number) => void;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const mouse = useRef<[number, number]>();
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const [redraw, setRedraw] = useState(0);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = width;
    c.height = height;
    const ctx = c.getContext('2d')!;
    const start = performance.now();
    let raf = 0;
    const frame = () => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = false;
      drawRef.current(ctx, { time: performance.now() - start, mouse: mouse.current });
      if (animate) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [width, height, animate, draw, redraw]);

  const at = (e: React.MouseEvent): [number, number] => {
    const r = ref.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * width, ((e.clientY - r.top) / r.height) * height];
  };
  return (
    <canvas
      ref={ref}
      className={className}
      style={{ width: width * scale, height: height * scale, imageRendering: 'pixelated' }}
      onPointerMove={(e) => {
        mouse.current = at(e);
        if (!animate) setRedraw((n) => n + 1);
      }}
      onPointerLeave={() => {
        mouse.current = undefined;
        if (!animate) setRedraw((n) => n + 1);
      }}
      onClick={onClick && ((e) => onClick(...at(e)))}
    />
  );
}

/** Size of an element, following it as it changes. */
export function useElementSize<T extends HTMLElement>(): [React.RefObject<T>, [number, number]] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState<[number, number]>([0, 0]);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize([e.contentRect.width, e.contentRect.height]));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/** Minecraft's automatic GUI scale: the largest that leaves at least 320×240 GUI pixels. */
export function guiScale(w: number, h: number, max = 6): number {
  let s = 1;
  while (s < max && w / (s + 1) >= 320 && h / (s + 1) >= 240) s++;
  return s;
}

export const inside = (m: [number, number] | undefined, x: number, y: number, w: number, h: number) => !!m && m[0] >= x && m[0] < x + w && m[1] >= y && m[1] < y + h;
