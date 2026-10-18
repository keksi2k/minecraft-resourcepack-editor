import JSZip from 'jszip';
import type { AssetStore } from '../assets/AssetStore';
import { t } from '../i18n';

export function newPackMeta(packFormat: number, description: string): Uint8Array {
  // pack_format for older games, min/max_format for 1.21.9+; each version ignores the other fields.
  const meta = {
    pack: { pack_format: packFormat, min_format: packFormat, max_format: packFormat, description },
  };
  return new TextEncoder().encode(JSON.stringify(meta, null, 2));
}

export async function exportPackZip(store: AssetStore, fallbackFormat: number | undefined): Promise<Blob> {
  const files = store.exportFiles();
  if (!files.has('pack.mcmeta')) files.set('pack.mcmeta', newPackMeta(fallbackFormat ?? 46, t('load.newPackDescription')));
  const zip = new JSZip();
  for (const [path, data] of files) zip.file(path, data);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
