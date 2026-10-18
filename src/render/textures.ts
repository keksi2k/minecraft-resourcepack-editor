import * as THREE from 'three';
import type { AssetStore } from '../assets/AssetStore';
import { texturePath } from '../models/resourceLocation';
import { drawAnimationFrame, frameAt, parseAnimation, subscribeTicks, type TextureAnimation } from './animation';

export interface TexInfo {
  /** First animation frame (or the whole image). */
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  /** Has partially transparent pixels (needs blending instead of alpha-cutout). */
  translucent: boolean;
  frames: number;
  missing: boolean;
  /** For animated textures: the whole sprite sheet and its resolved animation. */
  sheet?: HTMLCanvasElement;
  animation?: TextureAnimation;
}

const cache = new Map<string, Promise<TexInfo>>();
const threeCache = new WeakMap<TexInfo, THREE.Texture>();

function hasTranslucency(pixels: Uint8ClampedArray): boolean {
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0 && pixels[i] < 255) return true;
  return false;
}

function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function missingTexture(): TexInfo {
  const c = canvasOf(16, 16);
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#f800f8';
  g.fillRect(0, 0, 8, 8);
  g.fillRect(8, 8, 8, 8);
  const pixels = g.getImageData(0, 0, 16, 16).data;
  return { canvas: c, width: 16, height: 16, pixels, translucent: false, frames: 1, missing: true };
}

async function decode(bytes: Uint8Array, mcmeta: any): Promise<TexInfo> {
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const animation = parseAnimation(mcmeta?.animation, bmp.width, bmp.height);
  const fw = animation?.fw ?? bmp.width;
  const fh = animation?.fh ?? bmp.height;

  const frame0 = canvasOf(fw, fh);
  const g = frame0.getContext('2d')!;
  let sheet: HTMLCanvasElement | undefined;
  let translucent: boolean;
  if (animation) {
    sheet = canvasOf(bmp.width, bmp.height);
    const sg = sheet.getContext('2d')!;
    sg.drawImage(bmp, 0, 0);
    drawAnimationFrame(g, sheet, animation, 0);
    // a later frame may be translucent even if the first isn't
    translucent = hasTranslucency(sg.getImageData(0, 0, bmp.width, bmp.height).data);
  } else {
    g.drawImage(bmp, 0, 0);
    translucent = false;
  }
  bmp.close();
  const pixels = g.getImageData(0, 0, fw, fh).data;
  return {
    canvas: frame0,
    width: fw,
    height: fh,
    pixels,
    translucent: translucent || hasTranslucency(pixels),
    frames: animation ? animation.frames.length : 1,
    missing: false,
    sheet,
    animation,
  };
}

export function loadTexture(store: AssetStore, textureId: string): Promise<TexInfo> {
  const path = texturePath(textureId);
  const key = `${path}|${store.rev(path)}|${store.rev(`${path}.mcmeta`)}`;
  let p = cache.get(key);
  if (!p) {
    const bytes = store.get(path);
    p = bytes
      ? decode(bytes, store.json(`${path}.mcmeta`)).catch(() => missingTexture())
      : Promise.resolve(missingTexture());
    cache.set(key, p);
  }
  return p;
}

/**
 * three.js texture for a TexInfo. Animated textures get their own canvas that follows the shared
 * tick clock, so every mesh using them animates in sync (like the in-game texture atlas).
 */
export function threeTexture(info: TexInfo): THREE.Texture {
  let t = threeCache.get(info);
  if (!t) {
    const anim = info.animation;
    const sheet = info.sheet;
    if (anim && sheet) {
      const canvas = canvasOf(anim.fw, anim.fh);
      const ctx = canvas.getContext('2d')!;
      drawAnimationFrame(ctx, sheet, anim, 0);
      const tex = new THREE.CanvasTexture(canvas);
      let shown = '';
      subscribeTicks((ticks) => {
        const f = frameAt(anim, ticks);
        const key = anim.interpolate ? `${f.current}:${Math.round(f.progress * 16)}` : String(f.current);
        if (key === shown) return;
        shown = key;
        drawAnimationFrame(ctx, sheet, anim, ticks);
        tex.needsUpdate = true;
      });
      t = tex;
    } else {
      t = new THREE.CanvasTexture(info.canvas);
    }
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    threeCache.set(info, t);
  }
  return t;
}
