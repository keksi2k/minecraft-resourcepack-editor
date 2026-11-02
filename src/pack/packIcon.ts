import { t } from '../i18n';

export const PACK_ICON = 'pack.png';

/**
 * Turns any image into a pack icon: Minecraft shows pack.png as a square, so other shapes are
 * cropped to their centre. Pixel art stays sharp; big photos are scaled down to 256×256.
 */
export async function makePackIcon(file: Blob): Promise<Uint8Array> {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error(t('header.icon.notImage'));
  }
  const side = Math.min(bmp.width, bmp.height);
  const out = Math.min(side, 256);
  const c = document.createElement('canvas');
  c.width = c.height = out;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = out < side; // only smooth when shrinking
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, out, out);
  bmp.close();
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error(t('header.icon.notImage'));
  return new Uint8Array(await blob.arrayBuffer());
}
