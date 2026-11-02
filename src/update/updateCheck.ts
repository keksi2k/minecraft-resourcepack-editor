/** The running version and repository, from package.json (set by vite.config.ts). */
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
export const APP_REPO: string = typeof __APP_REPO__ === 'string' ? __APP_REPO__ : '';

export interface Release {
  version: string;
  url: string;
}

/** Compares dotted versions (`v` prefix and pre-release suffixes ignored): <0, 0 or >0. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.replace(/^v/i, '').split(/[-+]/)[0].split('.').map((n) => parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

const CACHE_KEY = 'rpe.latestRelease';
const DISMISS_KEY = 'rpe.dismissedRelease';
const MAX_AGE = 12 * 60 * 60 * 1000;

function storage(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

/** The newest published release on GitHub; asked at most every 12 hours, `undefined` if unreachable. */
export async function latestRelease(fetchFn: typeof fetch = fetch, now = Date.now()): Promise<Release | undefined> {
  const store = storage();
  try {
    const cached = JSON.parse(store?.getItem(CACHE_KEY) ?? 'null') as (Release & { at: number }) | null;
    if (cached && now - cached.at < MAX_AGE) return { version: cached.version, url: cached.url };
  } catch {}
  const m = /github\.com\/([^/]+\/[^/]+?)(?:\.git)?\/?$/.exec(APP_REPO);
  if (!m) return undefined;
  try {
    const res = await fetchFn(`https://api.github.com/repos/${m[1]}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return undefined;
    const json = (await res.json()) as { tag_name?: string; html_url?: string };
    if (!json.tag_name) return undefined;
    const release = { version: json.tag_name.replace(/^v/i, ''), url: json.html_url ?? `${APP_REPO}/releases/latest` };
    try {
      store?.setItem(CACHE_KEY, JSON.stringify({ ...release, at: now }));
    } catch {}
    return release;
  } catch {
    return undefined; // offline or blocked: just don't say anything
  }
}

/** A newer release than the running one that the user hasn't dismissed, if any. */
export async function availableUpdate(fetchFn?: typeof fetch): Promise<Release | undefined> {
  const r = await latestRelease(fetchFn);
  if (!r || compareVersions(r.version, APP_VERSION) <= 0) return undefined;
  if (storage()?.getItem(DISMISS_KEY) === r.version) return undefined;
  return r;
}

export function dismissUpdate(version: string) {
  try {
    storage()?.setItem(DISMISS_KEY, version);
  } catch {}
}
