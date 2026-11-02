import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import {
  changeSpeed,
  compress,
  distort,
  filter,
  fitLength,
  pitchShift,
  reverb,
  splice,
  timeStretch,
  clipDuration,
  clipLength,
  crop,
  cut,
  dbToGain,
  decodeAudio,
  echo,
  encodeOgg,
  fadeIn,
  fadeOut,
  gain,
  insertSilence,
  normalize,
  peaks,
  reverse,
  silence,
  toMono,
  trimSilence,
  type Clip,
} from '../sounds/audioEdit';
import { inspectOgg } from '../sounds/editSounds';
import { stopSound } from '../sounds/player';
import { startRecording, type Recording } from '../sounds/recorder';
import { useApp } from '../state/appStore';
import { useEditor } from '../state/editorStore';
import { Btn, pickFile } from './common';

const HISTORY = 40;
const HEIGHT = 220;

/** Selection in samples; `a === b` is just a cursor. */
type Sel = { a: number; b: number };

const fmt = (s: number) => s.toFixed(s < 10 ? 2 : 1);

let ctx: AudioContext | undefined;
const audioCtx = () => (ctx ??= new AudioContext());

export function SoundEditor({ path, bytes, onSave, onDone }: {
  path: string;
  bytes: Uint8Array;
  /** Saves elsewhere instead of overwriting `path`. */
  onSave?: (bytes: Uint8Array) => void;
  onDone: () => void;
}) {
  const t = useT();
  const setFile = useApp((s) => s.setFile);
  const [clip, setClip] = useState<Clip>();
  const [error, setError] = useState<string>();
  const [sel, setSel] = useState<Sel>({ a: 0, b: 0 });
  const [viewRange, setViewRange] = useState<[number, number]>([0, 0]);
  const [playhead, setPlayhead] = useState<number>();
  const [isPlaying, setIsPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fx, setFx] = useState({
    gain: 3,
    comp: 0.5,
    pitch: 0,
    tempo: 100,
    speed: 1,
    bass: 6,
    treble: 6,
    lowpass: 3000,
    highpass: 300,
    roomSize: 0.5,
    roomMix: 0.35,
    delay: 180,
    decay: 0.45,
    repeats: 3,
    drive: 4,
  });
  const set = (k: keyof typeof fx) => (v: number) => setFx((f) => ({ ...f, [k]: v }));
  const [quality, setQuality] = useState(5);
  const [saving, setSaving] = useState(false);
  const [width, setWidth] = useState(900);
  const undo = useRef<Clip[]>([]);
  const redo = useRef<Clip[]>([]);
  const dirty = useRef(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
  const playing = useRef<{ src: AudioBufferSourceNode; raf: number } | null>(null);
  const recording = useRef<Recording | null>(null);
  const [rec, setRec] = useState<{ start: number; seconds: number; level: number }>();

  const load = useCallback(async (b: Uint8Array) => {
    // a new variant starts empty, ready for a recording
    if (b.length === 0) return { sampleRate: 48000, channels: [new Float32Array(0)] } as Clip;
    const info = inspectOgg(b);
    // keep the file's own sample rate so an untouched sound isn't resampled
    return decodeAudio(b, typeof info === 'string' ? 44100 : info.sampleRate);
  }, []);

  useEffect(() => {
    stopSound();
    load(bytes).then(
      (c) => {
        setClip(c);
        setViewRange([0, clipLength(c)]);
      },
      (e) => setError((e as Error).message),
    );
  }, [bytes, load]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(200, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const stop = useCallback(() => {
    const p = playing.current;
    if (!p) return;
    p.src.onended = null;
    try {
      p.src.stop();
    } catch {}
    cancelAnimationFrame(p.raf);
    playing.current = null;
    setPlayhead(undefined);
    setIsPlaying(false);
  }, []);
  useEffect(() => stop, [stop]);

  const play = (from: number, to: number, c = clip, showHead = c === clip) => {
    const clip = c;
    if (!clip) return;
    stop();
    const ac = audioCtx();
    void ac.resume();
    const buf = ac.createBuffer(clip.channels.length, Math.max(1, clipLength(clip)), clip.sampleRate);
    clip.channels.forEach((ch, i) => buf.copyToChannel(ch, i));
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(ac.destination);
    const startAt = ac.currentTime;
    const offset = from / clip.sampleRate;
    const dur = Math.max(0, (to - from) / clip.sampleRate);
    src.start(0, offset, dur);
    const tick = () => {
      const p = playing.current;
      if (!p) return;
      if (showHead) setPlayhead(from + (ac.currentTime - startAt) * clip.sampleRate);
      p.raf = requestAnimationFrame(tick);
    };
    playing.current = { src, raf: requestAnimationFrame(tick) };
    setIsPlaying(true);
    src.onended = () => stop();
  };

  const hasSel = sel.a !== sel.b;
  const [selA, selB] = [Math.min(sel.a, sel.b), Math.max(sel.a, sel.b)];

  const togglePlay = () => {
    if (!clip) return;
    if (playing.current) return stop();
    if (hasSel) play(selA, selB);
    else play(sel.a < clipLength(clip) ? sel.a : 0, clipLength(clip));
  };

  const markDirty = (d: boolean) => {
    dirty.current = d;
    useEditor.setState({ dirty: d });
  };

  /** Applies an edit; `keepSel` leaves the selection where it was (for in-place effects). */
  const apply = (fn: (c: Clip) => Clip, keepSel = true) => {
    if (!clip) return;
    stop();
    const next = fn(clip);
    if (next === clip) return;
    undo.current.push(clip);
    if (undo.current.length > HISTORY) undo.current.shift();
    redo.current = [];
    markDirty(true);
    setClip(next);
    const n = clipLength(next);
    if (!keepSel || n !== clipLength(clip)) {
      setSel({ a: Math.min(selA, n), b: Math.min(selA, n) });
      setViewRange([0, n]);
    }
  };

  // range helpers: the selection, or everything when only a cursor is set
  const r = (): [number, number] => (hasSel ? [selA, selB] : [0, clip ? clipLength(clip) : 0]);

  type Effect = (c: Clip) => Clip | Promise<Clip>;
  /**
   * Runs an effect on the selection (or everything). `keepLength` cuts effects with a tail (reverb,
   * echo) to the selection, so the rest of the sound doesn't move.
   */
  const process = async (c: Clip, fn: Effect, keepLength: boolean): Promise<{ part: Clip; result: Clip }> => {
    if (!hasSel) {
      const part = await fn(c);
      return { part, result: part };
    }
    let part = await fn(crop(c, selA, selB));
    if (keepLength) part = fitLength(part, selB - selA);
    return { part, result: splice(c, selA, selB, part) };
  };
  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    try {
      await job();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  /** Applies an effect for good (undoable). */
  const applyFx = (fn: Effect, keepLength = true) =>
    run(async () => {
      if (!clip) return;
      const { result } = await process(clip, fn, keepLength);
      apply(() => result, clipLength(result) === clipLength(clip));
    });
  /** Plays what an effect would sound like, without changing anything. */
  const previewFx = (fn: Effect, keepLength = true) =>
    run(async () => {
      if (!clip) return;
      const { part } = await process(clip, fn, keepLength);
      play(0, clipLength(part), part, false);
    });

  const step = (from: typeof undo, to: typeof undo) => {
    const prev = from.current.pop();
    if (!clip || !prev) return;
    stop();
    to.current.push(clip);
    markDirty(true);
    setClip(prev);
    setSel({ a: 0, b: 0 });
    setViewRange([0, clipLength(prev)]);
  };

  // draw the waveform
  useEffect(() => {
    const c = canvas.current;
    if (!c || !clip) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(width * dpr);
    c.height = Math.floor(HEIGHT * dpr);
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0a0a0a';
    g.fillRect(0, 0, width, HEIGHT);
    const [v0, v1] = viewRange;
    const span = Math.max(1, v1 - v0);
    const xOf = (s: number) => ((s - v0) / span) * width;
    if (hasSel) {
      g.fillStyle = 'rgba(16,185,129,0.22)';
      g.fillRect(xOf(selA), 0, xOf(selB) - xOf(selA), HEIGHT);
    }
    const lanes = clip.channels.length;
    const laneH = (HEIGHT - 16) / lanes;
    clip.channels.forEach((ch, li) => {
      const mid = 16 + laneH * li + laneH / 2;
      g.strokeStyle = '#262626';
      g.beginPath();
      g.moveTo(0, mid + 0.5);
      g.lineTo(width, mid + 0.5);
      g.stroke();
      g.fillStyle = '#34d399';
      const pk = peaks(ch, v0, v1, width);
      for (let x = 0; x < pk.length; x++) {
        const [lo, hi] = pk[x];
        const y1 = mid - hi * (laneH / 2 - 2);
        const y2 = mid - lo * (laneH / 2 - 2);
        g.fillRect(x, y1, 1, Math.max(1, y2 - y1));
      }
    });
    // time ruler
    g.fillStyle = '#737373';
    g.font = '10px sans-serif';
    const secs = span / clip.sampleRate;
    const stepS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60].find((s) => secs / s <= 12) ?? 120;
    for (let s = Math.ceil(v0 / clip.sampleRate / stepS) * stepS; s * clip.sampleRate <= v1; s += stepS) {
      const x = xOf(s * clip.sampleRate);
      g.fillRect(x, 0, 1, 5);
      g.fillText(`${+s.toFixed(2)}s`, x + 2, 11);
    }
    if (!hasSel) {
      g.fillStyle = '#fbbf24';
      g.fillRect(xOf(sel.a), 0, 1, HEIGHT);
    }
    if (playhead !== undefined) {
      g.fillStyle = '#f5f5f5';
      g.fillRect(xOf(playhead), 0, 1, HEIGHT);
    }
  }, [clip, width, viewRange, sel, playhead, hasSel, selA, selB]);

  const sampleAt = (e: React.PointerEvent) => {
    const rect = canvas.current!.getBoundingClientRect();
    const [v0, v1] = viewRange;
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return Math.round(v0 + x * (v1 - v0));
  };

  const onWheel = (e: React.WheelEvent) => {
    if (!clip) return;
    const rect = canvas.current!.getBoundingClientRect();
    const [v0, v1] = viewRange;
    const n = clipLength(clip);
    const at = v0 + ((e.clientX - rect.left) / rect.width) * (v1 - v0);
    const f = e.deltaY > 0 ? 1.25 : 0.8;
    const span = Math.max(64, Math.min(n, (v1 - v0) * f));
    let a = at - (at - v0) * (span / (v1 - v0));
    a = Math.max(0, Math.min(n - span, a));
    setViewRange([Math.round(a), Math.round(a + span)]);
  };

  const close = () => {
    if (!dirty.current || confirm(t('editor.unsaved'))) {
      stop();
      onDone();
    }
  };

  const save = async () => {
    if (!clip) return;
    if (clipLength(clip) === 0) return alert(t('editor.sound.tooShort'));
    stop();
    setSaving(true);
    try {
      const ogg = await encodeOgg(clip, quality);
      markDirty(false);
      if (onSave) onSave(ogg);
      else setFile(path, ogg);
      onDone();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const importAudio = async () => {
    const file = await pickFile('audio/*,.ogg');
    if (!file) return;
    try {
      const next = await load(new Uint8Array(await file.arrayBuffer()));
      apply(() => next, false);
    } catch (e) {
      alert((e as Error).message);
    }
  };

  // microphone: the take replaces the selection, or goes in at the cursor
  const startRec = async () => {
    if (recording.current || !clip) return;
    stop();
    try {
      recording.current = await startRecording();
    } catch (e) {
      return alert((e as Error).message);
    }
    const start = performance.now();
    setRec({ start, seconds: 0, level: 0 });
    const tick = () => {
      const r = recording.current;
      if (!r) return;
      setRec({ start, seconds: (performance.now() - start) / 1000, level: r.level() });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const stopRec = () =>
    run(async () => {
      const r = recording.current;
      if (!r || !clip) return;
      recording.current = null;
      setRec(undefined);
      // decoded at the clip's rate, so recording and existing sound fit together
      const take = toMono(await decodeAudio(await r.stop(), clip.sampleRate));
      const at = hasSel ? selA : Math.min(sel.a, clipLength(clip));
      apply((c) => splice(c, at, hasSel ? selB : at, take), false);
      setSel({ a: at, b: at + clipLength(take) });
    });
  useEffect(() => () => recording.current?.cancel(), []);

  const keys = useRef<(e: KeyboardEvent) => void>();
  keys.current = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (e.key === ' ') {
      e.preventDefault();
      return togglePlay();
    }
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      return e.shiftKey ? step(redo, undo) : step(undo, redo);
    }
    if ((e.ctrlKey || e.metaKey) && k === 'y') {
      e.preventDefault();
      return step(redo, undo);
    }
    if ((e.ctrlKey || e.metaKey) && k === 's') {
      e.preventDefault();
      return void save();
    }
    if ((e.ctrlKey || e.metaKey) && k === 'a' && clip) {
      e.preventDefault();
      return setSel({ a: 0, b: clipLength(clip) });
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && hasSel) return apply((c) => cut(c, selA, selB), false);
    if (k === 'r' && !e.ctrlKey && !e.metaKey) return recording.current ? void stopRec() : void startRec();
    if (e.key === 'Escape') return close();
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keys.current?.(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const sr = clip?.sampleRate ?? 44100;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <span className="font-semibold">{t('editor.sound.title')}</span>
        <span className="min-w-0 truncate font-mono text-xs text-neutral-400">{path}</span>
        {clip && (
          <span className="text-xs text-neutral-500">
            {t('editor.sound.info', {
              duration: fmt(clipDuration(clip)),
              channels: clip.channels.length > 1 ? t('editor.sound.stereo') : t('editor.sound.mono1'),
              rate: clip.sampleRate,
            })}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Btn onClick={() => step(undo, redo)} disabled={!undo.current.length}>{t('editor.undo')}</Btn>
          <Btn onClick={() => step(redo, undo)} disabled={!redo.current.length}>{t('editor.redo')}</Btn>
          <label className="ml-2 flex items-center gap-1 text-xs text-neutral-400">
            {t('editor.sound.quality')}
            <select value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="rounded bg-neutral-800 px-1 py-0.5 text-xs text-neutral-100">
              {[2, 3, 4, 5, 6, 7, 8, 10].map((q) => (
                <option key={q} value={q}>
                  q{q} (~{[0, 0, 96, 112, 128, 160, 192, 224, 256, 0, 500][q]} kbit/s)
                </option>
              ))}
            </select>
          </label>
          <Btn onClick={close}>{t('editor.cancel')}</Btn>
          <Btn tone="primary" onClick={() => void save()} disabled={!clip || saving}>
            {saving ? t('editor.saving') : t('editor.save')}
          </Btn>
        </div>
      </div>
      {error && <div className="m-3 rounded bg-red-950 p-2 text-xs text-red-200">{t('editor.loadFailed', { error })}</div>}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        <div className="flex flex-wrap items-center gap-1">
          <Btn tone="primary" onClick={() => clip && play(sel.a < clipLength(clip) && !hasSel ? sel.a : 0, clipLength(clip))} disabled={!clip}>
            {t('editor.sound.play')}
          </Btn>
          <Btn onClick={() => play(selA, selB)} disabled={!hasSel}>{t('editor.sound.playSelection')}</Btn>
          <Btn onClick={stop} disabled={!isPlaying}>{t('editor.sound.stop')}</Btn>
          {rec ? (
            <>
              <Btn tone="danger" onClick={() => void stopRec()}>{t('editor.sound.recordStop')}</Btn>
              <span className="flex items-center gap-2 text-xs text-red-300">
                <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
                {t('editor.sound.recording', { time: fmt(rec.seconds) })}
                <span className="h-2 w-24 overflow-hidden rounded bg-neutral-800">
                  <span className={`block h-full ${rec.level > 0.95 ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, rec.level * 100)}%` }} />
                </span>
              </span>
            </>
          ) : (
            <Btn tone="danger" onClick={() => void startRec()} disabled={!clip || busy} title={t('editor.sound.recordHint')}>
              {t('editor.sound.record')}
            </Btn>
          )}
          <span className="mx-2 h-4 w-px bg-neutral-700" />
          <Btn onClick={() => clip && setSel({ a: 0, b: clipLength(clip) })} disabled={!clip}>{t('editor.sound.all')}</Btn>
          <Btn onClick={() => setViewRange([selA, selB])} disabled={!hasSel || selB - selA < 64}>{t('editor.sound.zoomSel')}</Btn>
          <Btn onClick={() => clip && setViewRange([0, clipLength(clip)])} disabled={!clip}>{t('editor.sound.zoomAll')}</Btn>
          <span className="ml-auto text-xs text-neutral-400">
            {hasSel
              ? t('editor.sound.selection', { from: fmt(selA / sr), to: fmt(selB / sr), length: fmt((selB - selA) / sr) })
              : t('editor.sound.cursor', { at: fmt(sel.a / sr) })}
          </span>
        </div>

        <div ref={box} className="w-full">
          <canvas
            ref={canvas}
            className="block w-full cursor-text touch-none rounded ring-1 ring-neutral-800"
            style={{ height: HEIGHT }}
            onPointerDown={(e) => {
              if (!clip) return;
              const s = sampleAt(e);
              drag.current = s;
              setSel({ a: s, b: s });
              (e.target as Element).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (drag.current === null) return;
              setSel({ a: drag.current, b: sampleAt(e) });
            }}
            onPointerUp={() => (drag.current = null)}
            onWheel={onWheel}
          />
        </div>
        {clip && clipLength(clip) === 0 && !rec && (
          <div className="flex flex-wrap items-center gap-2 rounded bg-neutral-900 p-3 text-xs text-neutral-300 ring-1 ring-neutral-800">
            {t('editor.sound.empty')}
            <Btn tone="danger" onClick={() => void startRec()}>{t('editor.sound.record')}</Btn>
            <Btn onClick={() => void importAudio()}>{t('editor.sound.import')}</Btn>
          </div>
        )}
        <p className="text-[11px] text-neutral-500">{t('editor.sound.selectHint')}</p>

        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-neutral-400">{t('editor.sound.editGroup')}</span>
          <Btn onClick={() => apply((c) => crop(c, selA, selB), false)} disabled={!hasSel}>{t('editor.sound.crop')}</Btn>
          <Btn tone="danger" onClick={() => apply((c) => cut(c, selA, selB), false)} disabled={!hasSel}>{t('editor.sound.delete')}</Btn>
          <Btn onClick={() => apply((c) => silence(c, selA, selB))} disabled={!hasSel}>{t('editor.sound.silence')}</Btn>
          <Btn onClick={() => apply((c) => insertSilence(c, sel.a, 0.5), false)} disabled={!clip || hasSel}>{t('editor.sound.insertSilence')}</Btn>
          <Btn onClick={() => apply((c) => trimSilence(c), false)} disabled={!clip}>{t('editor.sound.trimSilence')}</Btn>
          <Btn onClick={() => apply((c) => fadeIn(c, ...r()))} disabled={!clip}>{t('editor.sound.fadeIn')}</Btn>
          <Btn onClick={() => apply((c) => fadeOut(c, ...r()))} disabled={!clip}>{t('editor.sound.fadeOut')}</Btn>
          <Btn onClick={() => apply((c) => reverse(c, ...r()))} disabled={!clip}>{t('editor.sound.reverse')}</Btn>
          {clip && clip.channels.length > 1 && <Btn onClick={() => apply(toMono)}>{t('editor.sound.mono')}</Btn>}
          <span className="ml-auto text-[11px] text-neutral-500">
            {busy ? t('editor.sound.working') : t('editor.sound.appliesTo', { what: hasSel ? t('editor.sound.toSelection') : t('editor.sound.toAll') })}
          </span>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(250px,1fr))] gap-2">
          <FxCard title={t('editor.sound.volumeGroup')}>
            <Fx
              label={t('editor.sound.gain')} value={fx.gain} min={-24} max={24} step={0.5} unit="dB" onChange={set('gain')}
              disabled={!clip || busy}
              onApply={() => applyFx((c) => gain(c, dbToGain(fx.gain)))}
              onPreview={() => previewFx((c) => gain(c, dbToGain(fx.gain)))}
            />
            <Fx
              label={t('editor.sound.compressor')} value={fx.comp} min={0} max={1} step={0.05} unit="" onChange={set('comp')} hint={t('editor.sound.compressorHint')}
              disabled={!clip || busy}
              onApply={() => applyFx((c) => compress(c, fx.comp))}
              onPreview={() => previewFx((c) => compress(c, fx.comp))}
            />
            <div className="flex justify-end">
              <Btn onClick={() => applyFx((c) => normalize(c))} disabled={!clip || busy}>{t('editor.sound.normalize')}</Btn>
            </div>
          </FxCard>

          <FxCard title={t('editor.sound.pitchGroup')}>
            <Fx
              label={t('editor.sound.pitch')} value={fx.pitch} min={-12} max={12} step={0.5} unit={t('editor.sound.semitones')} onChange={set('pitch')} hint={t('editor.sound.pitchHint')}
              disabled={!clip || busy || fx.pitch === 0}
              onApply={() => applyFx((c) => pitchShift(c, fx.pitch))}
              onPreview={() => previewFx((c) => pitchShift(c, fx.pitch))}
            />
            <Fx
              label={t('editor.sound.tempo')} value={fx.tempo} min={25} max={300} step={5} unit="%" onChange={set('tempo')} hint={t('editor.sound.tempoHint')}
              disabled={!clip || busy || fx.tempo === 100}
              onApply={() => applyFx((c) => timeStretch(c, 100 / fx.tempo), false)}
              onPreview={() => previewFx((c) => timeStretch(c, 100 / fx.tempo), false)}
            />
            <Fx
              label={t('editor.sound.speed')} value={fx.speed} min={0.25} max={4} step={0.05} unit="×" onChange={set('speed')} hint={t('editor.sound.speedHint')}
              disabled={!clip || busy || fx.speed === 1}
              onApply={() => applyFx((c) => changeSpeed(c, fx.speed), false)}
              onPreview={() => previewFx((c) => changeSpeed(c, fx.speed), false)}
            />
          </FxCard>

          <FxCard title={t('editor.sound.filterGroup')}>
            <Fx
              label={t('editor.sound.bass')} value={fx.bass} min={-18} max={18} step={1} unit="dB" onChange={set('bass')}
              disabled={!clip || busy}
              onApply={() => applyFx((c) => filter(c, 'bass', fx.bass))}
              onPreview={() => previewFx((c) => filter(c, 'bass', fx.bass))}
            />
            <Fx
              label={t('editor.sound.treble')} value={fx.treble} min={-18} max={18} step={1} unit="dB" onChange={set('treble')}
              disabled={!clip || busy}
              onApply={() => applyFx((c) => filter(c, 'treble', fx.treble))}
              onPreview={() => previewFx((c) => filter(c, 'treble', fx.treble))}
            />
            <Fx
              label={t('editor.sound.lowpass')} value={fx.lowpass} min={100} max={12000} step={50} unit="Hz" onChange={set('lowpass')} hint={t('editor.sound.lowpassHint')}
              disabled={!clip || busy}
              onApply={() => applyFx((c) => filter(c, 'lowpass', fx.lowpass))}
              onPreview={() => previewFx((c) => filter(c, 'lowpass', fx.lowpass))}
            />
            <Fx
              label={t('editor.sound.highpass')} value={fx.highpass} min={20} max={5000} step={10} unit="Hz" onChange={set('highpass')} hint={t('editor.sound.highpassHint')}
              disabled={!clip || busy}
              onApply={() => applyFx((c) => filter(c, 'highpass', fx.highpass))}
              onPreview={() => previewFx((c) => filter(c, 'highpass', fx.highpass))}
            />
          </FxCard>

          <FxCard title={t('editor.sound.fxGroup')}>
            <Fx
              label={t('editor.sound.reverb')} value={fx.roomSize} min={0} max={1} step={0.05} unit={t('editor.sound.roomSize')} onChange={set('roomSize')}
              extra={<Slider label={t('editor.sound.mix')} value={fx.roomMix} min={0} max={1} step={0.05} unit="" onChange={set('roomMix')} />}
              disabled={!clip || busy}
              onApply={() => applyFx((c) => reverb(c, fx.roomSize, fx.roomMix, hasSel), hasSel)}
              onPreview={() => previewFx((c) => reverb(c, fx.roomSize, fx.roomMix, hasSel), hasSel)}
            />
            <Fx
              label={t('editor.sound.echo')} value={fx.delay} min={30} max={1000} step={10} unit="ms" onChange={set('delay')}
              extra={
                <>
                  <Slider label={t('editor.sound.decay')} value={fx.decay} min={0.05} max={0.9} step={0.05} unit="" onChange={set('decay')} />
                  <Slider label={t('editor.sound.repeats')} value={fx.repeats} min={1} max={8} step={1} unit="" onChange={set('repeats')} />
                </>
              }
              disabled={!clip || busy}
              onApply={() => applyFx((c) => echo(c, fx.delay / 1000, fx.decay, fx.repeats), hasSel)}
              onPreview={() => previewFx((c) => echo(c, fx.delay / 1000, fx.decay, fx.repeats), hasSel)}
            />
            <Fx
              label={t('editor.sound.distortion')} value={fx.drive} min={1} max={30} step={1} unit="" onChange={set('drive')}
              disabled={!clip || busy}
              onApply={() => applyFx((c) => distort(c, fx.drive))}
              onPreview={() => previewFx((c) => distort(c, fx.drive))}
            />
          </FxCard>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-3 text-xs">
          <Btn onClick={() => void importAudio()}>{t('editor.sound.import')}</Btn>
          <span className="text-[11px] text-neutral-500">{t('editor.sound.importHint')}</span>
        </div>
        {clip && clip.channels.length > 1 && <div className="text-[11px] text-amber-400">{t('editor.sound.stereoHint')}</div>}
        <p className="text-[11px] text-neutral-500">{t('editor.sound.saveHint')}</p>
      </div>
    </div>
  );
}

function FxCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded bg-neutral-900 p-2 ring-1 ring-neutral-800">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{title}</h4>
      {children}
    </section>
  );
}

function Slider({ label, value, min, max, step, unit, onChange, hint }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <label className="flex items-center gap-2 text-xs" title={hint}>
      <span className="w-24 shrink-0 truncate">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1" />
      <span className="w-16 shrink-0 text-right text-[11px] text-neutral-400">
        {value > 0 && min < 0 ? '+' : ''}
        {value} {unit}
      </span>
    </label>
  );
}

/** One effect: its main parameter, optional extra ones, and buttons to preview or apply it. */
function Fx({ onApply, onPreview, disabled, extra, ...slider }: React.ComponentProps<typeof Slider> & {
  onApply: () => void;
  onPreview: () => void;
  disabled: boolean;
  extra?: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-1 border-t border-neutral-800 pt-1.5 first-of-type:border-0 first-of-type:pt-0">
      <Slider {...slider} />
      {extra}
      <div className="flex justify-end gap-1">
        <Btn onClick={onPreview} disabled={disabled}>{t('editor.sound.preview')}</Btn>
        <Btn onClick={onApply} disabled={disabled}>{t('editor.sound.apply')}</Btn>
      </div>
    </div>
  );
}
