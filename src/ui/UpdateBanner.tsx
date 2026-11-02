import { useEffect, useState } from 'react';
import { useT } from '../i18n';
import { APP_VERSION, availableUpdate, dismissUpdate, type Release } from '../update/updateCheck';

/** A slim bar that appears when a newer release is out. */
export function UpdateBanner() {
  const t = useT();
  const [update, setUpdate] = useState<Release>();
  useEffect(() => {
    // dev builds run from source; there's nothing to download
    if (import.meta.env.DEV) return;
    let alive = true;
    void availableUpdate().then((u) => alive && setUpdate(u));
    return () => {
      alive = false;
    };
  }, []);
  if (!update) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 bg-emerald-900 px-4 py-1.5 text-xs text-emerald-50">
      <span>⬆ {t('update.available', { version: update.version, current: APP_VERSION })}</span>
      <a href={update.url} target="_blank" rel="noreferrer" className="rounded bg-emerald-700 px-2 py-0.5 font-medium hover:bg-emerald-600">
        {t('update.download')}
      </a>
      <span className="text-emerald-200/80">{t('update.howTo')}</span>
      <button
        onClick={() => {
          dismissUpdate(update.version);
          setUpdate(undefined);
        }}
        className="ml-auto text-emerald-200 hover:text-white"
        title={t('update.dismissTitle')}
      >
        {t('update.dismiss')}
      </button>
    </div>
  );
}
