import { useMemo, useRef, useState } from 'react';
import type { AssetStore } from '../../assets/AssetStore';
import { useT } from '../../i18n';
import { slugify } from '../../models/customNames';
import type { Pixels } from '../../render/pixelEdit';
import { decodeImage, encodePng } from '../../render/png';
import { drawText, pixelsCanvas } from '../../scenes/draw';
import { addGlyph, codePointLabel, fontPath, layoutText, nextFreeChar, removeGlyph, rowCodePoints, type BitmapProvider, type Font } from '../../scenes/font';
import { useApp } from '../../state/appStore';
import { Btn, pickFile } from '../common';
import { FileRow, Section, TextureRow } from '../ItemDetail';
import { CodeBar } from '../TextsView';
import { SceneLayout } from './ScenesView';
import { GuiCanvas, useFont } from './gui';

const DEFAULT_FONT = 'minecraft:default';
const SAMPLE = '§eHello, §lMinecraft§r!\n§7The quick brown fox jumps over the lazy dog.\n§aÄÖÜ äöü ß §b0123456789 §d§o(italic) §c§nunderlined';
const BACKGROUNDS = { dark: '#1e1e1e', chat: 'rgba(0,0,0,0.5)', light: '#c6c6c6' } as const;

const textureId = (path: string) => path.replace(/^assets\/([^/]+)\/textures\/(.+)\.png$/, '$1:$2');

/** A provider's glyph sheet with its grid; hovering shows the character, clicking adds it to the preview. */
function GlyphSheet({ font, provider, onPick }: { font: Font; provider: BitmapProvider; onPick: (ch: string) => void }) {
  const t = useT();
  const sheet = font.sheets.get(provider.file);
  const url = useMemo(() => (sheet ? pixelsCanvas(sheet).toDataURL() : ''), [sheet]);
  const rows = provider.chars.map(rowCodePoints);
  const cols = Math.max(1, ...rows.map((r) => r.length));
  const [hover, setHover] = useState<number>();
  if (!sheet) return <div className="text-xs text-neutral-500">{t('source.missing')}</div>;
  const zoom = Math.max(1, Math.min(4, Math.floor(384 / sheet.width)));
  return (
    <div className="flex flex-col gap-1">
      <div
        className="checker relative cursor-pointer"
        style={{ width: sheet.width * zoom, height: sheet.height * zoom }}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const c = Math.floor(((e.clientX - r.left) / r.width) * cols);
          const row = Math.floor(((e.clientY - r.top) / r.height) * rows.length);
          setHover(rows[row]?.[c]);
        }}
        onPointerLeave={() => setHover(undefined)}
        onClick={() => hover && onPick(String.fromCodePoint(hover))}
      >
        <img src={url} alt="" className="pixelated h-full w-full" draggable={false} />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.08) 1px, transparent 1px)',
            backgroundSize: `${(sheet.width * zoom) / cols}px ${(sheet.height * zoom) / rows.length}px`,
          }}
        />
      </div>
      <div className="h-4 font-mono text-[11px] text-neutral-400">{hover ? `${String.fromCodePoint(hover)}  ${codePointLabel(hover)}` : t('scenes.fonts.sheetHint')}</div>
    </div>
  );
}

/** The default font: a live text preview, every glyph sheet, and glyphs of the pack's own. */
export function FontsScreen({ store }: { store: AssetStore }) {
  const t = useT();
  const { setFile, resetFile } = useApp();
  const font = useFont(store, DEFAULT_FONT);
  const [text, setText] = useState(SAMPLE);
  const [scale, setScale] = useState(3);
  const [shadow, setShadow] = useState(true);
  const [bg, setBg] = useState<keyof typeof BACKGROUNDS>('dark');
  const [height, setHeight] = useState(8);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState<string>();
  const input = useRef<HTMLTextAreaElement>(null);

  const lines = text.split('\n');
  const width = font ? Math.max(40, ...lines.map((l) => layoutText(font, l).width)) + 4 : 40;
  const bitmaps = (font?.providers.filter((p) => p.type === 'bitmap') ?? []) as BitmapProvider[];
  const own = bitmaps.filter((p) => p.from === 'pack');
  const path = fontPath(DEFAULT_FONT);

  const addOwnGlyph = async () => {
    const file = await pickFile('image/*');
    if (!file || !font) return;
    setError(undefined);
    try {
      const pixels: Pixels = await decodeImage(file);
      const slug = slugify(file.name.replace(/\.[^.]+$/, '')) || 'glyph';
      let name = slug;
      for (let i = 2; store.has(`assets/minecraft/textures/font/custom/${name}.png`); i++) name = `${slug}_${i}`;
      const png = await encodePng(pixels);
      const char = nextFreeChar(font.providers);
      setFile(`assets/minecraft/textures/font/custom/${name}.png`, png);
      const current = store.source(path) === 'vanilla' ? undefined : store.json(path);
      setFile(
        path,
        new TextEncoder().encode(
          JSON.stringify(addGlyph(current, { file: `minecraft:font/custom/${name}.png`, char, height, ascent: Math.min(height - 1, 7 + Math.ceil((height - 8) / 2)) }), null, 2),
        ),
      );
      setText((s) => `${s}${s.endsWith('\n') ? '' : ' '}${char}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const removeOwnGlyph = (p: BitmapProvider) => {
    const char = p.chars[0];
    const current = store.json(path);
    const next = removeGlyph(current, char);
    if (next.providers.length) setFile(path, new TextEncoder().encode(JSON.stringify(next, null, 2)));
    else drop(path);
    if (/\/textures\/font\/custom\//.test(p.file) && !store.vanilla.has(p.file)) drop(p.file);
  };

  /** Removes a file from the pack; a file only your edits added just goes away again. */
  const drop = (file: string) => (store.pack.has(file) ? setFile(file, null) : resetFile(file));

  const copy = (ch: string) => {
    void navigator.clipboard?.writeText(ch).catch(() => undefined);
    setCopied(ch);
    setTimeout(() => setCopied(undefined), 1500);
  };

  return (
    <SceneLayout
      main={
        <div className="absolute inset-0 overflow-y-auto p-4">
          <div className="flex flex-col gap-2">
            <CodeBar target={input} onInsert={setText} />
            <textarea
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              className="w-full rounded bg-neutral-800 p-2 font-mono text-sm outline-none focus:ring-1 focus:ring-emerald-500"
            />
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <label className="flex items-center gap-1">
                {t('scenes.fonts.scale')}
                <select value={scale} onChange={(e) => setScale(Number(e.target.value))} className="rounded bg-neutral-800 px-1 py-0.5">
                  {[1, 2, 3, 4, 6].map((s) => (
                    <option key={s} value={s}>
                      ×{s}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={shadow} onChange={(e) => setShadow(e.target.checked)} /> {t('scenes.fonts.shadow')}
              </label>
              <span className="flex items-center gap-1">
                {(Object.keys(BACKGROUNDS) as (keyof typeof BACKGROUNDS)[]).map((b) => (
                  <button key={b} onClick={() => setBg(b)} className={`rounded px-2 py-0.5 ${bg === b ? 'bg-neutral-600' : 'bg-neutral-800 hover:bg-neutral-700'}`}>
                    {t(`scenes.fonts.bg.${b}`)}
                  </button>
                ))}
              </span>
            </div>
            <div className="overflow-x-auto rounded p-2" style={{ background: bg === 'chat' ? '#6a8f4e' : BACKGROUNDS[bg] }}>
              {font && (
                <GuiCanvas
                  width={width}
                  height={lines.length * 10 + 2}
                  scale={scale}
                  draw={(ctx) => {
                    if (bg === 'chat') {
                      ctx.fillStyle = BACKGROUNDS.chat;
                      ctx.fillRect(0, 0, width, lines.length * 10 + 2);
                    }
                    lines.forEach((l, i) => drawText(ctx, font, l, 2, 1 + i * 10, { shadow }));
                  }}
                />
              )}
            </div>
          </div>

          <h3 className="mb-1 mt-6 text-sm font-semibold">{t('scenes.fonts.sheets')}</h3>
          <p className="mb-3 text-xs text-neutral-400">{t('scenes.fonts.sheetsHint')}</p>
          <div className="flex flex-wrap gap-6">
            {font &&
              bitmaps
                .filter((p) => p.from === 'vanilla' || p.chars.length > 1 || p.chars[0]?.length > 1)
                .map((p, i) => (
                  <div key={`${p.file}|${i}`} className="flex flex-col gap-1">
                    <div className="font-mono text-[11px] text-neutral-300">
                      {textureId(p.file)} · {t('scenes.fonts.metrics', { height: p.height, ascent: p.ascent })}
                    </div>
                    <GlyphSheet font={font} provider={p} onPick={(ch) => setText((s) => s + ch)} />
                  </div>
                ))}
          </div>
        </div>
      }
      aside={
        <>
          <div className="p-3">
            <h2 className="text-base font-semibold">{t('scenes.fonts.title')}</h2>
            <p className="text-xs text-neutral-400">{t('scenes.fonts.hint')}</p>
          </div>
          <Section title={t('scenes.fonts.ownGlyphs')}>
            <p className="mb-2 text-xs text-neutral-400">{t('scenes.fonts.ownHint')}</p>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <Btn tone="primary" onClick={() => void addOwnGlyph()} disabled={!font}>
                {t('scenes.fonts.addGlyph')}
              </Btn>
              <label className="flex items-center gap-1">
                {t('scenes.fonts.height')}
                <select value={height} onChange={(e) => setHeight(Number(e.target.value))} className="rounded bg-neutral-800 px-1 py-0.5">
                  {[7, 8, 9, 10, 12, 16].map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {error && <p className="mb-2 text-xs text-red-400">{error}</p>}
            <div className="flex flex-col gap-2">
              {own.map((p) => {
                const cp = p.chars[0]?.codePointAt(0) ?? 0;
                return (
                  <div key={`${p.file}|${cp}`} className="flex items-center gap-2 rounded bg-neutral-900 p-2">
                    <div className="min-w-0 flex-1">
                      <TextureRow store={store} id={textureId(p.file)} />
                      <div className="mt-1 flex items-center gap-2 font-mono text-[11px] text-neutral-400">
                        <span>
                          {codePointLabel(cp)} · {t('scenes.fonts.metrics', { height: p.height, ascent: p.ascent })}
                        </span>
                        <Btn onClick={() => copy(p.chars[0])} title={t('scenes.fonts.copyTitle')}>
                          {copied === p.chars[0] ? '✓' : t('scenes.fonts.copy')}
                        </Btn>
                        {p.chars.length === 1 && [...p.chars[0]].length === 1 && (
                          <Btn tone="danger" onClick={() => removeOwnGlyph(p)}>
                            {t('scenes.fonts.remove')}
                          </Btn>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {own.length === 0 && <p className="text-xs text-neutral-500">{t('scenes.fonts.noOwn')}</p>}
            </div>
          </Section>
          <Section title={t('scenes.fonts.files')}>
            <FileRow store={store} path={path} label="font/default.json" />
            <div className="mt-2 flex flex-col gap-3">
              {[...new Set(bitmaps.filter((p) => p.from === 'vanilla').map((p) => p.file))].map((file) => (
                <TextureRow key={file} store={store} id={textureId(file)} />
              ))}
            </div>
          </Section>
        </>
      }
    />
  );
}
