import { useEffect, useState, type ReactNode } from 'react';
import { frameSize, parseLenientJson, pngSize, type AssetStore } from '../assets/AssetStore';
import { useT } from '../i18n';
import { useApp } from '../state/appStore';
import { isAtlasTexture } from '../models/atlasMembership';
import { animationToGif, buildAnimation, readFrames } from '../render/animationIO';
import { basename } from '../models/resourceLocation';
import { Btn, downloadBytes, pickFiles } from './common';

/**
 * GUI for a texture's `.mcmeta`: only the settings Minecraft reads for this kind of texture
 * (animation, GUI scaling, villager hats, blur/clamp), plus a raw text editor for everything else.
 */

const VILLAGER = /^entity\/(zombie_)?villager\/(type|profession)\//;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const json = (o: unknown) => encoder.encode(JSON.stringify(o, null, 2));

type Frame = number | { index: number; time?: number };
interface Animation {
  frametime?: number;
  interpolate?: boolean;
  frames?: Frame[];
  width?: number;
  height?: number;
}

export function TextureMetaPanel({ store, path }: { store: AssetStore; path: string }) {
  const t = useT();
  const { setFile } = useApp();
  useApp((s) => s.revision); // re-render after edits
  const metaPath = `${path}.mcmeta`;
  const metaBytes = store.get(metaPath);
  const png = store.get(path);
  const size = png && pngSize(png);
  const rel = path.replace(/^assets\/[^/]+\/textures\//, '');

  let meta: Record<string, any> = {};
  let broken = false;
  if (metaBytes) {
    try {
      const parsed = parseLenientJson(decoder.decode(metaBytes));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) meta = parsed as Record<string, any>;
      else broken = true;
    } catch {
      broken = true;
    }
  }

  const write = (next: Record<string, any>) => {
    // An empty file is only worth keeping when it has to hide a vanilla one.
    setFile(metaPath, Object.keys(next).length || store.vanilla.has(metaPath) ? json(next) : null);
  };
  const setSection = (key: string, value: unknown) => {
    const next = { ...meta };
    if (value === undefined) delete next[key];
    else next[key] = value;
    write(next);
  };

  // textures drawn on their own rather than from an atlas can't be animated but read blur/clamp
  const standalone = !isAtlasTexture(store, path);
  return (
    <div className="flex flex-col gap-3 rounded border border-neutral-800 p-2 text-xs">
      <div>
        <div className="font-semibold">{t('meta.title')}</div>
        <p className="text-[11px] text-neutral-500">{t('meta.intro')}</p>
      </div>
      {broken && <div className="rounded bg-amber-950 p-2 text-amber-200">{t('meta.broken')}</div>}
      {size && (!standalone || meta.animation) && (
        <AnimationSection
          anim={meta.animation}
          size={size}
          onChange={(a) => setSection('animation', a)}
          onFrames={async (delta, anim) => {
            setFile(path, await resizeStrip(png!, frameSize(anim, ...size)[1], delta));
            setSection('animation', anim);
          }}
          onImport={async () => {
            const files = await pickFiles('image/*', true);
            if (!files.length) return;
            const { frames, delaysMs } = await readFrames(files);
            if (frames.length < 2) throw new Error(t('meta.anim.importTooFew'));
            const result = await buildAnimation(frames, delaysMs, { png, meta });
            setFile(path, result.png);
            write(result.meta);
          }}
          onGif={async () => downloadBytes(await animationToGif(png!, meta.animation), basename(path).replace(/\.png$/, '.gif'))}
        />
      )}
      {rel.startsWith('gui/sprites/') && size && (
        // an animated sprite is one frame big
        <GuiSection gui={meta.gui} size={meta.animation ? frameSize(meta.animation, ...size) : size} onChange={(g) => setSection('gui', g)} />
      )}
      {VILLAGER.test(rel) && <VillagerSection hat={meta.villager?.hat} onChange={(hat) => setSection('villager', hat ? { ...meta.villager, hat } : undefined)} />}
      {standalone && <RenderSection texture={meta.texture} onChange={(tx) => setSection('texture', tx)} />}
      <RawSection text={metaBytes ? decoder.decode(metaBytes) : ''} onApply={(o) => write(o)} />
    </div>
  );
}

/** Adds a copy of the last frame to a vertical strip, or removes the last frame. */
async function resizeStrip(png: Uint8Array, fh: number, delta: 1 | -1): Promise<Uint8Array> {
  const bmp = await createImageBitmap(new Blob([png], { type: 'image/png' }));
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height + delta * fh;
  const g = c.getContext('2d')!;
  g.drawImage(bmp, 0, 0);
  if (delta > 0) g.drawImage(bmp, 0, bmp.height - fh, bmp.width, fh, 0, bmp.height, bmp.width, fh);
  bmp.close();
  const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed');
  return new Uint8Array(await blob.arrayBuffer());
}

function AnimationSection({ anim, size, onChange, onFrames, onImport, onGif }: {
  anim: Animation | undefined;
  size: [number, number];
  onChange: (a: Animation | undefined) => void;
  onFrames: (delta: 1 | -1, a: Animation) => Promise<void>;
  onImport: () => Promise<void>;
  onGif: () => Promise<void>;
}) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [w, h] = size;
  const [fw, fh] = frameSize(anim ?? {}, w, h);
  const fits = w % fw === 0 && h % fh === 0;
  const count = Math.max(1, Math.floor(w / fw) * Math.floor(h / fh));
  const strip = fw === w;
  const busyWhile = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const frames = (f: (a: Animation) => Animation, delta: 1 | -1) => busyWhile(() => onFrames(delta, f(anim ?? {})));
  const importButton = (
    <Btn onClick={busyWhile(onImport)} disabled={busy} title={t('meta.anim.importTitle')}>
      {t('meta.anim.import')}
    </Btn>
  );

  if (!anim) {
    // Only frames stacked top to bottom: a tall image of square frames is animated as it is,
    // anything else becomes one frame (with its size written out) plus a copy below it.
    const stacked = h > w && h % w === 0;
    return (
      <Section title={t('meta.anim.title')}>
        <p className="text-neutral-400">{t('meta.anim.none')}</p>
        <div>
          {stacked ? (
            <Btn onClick={() => onChange({ frametime: 5 })}>{t('meta.anim.enable', { count: h / w })}</Btn>
          ) : (
            <Btn onClick={frames(() => (w === h ? { frametime: 5 } : { frametime: 5, width: w, height: h }), 1)} disabled={busy}>
              {t('meta.anim.enableAdd')}
            </Btn>
          )}
        </div>
        <div>{importButton}</div>
      </Section>
    );
  }

  const set = (patch: Partial<Animation>) => {
    const next: Animation = { ...anim, ...patch };
    for (const k of Object.keys(patch) as (keyof Animation)[]) if (patch[k] === undefined) delete next[k];
    onChange(next);
  };
  const frametime = anim.frametime ?? 1;
  const custom = Array.isArray(anim.frames);
  const steps = (anim.frames ?? []).map((f) => (typeof f === 'number' ? { index: f } : { index: Number(f?.index) || 0, time: f?.time }));
  const setSteps = (s: { index: number; time?: number }[]) => set({ frames: s.map((f) => (f.time === undefined ? f.index : { index: f.index, time: f.time })) });
  // removing the last frame drops it from the custom order too, so Minecraft doesn't reject the texture
  const withoutLast = (a: Animation): Animation => (a.frames ? { ...a, frames: a.frames.filter((f) => (typeof f === 'number' ? f : f.index) < count - 1) } : a);

  return (
    <Section title={t('meta.anim.title')}>
      <div className="text-neutral-400">{t('meta.anim.frames', { count, w: fw, h: fh })}</div>
      {!fits && <div className="rounded bg-amber-950 p-2 text-amber-200">{t('meta.anim.badSize')}</div>}
      <div className="flex flex-wrap gap-1">
        {strip && (
          <>
            <Btn onClick={frames((a) => (a.frames ? { ...a, frames: [...a.frames, count] } : a), 1)} disabled={busy} title={t('meta.anim.addFrameTitle')}>{t('meta.anim.addFrame')}</Btn>
            <Btn onClick={frames(withoutLast, -1)} disabled={busy || count <= 1}>{t('meta.anim.removeFrame')}</Btn>
          </>
        )}
        {importButton}
        <Btn onClick={busyWhile(onGif)} disabled={busy || !fits || count < 2} title={t('meta.anim.gifTitle')}>{t('meta.anim.gif')}</Btn>
      </div>
      <label className="flex items-center gap-2">
        <span className="w-28">{t('meta.anim.speed')}</span>
        <NumberField value={anim.frametime} placeholder="1" min={1} max={10000} onCommit={(v) => set({ frametime: v })} />
      </label>
      <p className="text-[11px] text-neutral-500">{t('meta.anim.speedHint', { seconds: +(frametime / 20).toFixed(2) })}</p>
      <Check checked={!!anim.interpolate} onChange={(v) => set({ interpolate: v || undefined })} label={t('meta.anim.interpolate')} hint={t('meta.anim.interpolateHint')} />
      <Check
        checked={custom}
        onChange={(v) => set({ frames: v ? Array.from({ length: count }, (_, i) => i) : undefined })}
        label={t('meta.anim.customOrder')}
        hint={t('meta.anim.customOrderHint')}
      />
      {custom && (
        <div className="flex flex-col gap-1">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <span className="w-5 text-right text-neutral-500">{i + 1}.</span>
              <select
                value={s.index}
                onChange={(e) => setSteps(steps.map((x, j) => (j === i ? { ...x, index: Number(e.target.value) } : x)))}
                className="rounded bg-neutral-800 px-1 py-0.5"
              >
                {Array.from({ length: Math.max(count, s.index + 1) }, (_, k) => (
                  <option key={k} value={k}>
                    {t('meta.anim.frame', { n: k + 1 })}
                  </option>
                ))}
              </select>
              <NumberField value={s.time} placeholder={String(frametime)} min={1} max={10000} title={t('meta.anim.duration')} onCommit={(time) => setSteps(steps.map((x, j) => (j === i ? { ...x, time } : x)))} />
              <span className="text-neutral-500">{t('meta.anim.ticks')}</span>
              <span className="ml-auto flex gap-0.5">
                <Btn onClick={() => setSteps(move(steps, i, -1))} disabled={i === 0}>↑</Btn>
                <Btn onClick={() => setSteps(move(steps, i, 1))} disabled={i === steps.length - 1}>↓</Btn>
                <Btn onClick={() => setSteps(steps.filter((_, j) => j !== i))} disabled={steps.length <= 1}>✕</Btn>
              </span>
            </div>
          ))}
          <div>
            <Btn onClick={() => setSteps([...steps, { index: ((steps.at(-1)?.index ?? -1) + 1) % count }])}>{t('meta.anim.addStep')}</Btn>
          </div>
        </div>
      )}
      <div>
        <Btn tone="danger" onClick={() => onChange(undefined)}>{t('meta.anim.remove')}</Btn>
      </div>
    </Section>
  );
}

function move<T>(list: T[], i: number, by: number): T[] {
  const next = [...list];
  [next[i], next[i + by]] = [next[i + by], next[i]];
  return next;
}

type Border = number | { left: number; top: number; right: number; bottom: number };
interface Scaling {
  type: 'stretch' | 'tile' | 'nine_slice';
  width?: number;
  height?: number;
  border?: Border;
  stretch_inner?: boolean;
}

function GuiSection({ gui, size, onChange }: { gui: { scaling?: Scaling } | undefined; size: [number, number]; onChange: (g: unknown) => void }) {
  const t = useT();
  const scaling: Scaling = gui?.scaling ?? { type: 'stretch' };
  const set = (s: Scaling | undefined) => onChange(s ? { ...gui, scaling: s } : undefined);
  const border = scaling.border ?? 0;
  const sides = typeof border === 'number' ? { left: border, top: border, right: border, bottom: border } : border;
  return (
    <Section title={t('meta.gui.title')}>
      <p className="text-[11px] text-neutral-500">{t('meta.gui.hint')}</p>
      <select
        value={scaling.type}
        onChange={(e) => {
          const type = e.target.value as Scaling['type'];
          if (type === 'stretch') return set(undefined);
          const base = { width: scaling.width ?? size[0], height: scaling.height ?? size[1] };
          set(type === 'tile' ? { type, ...base } : { type, ...base, border: scaling.border ?? Math.max(1, Math.floor(Math.min(...size) / 4)) });
        }}
        className="rounded bg-neutral-800 px-1 py-1"
      >
        {(['stretch', 'tile', 'nine_slice'] as const).map((k) => (
          <option key={k} value={k}>
            {t(`meta.gui.${k}`)}
          </option>
        ))}
      </select>
      {scaling.type !== 'stretch' && (
        <>
          <div className="flex items-center gap-2">
            <span>{t('meta.gui.width')}</span>
            <NumberField value={scaling.width} min={1} max={4096} onCommit={(width) => set({ ...scaling, width: width ?? size[0] })} />
            <span>{t('meta.gui.height')}</span>
            <NumberField value={scaling.height} min={1} max={4096} onCommit={(height) => set({ ...scaling, height: height ?? size[1] })} />
          </div>
          <p className="text-[11px] text-neutral-500">{t('meta.gui.sizeHint', { w: size[0], h: size[1] })}</p>
        </>
      )}
      {scaling.type === 'nine_slice' && (
        <>
          <Check
            checked={typeof border === 'number'}
            onChange={(same) => set({ ...scaling, border: same ? sides.left : { ...sides } })}
            label={t('meta.gui.sameBorder')}
          />
          {typeof border === 'number' ? (
            <label className="flex items-center gap-2">
              <span className="w-28">{t('meta.gui.border')}</span>
              <NumberField value={border} min={0} max={4096} onCommit={(b) => set({ ...scaling, border: b ?? 0 })} />
            </label>
          ) : (
            <div className="grid grid-cols-2 gap-1">
              {(['left', 'top', 'right', 'bottom'] as const).map((k) => (
                <label key={k} className="flex items-center gap-1">
                  <span className="w-14">{t(`meta.gui.${k}`)}</span>
                  <NumberField value={sides[k]} min={0} max={4096} onCommit={(b) => set({ ...scaling, border: { ...sides, [k]: b ?? 0 } })} />
                </label>
              ))}
            </div>
          )}
          <Check checked={!!scaling.stretch_inner} onChange={(v) => set({ ...scaling, stretch_inner: v || undefined })} label={t('meta.gui.stretchInner')} />
        </>
      )}
    </Section>
  );
}

function VillagerSection({ hat, onChange }: { hat: string | undefined; onChange: (hat: string | undefined) => void }) {
  const t = useT();
  return (
    <Section title={t('meta.villager.title')}>
      <p className="text-[11px] text-neutral-500">{t('meta.villager.hint')}</p>
      <select value={hat ?? 'none'} onChange={(e) => onChange(e.target.value === 'none' ? undefined : e.target.value)} className="rounded bg-neutral-800 px-1 py-1">
        {(['none', 'partial', 'full'] as const).map((k) => (
          <option key={k} value={k}>
            {t(`meta.villager.${k}`)}
          </option>
        ))}
      </select>
    </Section>
  );
}

function RenderSection({ texture, onChange }: { texture: { blur?: boolean; clamp?: boolean } | undefined; onChange: (tx: unknown) => void }) {
  const t = useT();
  const set = (k: 'blur' | 'clamp', v: boolean) => {
    const next = { ...texture, [k]: v || undefined };
    if (!v) delete next[k];
    onChange(Object.keys(next).length ? next : undefined);
  };
  return (
    <Section title={t('meta.render.title')}>
      <p className="text-[11px] text-neutral-500">{t('meta.render.hint')}</p>
      <Check checked={!!texture?.blur} onChange={(v) => set('blur', v)} label={t('meta.render.blur')} />
      <Check checked={!!texture?.clamp} onChange={(v) => set('clamp', v)} label={t('meta.render.clamp')} />
    </Section>
  );
}

function RawSection({ text, onApply }: { text: string; onApply: (o: Record<string, unknown>) => void }) {
  const t = useT();
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string>();
  useEffect(() => {
    setDraft(text);
    setError(undefined);
  }, [text]);
  const apply = () => {
    try {
      const o = draft.trim() ? parseLenientJson(draft) : {};
      if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error(t('meta.raw.notObject'));
      setError(undefined);
      onApply(o as Record<string, unknown>);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <details className="border-t border-neutral-800 pt-2">
      <summary className="cursor-pointer select-none text-neutral-400">{t('meta.raw.title')}</summary>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        spellCheck={false}
        rows={8}
        className="mt-2 w-full rounded bg-neutral-900 p-1 font-mono text-[11px] text-neutral-100"
      />
      {error && <div className="text-red-300">{t('meta.raw.invalid', { error })}</div>}
      <div className="mt-1">
        <Btn onClick={apply} disabled={draft === text}>{t('meta.raw.apply')}</Btn>
      </div>
    </details>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-t border-neutral-800 pt-2">
      <div className="font-medium text-neutral-300">{title}</div>
      {children}
    </div>
  );
}

function Check({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>
        {label}
        {hint && <span className="block text-[11px] text-neutral-500">{hint}</span>}
      </span>
    </label>
  );
}

/** Whole-number field that commits on blur or Enter; empty means "default" (undefined). */
export function NumberField({ value, onCommit, min, max, placeholder, title }: {
  value: number | undefined;
  onCommit: (v: number | undefined) => void;
  min: number;
  max: number;
  placeholder?: string;
  title?: string;
}) {
  const [draft, setDraft] = useState(value === undefined ? '' : String(value));
  useEffect(() => setDraft(value === undefined ? '' : String(value)), [value]);
  const commit = () => {
    if (!draft.trim()) return value !== undefined && onCommit(undefined);
    const n = Math.round(Number(draft.replace(',', '.')));
    if (!Number.isFinite(n)) return setDraft(value === undefined ? '' : String(value));
    const v = Math.max(min, Math.min(max, n));
    setDraft(String(v));
    if (v !== value) onCommit(v);
  };
  return (
    <input
      value={draft}
      title={title}
      placeholder={placeholder}
      inputMode="numeric"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="w-14 rounded bg-neutral-800 px-1 py-0.5 text-right"
    />
  );
}
