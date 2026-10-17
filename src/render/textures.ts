import * as THREE from 'three';
import type { AssetStore } from '../assets/AssetStore';
import { texturePath } from '../models/resourceLocation';

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
}

const cache = new Map<string, Promise<TexInfo>>();
const threeCache = new WeakMap<TexInfo, THREE.Texture>();

function toInfo(canvas: HTMLCanvasElement, frames: number, missing: boolean): TexInfo {
  const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  let translucent = false;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > 0 && pixels[i] < 255) {
      translucent = true;
      break;
    }
  }
  return { canvas, width: canvas.width, height: canvas.height, pixels, translucent, frames, missing };
}

function missingTexture(): TexInfo {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#f800f8';
  g.fillRect(0, 0, 8, 8);
  g.fillRect(8, 8, 8, 8);
  return toInfo(c, 1, true);
}

async function decode(bytes: Uint8Array, mcmeta: any): Promise<TexInfo> {
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  let fw = bmp.width;
  let fh = bmp.height;
  let frames = 1;
  const anim = mcmeta?.animation;
  if (anim) {
    fw = Math.min(bmp.width, anim.width ?? Math.min(bmp.width, bmp.height));
    fh = Math.min(bmp.height, anim.height ?? fw);
    frames = Math.max(1, Math.floor(bmp.width / fw) * Math.floor(bmp.height / fh));
  }
  const c = document.createElement('canvas');
  c.width = fw;
  c.height = fh;
  c.getContext('2d')!.drawImage(bmp, 0, 0, fw, fh, 0, 0, fw, fh);
  bmp.close();
  return toInfo(c, frames, false);
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

export function threeTexture(info: TexInfo): THREE.Texture {
  let t = threeCache.get(info);
  if (!t) {
    t = new THREE.CanvasTexture(info.canvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    threeCache.set(info, t);
  }
  return t;
}
