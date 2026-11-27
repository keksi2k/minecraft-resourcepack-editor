import type { AssetStore } from '../assets/AssetStore';
import type { Pixels } from '../render/pixelEdit';
import { loadTexture, type TexInfo } from '../render/textures';
import { layoutText, type Font, type TextRun } from './font';

/** Canvas drawing in Minecraft's GUI pixels: textures, GUI sprites with their scaling, and text. */

export function pixelsCanvas(p: Pixels): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = p.width;
  c.height = p.height;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  return c;
}

const parseHex = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Minecraft's text shadow: the colour at a quarter brightness. */
export const shadowColor = (hex: string) => {
  const [r, g, b] = parseHex(hex).map((v) => (v & 0xfc) >> 2);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

const tintCache = new WeakMap<Pixels, Map<string, HTMLCanvasElement>>();

/** The glyph sheet multiplied by a colour, like the text shader does. */
function tintedSheet(sheet: Pixels, hex: string): HTMLCanvasElement {
  let byColor = tintCache.get(sheet);
  if (!byColor) tintCache.set(sheet, (byColor = new Map()));
  let c = byColor.get(hex);
  if (!c) {
    const [r, g, b] = parseHex(hex);
    const data = new Uint8ClampedArray(sheet.data);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = (data[i] * r) / 255;
      data[i + 1] = (data[i + 1] * g) / 255;
      data[i + 2] = (data[i + 2] * b) / 255;
    }
    c = pixelsCanvas({ width: sheet.width, height: sheet.height, data });
    byColor.set(hex, c);
  }
  return c;
}

export interface TextOptions {
  color?: string;
  shadow?: boolean;
}

function drawRuns(ctx: CanvasRenderingContext2D, font: Font, runs: TextRun[], x: number, y: number, base: string, shadow: boolean) {
  for (const r of runs) {
    let color = r.style.color ?? base;
    if (shadow) color = shadowColor(color);
    const px = x + r.x;
    if (r.glyph) {
      const g = r.glyph;
      const sheet = font.sheets.get(g.provider.file);
      if (sheet) {
        const img = tintedSheet(sheet, color);
        const top = y + 7 - g.provider.ascent;
        const w = g.sw * g.scale;
        const h = g.sh * g.scale;
        ctx.save();
        // italic leans a glyph a quarter pixel per pixel of height, around its bottom edge
        if (r.style.italic) ctx.transform(1, 0, -0.25, 1, 0.25 * (top + h), 0);
        ctx.drawImage(img, g.sx, g.sy, g.sw, g.sh, px, top, w, h);
        if (r.style.bold) ctx.drawImage(img, g.sx, g.sy, g.sw, g.sh, px + 1, top, w, h);
        ctx.restore();
      }
    } else if (r.cp !== 32 && r.advance > 0 && !(r.cp >= 0x200b && r.cp <= 0x200f)) {
      ctx.fillStyle = color;
      ctx.font = '8px sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(String.fromCodePoint(r.cp), px, y + 7, r.advance);
    }
    ctx.fillStyle = color;
    if (r.style.underlined) ctx.fillRect(px - 1, y + 8, r.advance + 1, 1);
    if (r.style.strikethrough) ctx.fillRect(px - 1, y + 3.5, r.advance + 1, 1);
  }
}

/** Draws § text with its top-left at (x, y); returns its width. */
export function drawText(ctx: CanvasRenderingContext2D, font: Font, text: string, x: number, y: number, { color = '#ffffff', shadow = true }: TextOptions = {}): number {
  const { runs, width } = layoutText(font, text);
  if (shadow) drawRuns(ctx, font, runs, x + 1, y + 1, color, true);
  drawRuns(ctx, font, runs, x, y, color, false);
  return width;
}

export function drawCentered(ctx: CanvasRenderingContext2D, font: Font, text: string, cx: number, y: number, opts?: TextOptions) {
  const { width } = layoutText(font, text);
  return drawText(ctx, font, text, Math.round(cx - width / 2), y, opts);
}

export interface Sprite {
  tex: TexInfo;
  /** `gui.scaling` of the sprite's .mcmeta. */
  scaling?: any;
}

/** A GUI sprite (gui/sprites/…) or any texture, with its scaling settings. */
export async function loadSprite(store: AssetStore, textureId: string): Promise<Sprite> {
  const tex = await loadTexture(store, textureId);
  const [ns, path] = textureId.includes(':') ? textureId.split(':') : ['minecraft', textureId];
  const meta = store.json<any>(`assets/${ns}/textures/${path}.png.mcmeta`);
  return { tex, scaling: meta?.gui?.scaling };
}

const borderOf = (b: any) =>
  typeof b === 'number' ? { left: b, top: b, right: b, bottom: b } : { left: b?.left ?? 0, top: b?.top ?? 0, right: b?.right ?? 0, bottom: b?.bottom ?? 0 };

/** Tiles part of an image over a rectangle, cutting the last tiles off. */
function tile(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  x: number,
  y: number,
  w: number,
  h: number,
  tw: number,
  th: number,
) {
  if (sw <= 0 || sh <= 0 || w <= 0 || h <= 0) return;
  for (let ty = 0; ty < h; ty += th) {
    for (let tx = 0; tx < w; tx += tw) {
      const cw = Math.min(tw, w - tx);
      const ch = Math.min(th, h - ty);
      ctx.drawImage(img, sx, sy, (sw * cw) / tw, (sh * ch) / th, x + tx, y + ty, cw, ch);
    }
  }
}

/**
 * Draws a sprite into a rectangle the way the game does: `stretch` (default), `tile` or
 * `nine_slice` (corners kept, edges and centre tiled). Sizes are in GUI pixels; the scaling
 * settings describe the sprite at its GUI size, a larger texture is just more detailed.
 */
export function drawSprite(ctx: CanvasRenderingContext2D, { tex, scaling }: Sprite, x: number, y: number, w: number, h: number) {
  const img = tex.canvas;
  const type = String(scaling?.type ?? 'stretch').replace(/^minecraft:/, '');
  if (type === 'tile' || type === 'nine_slice') {
    const gw = Number(scaling.width) || tex.width;
    const gh = Number(scaling.height) || tex.height;
    const kx = tex.width / gw;
    const ky = tex.height / gh;
    if (type === 'tile') return tile(ctx, img, 0, 0, tex.width, tex.height, x, y, w, h, gw, gh);
    const b = borderOf(scaling.border);
    const l = Math.min(b.left, w / 2);
    const r = Math.min(b.right, w / 2);
    const t = Math.min(b.top, h / 2);
    const bt = Math.min(b.bottom, h / 2);
    const cols: [number, number, number, number][] = [
      [0, l, x, l],
      [b.left, gw - b.left - b.right, x + l, w - l - r],
      [gw - b.right, r, x + w - r, r],
    ];
    const rows: [number, number, number, number][] = [
      [0, t, y, t],
      [b.top, gh - b.top - b.bottom, y + t, h - t - bt],
      [gh - b.bottom, bt, y + h - bt, bt],
    ];
    rows.forEach(([sy, sh, dy, dh], ri) => {
      cols.forEach(([sx, sw, dx, dw], ci) => {
        if (dw <= 0 || dh <= 0 || sw <= 0 || sh <= 0) return;
        // with stretch_inner the centre is stretched instead of tiled
        if (scaling.stretch_inner && ri === 1 && ci === 1) ctx.drawImage(img, sx * kx, sy * ky, sw * kx, sh * ky, dx, dy, dw, dh);
        else tile(ctx, img, sx * kx, sy * ky, sw * kx, sh * ky, dx, dy, dw, dh, sw, sh);
      });
    });
    return;
  }
  ctx.drawImage(img, x, y, w, h);
}

/** Draws a sprite at its GUI size (the scaling width/height, else the texture's size). */
export function drawSpriteAt(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, w?: number, h?: number) {
  const gw = Number(s.scaling?.width) || s.tex.width;
  const gh = Number(s.scaling?.height) || s.tex.height;
  drawSprite(ctx, s, x, y, w ?? gw, h ?? gh);
}
