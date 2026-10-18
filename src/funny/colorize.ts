import { parseAnimation } from '../render/animation';

export const COLOR_STYLES = ['hue', 'rainbow', 'neon', 'invert'] as const;
export type ColorStyle = (typeof COLOR_STYLES)[number];

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 1) + 1) % 1;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [ch(h + 1 / 3) * 255, ch(h) * 255, ch(h - 1 / 3) * 255];
}

/**
 * Makes an RGBA image colourful in place. Shapes stay readable: lightness and alpha are kept (except
 * for `invert`), only hue and saturation change. `frameHeight` lets every frame of an animated
 * texture get the same gradient. `strength` (0–1) blends between the original and the full effect.
 */
export function colorizePixels(
  px: Uint8ClampedArray,
  width: number,
  height: number,
  style: ColorStyle,
  strength: number,
  random: () => number,
  frameHeight = height,
): void {
  const shift = random();
  const tilt = random() < 0.5 ? 1 : -1;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) continue;
    const x = (i / 4) % width;
    const y = Math.floor(i / 4 / width) % frameHeight;
    const [r, g, b] = [px[i], px[i + 1], px[i + 2]];
    let out: [number, number, number];
    if (style === 'invert') out = [255 - r, 255 - g, 255 - b];
    else {
      const [h, s, l] = rgbToHsl(r, g, b);
      if (style === 'hue') out = hslToRgb(h + shift, s + (1 - s) * 0.7, l);
      else if (style === 'rainbow') {
        const along = (x / Math.max(1, width - 1) + (tilt * y) / Math.max(1, frameHeight - 1)) / 2;
        out = hslToRgb(shift + along, 1, 0.25 + l * 0.55);
      } else {
        // neon: full saturation, stretched contrast
        const c = Math.min(1, Math.max(0, (l - 0.5) * 1.6 + 0.55));
        out = hslToRgb(h + shift, 1, c);
      }
    }
    px[i] = r + (out[0] - r) * strength;
    px[i + 1] = g + (out[1] - g) * strength;
    px[i + 2] = b + (out[2] - b) * strength;
  }
}

/** Decodes a PNG, colourizes it and encodes it again (browser only). */
export async function colorizePng(
  bytes: Uint8Array,
  mcmeta: any,
  style: ColorStyle,
  strength: number,
  random: () => number,
): Promise<Uint8Array> {
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
  const { width, height } = bmp;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  bmp.close();
  const img = g.getImageData(0, 0, width, height);
  const frameHeight = parseAnimation(mcmeta?.animation, width, height)?.fh ?? height;
  colorizePixels(img.data, width, height, style, strength, random, frameHeight);
  g.putImageData(img, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  return new Uint8Array(await blob.arrayBuffer());
}
