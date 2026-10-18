import { get, set } from 'idb-keyval';
import { t } from '../i18n';

export type Progress = (loaded: number, total: number) => void;

export async function fetchBytes(url: string, onProgress?: Progress): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(t('errors.http', { status: res.status, url }));
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !onProgress) return new Uint8Array(await res.arrayBuffer());

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

/** JSON fetch memoised in IndexedDB; Mojang's package URLs are content-addressed, so they never go stale. */
export async function fetchJsonCached<T>(url: string, cacheKey = `json:${url}`): Promise<T> {
  const hit = await get<T>(cacheKey).catch(() => undefined);
  if (hit) return hit;
  const res = await fetch(url);
  if (!res.ok) throw new Error(t('errors.http', { status: res.status, url }));
  const json = (await res.json()) as T;
  await set(cacheKey, json).catch(() => {});
  return json;
}
