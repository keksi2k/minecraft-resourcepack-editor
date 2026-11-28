import { useMemo, useRef, useState } from 'react';
import type { AssetStore } from '../assets/AssetStore';
import type { MobDef } from '../entities/catalog';
import type { MobOptions } from '../entities/equipment';
import { isSlim, playerSkins, skinName } from '../entities/player';
import { useT } from '../i18n';
import { addCustomTexture } from '../render/textures';
import { useApp } from '../state/appStore';
import { Btn } from './common';

type Kind = 'skin' | 'cape';

/** Pictures you loaded, kept in this browser (they aren't part of the pack). */
const loaded: Partial<Record<Kind, string>> = {};
const STORAGE = (kind: Kind) => `playerCustom.${kind}`;

function dataUrl(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return `data:image/png;base64,${btoa(s)}`;
}

/** The texture id of the skin or cape you loaded last (also in an earlier session). */
function customTexture(kind: Kind): string | undefined {
  if (loaded[kind]) return loaded[kind];
  try {
    const url = localStorage.getItem(STORAGE(kind));
    if (!url) return undefined;
    const bin = atob(url.slice(url.indexOf(',') + 1));
    loaded[kind] = addCustomTexture(kind, Uint8Array.from(bin, (c) => c.charCodeAt(0)));
    return loaded[kind];
  } catch {
    return undefined;
  }
}

async function loadCustom(kind: Kind, file: File): Promise<string> {
  // whatever the browser can open becomes a PNG, so it's kept the same way
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) throw new Error('PNG');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  loaded[kind] = addCustomTexture(kind, bytes);
  try {
    localStorage.setItem(STORAGE(kind), dataUrl(bytes));
  } catch {
    // too big for the browser's storage: it's only kept until the page is reloaded
  }
  return loaded[kind]!;
}

/**
 * Player options: skin, cape, elytra and the items in both hands. Rows in the mob's look panel,
 * laid out like its other rows.
 */
export function PlayerLook({ store, mob, value, onChange, row, select }: {
  store: AssetStore;
  mob: MobDef;
  value: MobOptions;
  onChange: (o: MobOptions) => void;
  row: (label: string, control: React.ReactNode, key?: string) => React.ReactNode;
  select: string;
}) {
  const t = useT();
  const items = useApp((s) => s.items);
  const revision = useApp((s) => s.revision);
  const slim = isSlim(mob);
  const skins = useMemo(() => playerSkins(store, slim), [store, slim, revision]);
  const [error, setError] = useState<string>();
  const [, rerender] = useState(0);
  const files = { skin: useRef<HTMLInputElement>(null), cape: useRef<HTMLInputElement>(null) };
  const set = (patch: Partial<MobOptions>) => onChange({ ...value, ...patch });
  const ownSkin = customTexture('skin');
  const ownCape = customTexture('cape');

  const pick = (kind: Kind) => files[kind].current?.click();
  const onFile = async (kind: Kind, f: File) => {
    setError(undefined);
    try {
      const id = await loadCustom(kind, f);
      set(kind === 'skin' ? { skin: id } : { cape: id });
      rerender((n) => n + 1);
    } catch (e) {
      setError(t('mobs.playerLook.loadFailed', { error: (e as Error).message }));
    }
  };
  const known = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const itemInput = (key: 'mainHand' | 'offHand') => (
    <ItemField value={value[key]} known={known} label={t(`mobs.playerLook.${key}`)} placeholder={t('mobs.playerLook.itemPlaceholder')} className={`${select} w-48`} onChange={(id) => set({ [key]: id })} />
  );

  return (
    <>
      {row(
        t('mobs.playerLook.skin'),
        <span className="flex min-w-0 items-center gap-1">
          <select value={value.skin ?? ''} onChange={(e) => set({ skin: e.target.value || undefined })} aria-label={t('mobs.playerLook.skin')} className={select}>
            <option value="">{t('mobs.playerLook.defaultSkin', { name: skinName(mob.layers[0].texture) })}</option>
            {skins
              .filter((s) => s !== mob.layers[0].texture)
              .map((s) => (
                <option key={s} value={s}>
                  {skinName(s)}
                </option>
              ))}
            {ownSkin && <option value={ownSkin}>{t('mobs.playerLook.yourSkin')}</option>}
          </select>
          <Btn onClick={() => pick('skin')} title={t('mobs.playerLook.loadSkinTitle')}>
            {t('mobs.playerLook.load')}
          </Btn>
        </span>,
        'skin',
      )}
      {row(
        t('mobs.playerLook.cape'),
        <span className="flex min-w-0 items-center gap-1">
          <select value={value.cape ?? ''} onChange={(e) => set({ cape: e.target.value || undefined })} aria-label={t('mobs.playerLook.cape')} className={select}>
            <option value="">{t('mobs.look.none')}</option>
            {ownCape && <option value={ownCape}>{t('mobs.playerLook.yourCape')}</option>}
          </select>
          <Btn onClick={() => pick('cape')} title={t('mobs.playerLook.loadCapeTitle')}>
            {t('mobs.playerLook.load')}
          </Btn>
        </span>,
        'cape',
      )}
      {row(t('mobs.playerLook.elytra'), <input type="checkbox" checked={!!value.elytra} onChange={(e) => set({ elytra: e.target.checked || undefined })} />, 'elytra')}
      {row(t('mobs.playerLook.mainHand'), itemInput('mainHand'), 'main')}
      {row(t('mobs.playerLook.offHand'), itemInput('offHand'), 'off')}
      <datalist id="player-items">
        {items.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </datalist>
      {(['skin', 'cape'] as const).map((kind) => (
        <input
          key={kind}
          ref={files[kind]}
          type="file"
          hidden
          accept="image/png,image/*"
          aria-label={t(kind === 'skin' ? 'mobs.playerLook.loadSkinTitle' : 'mobs.playerLook.loadCapeTitle')}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void onFile(kind, f);
          }}
        />
      ))}
      {error && <p className="text-red-300">{error}</p>}
      <p className="text-[11px] leading-snug text-neutral-500">{t('mobs.playerLook.hint')}</p>
    </>
  );
}

/** An item id typed or picked from the list; only whole, known ids reach the preview. */
function ItemField({ value, known, label, placeholder, className, onChange }: {
  value?: string;
  known: Set<string>;
  label: string;
  placeholder: string;
  className: string;
  onChange: (id: string | undefined) => void;
}) {
  const [draft, setDraft] = useState(value ?? '');
  return (
    <input
      list="player-items"
      value={draft}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const id = text.trim().includes(':') ? text.trim() : `minecraft:${text.trim()}`;
        if (!text.trim()) onChange(undefined);
        else if (known.has(id)) onChange(id);
      }}
      placeholder={placeholder}
      aria-label={label}
      spellCheck={false}
      className={className}
    />
  );
}
