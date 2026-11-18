import type { Pixels } from './pixelEdit';

/** Decodes any image the browser can read (PNG, JPG, WebP, the first frame of a GIF …) into RGBA. */
export async function decodeImage(bytes: Uint8Array | Blob): Promise<Pixels> {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes]);
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(bmp, 0, 0);
  bmp.close();
  const img = g.getImageData(0, 0, c.width, c.height);
  return { width: img.width, height: img.height, data: img.data };
}

export async function encodePng(p: Pixels): Promise<Uint8Array> {
  const c = document.createElement('canvas');
  c.width = p.width;
  c.height = p.height;
  c.getContext('2d')!.putImageData(new ImageData(p.data.slice(), p.width, p.height), 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  return new Uint8Array(await blob.arrayBuffer());
}
