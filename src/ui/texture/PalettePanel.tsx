import { useRef, useState } from 'react';
import { useT } from '../../i18n';
import { fetchLospec, loadPalettes, lospecSlug, paletteColor, paletteFromImage, parsePalette, savePalettes, type Palette } from '../../render/palettes';
import type { RGBA } from '../../render/pixelEdit';
import { decodeImage } from '../../render/png';
import { Btn } from '../common';
import { Section, Swatches } from './parts';

const CHOSEN = 'texturePaletteChosen';

const remembered = () => {
  try {
    return localStorage.getItem(CHOSEN) ?? '';
  } catch {
    return '';
  }
};

/** Saved palettes: import from a file or Lospec, pick colours, snap the texture to one. */
export function PalettePanel({ current, onPick, onSnap, busy }: { current: RGBA; onPick: (c: RGBA) => void; onSnap: (colors: string[]) => void; busy?: boolean }) {
  const t = useT();
  const [list, setList] = useState<Palette[]>(loadPalettes);
  const [chosen, setChosen] = useState(remembered);
  const [lospec, setLospec] = useState('');
  const [status, setStatus] = useState<{ error?: boolean; text: string }>();
  const [loading, setLoading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const palette = list.find((p) => p.name === chosen);

  const choose = (name: string) => {
    setChosen(name);
    try {
      localStorage.setItem(CHOSEN, name);
    } catch {
      // not kept, fine
    }
  };
  const keep = (p: Palette) => {
    // a palette with the same name is replaced
    const next = [...list.filter((x) => x.name !== p.name), p].sort((a, b) => a.name.localeCompare(b.name));
    setList(next);
    savePalettes(next);
    choose(p.name);
    setStatus({ text: t('editor.texture.paletteAdded', { name: p.name, count: p.colors.length }) });
  };

  const fromLospec = async () => {
    const slug = lospecSlug(lospec);
    if (!slug) return setStatus({ error: true, text: t('editor.texture.lospecBadName') });
    setLoading(true);
    setStatus(undefined);
    try {
      keep(await fetchLospec(slug));
      setLospec('');
    } catch (e) {
      setStatus({ error: true, text: t('editor.texture.lospecFailed', { name: slug, error: (e as Error).message }) });
    } finally {
      setLoading(false);
    }
  };

  const fromFile = async (f: File) => {
    try {
      const colors = /\.(png|gif|bmp|jpe?g|webp)$/i.test(f.name) ? paletteFromImage(await decodeImage(f)) : parsePalette(await f.text());
      if (!colors.length) return setStatus({ error: true, text: t('editor.texture.paletteEmpty', { name: f.name }) });
      keep({ name: f.name.replace(/\.[^.]+$/, ''), colors });
    } catch (e) {
      setStatus({ error: true, text: (e as Error).message });
    }
  };

  const remove = () => {
    if (!palette) return;
    const next = list.filter((p) => p !== palette);
    setList(next);
    savePalettes(next);
    choose('');
  };

  return (
    <Section title={t('editor.texture.palettes')}>
      {list.length > 0 && (
        <div className="flex items-center gap-1">
          <select value={palette ? chosen : ''} onChange={(e) => choose(e.target.value)} aria-label={t('editor.texture.palettes')} className="min-w-0 flex-1 rounded bg-neutral-800 px-1 py-1">
            <option value="">{t('editor.texture.noPalette')}</option>
            {list.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({p.colors.length})
              </option>
            ))}
          </select>
          {palette && (
            <Btn onClick={remove} tone="danger" title={t('editor.texture.removePalette')}>
              ✕
            </Btn>
          )}
        </div>
      )}
      {palette && (
        <>
          <Swatches colors={palette.colors.map(paletteColor)} current={current} onPick={onPick} />
          <Btn onClick={() => onSnap(palette.colors)} disabled={busy} title={t('editor.texture.snapTitle')}>
            {t('editor.texture.snap')}
          </Btn>
          {palette.source && (
            <a href={palette.source} target="_blank" rel="noreferrer" className="truncate text-[11px] text-sky-400 hover:underline">
              {palette.source.replace(/^https:\/\//, '')}
            </a>
          )}
        </>
      )}
      <form
        className="flex gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          void fromLospec();
        }}
      >
        <input
          value={lospec}
          onChange={(e) => setLospec(e.target.value)}
          placeholder={t('editor.texture.lospecPlaceholder')}
          aria-label={t('editor.texture.lospecPlaceholder')}
          className="min-w-0 flex-1 rounded bg-neutral-800 px-1 py-1"
        />
        <Btn onClick={() => void fromLospec()} disabled={loading || !lospec.trim()}>
          {loading ? '…' : t('editor.texture.lospecLoad')}
        </Btn>
      </form>
      <Btn onClick={() => file.current?.click()}>{t('editor.texture.paletteFile')}</Btn>
      <input
        ref={file}
        type="file"
        hidden
        accept=".hex,.gpl,.pal,.txt,.json,.png,.gif"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void fromFile(f);
        }}
      />
      {status && <p className={`text-[11px] leading-snug ${status.error ? 'text-red-300' : 'text-neutral-400'}`}>{status.text}</p>}
      <p className="text-[11px] leading-snug text-neutral-500">{t('editor.texture.paletteHint')}</p>
    </Section>
  );
}
