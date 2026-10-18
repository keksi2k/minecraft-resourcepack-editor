import { useState } from 'react';
import { COLOR_STYLES, type ColorStyle } from '../funny/colorize';
import { defaultFunny, randomSeed, type FunnySettings } from '../funny/funny';
import { SOUND_MODES, TEXTURE_SCOPES, type SoundMode, type TextureScope } from '../funny/shuffle';
import { useT } from '../i18n';
import { useApp } from '../state/appStore';
import { Btn } from './common';

function Card({ title, enabled, onToggle, children }: { title: string; enabled: boolean; onToggle: (on: boolean) => void; children: React.ReactNode }) {
  return (
    <section className={`rounded-lg border p-4 ${enabled ? 'border-fuchsia-700 bg-neutral-900' : 'border-neutral-800 bg-neutral-950'}`}>
      <label className="mb-3 flex items-center gap-2 text-base font-semibold">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        {title}
      </label>
      <div className={`flex flex-col gap-3 text-sm ${enabled ? '' : 'pointer-events-none opacity-40'}`}>{children}</div>
    </section>
  );
}

function Scopes({ value, onChange }: { value: TextureScope[]; onChange: (v: TextureScope[]) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {TEXTURE_SCOPES.map((s) => (
        <label key={s} className="flex items-center gap-1.5">
          <input
            type="checkbox"
            checked={value.includes(s)}
            onChange={(e) => onChange(e.target.checked ? [...value, s] : value.filter((x) => x !== s))}
          />
          {t(`funny.scope.${s}`)}
        </label>
      ))}
    </div>
  );
}

export function FunnyView() {
  const t = useT();
  const { funny, applyFunny, removeFunny, vanillaSounds, soundsLoading } = useApp();
  const [s, setS] = useState<FunnySettings>(() => funny?.settings ?? defaultFunny());
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const shuffle = (p: Partial<FunnySettings['shuffle']>) => setS({ ...s, shuffle: { ...s.shuffle, ...p } });
  const colors = (p: Partial<FunnySettings['colors']>) => setS({ ...s, colors: { ...s.colors, ...p } });
  const soundsAvailable = !!vanillaSounds;
  const settings: FunnySettings = soundsAvailable ? s : { ...s, shuffle: { ...s.shuffle, sounds: false } };
  const nothing =
    !(settings.shuffle.enabled && (settings.shuffle.scopes.length || settings.shuffle.sounds)) &&
    !(settings.colors.enabled && settings.colors.scopes.length);

  const apply = async (next = settings) => {
    setBusy(t('funny.working'));
    setError(undefined);
    try {
      await applyFunny(next, (done, total) => setBusy(t('funny.coloring', { done, total })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(undefined);
    }
  };
  const reroll = () => {
    const next = { ...settings, seed: randomSeed() };
    setS(next);
    void apply(next);
  };

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <div>
          <h2 className="text-2xl font-bold">
            <span className="bg-gradient-to-r from-fuchsia-400 via-amber-300 to-emerald-400 bg-clip-text text-transparent">{t('funny.title')}</span>
          </h2>
          <p className="mt-1 text-sm text-neutral-400">{t('funny.intro')}</p>
        </div>

        <Card title={t('funny.shuffleTitle')} enabled={s.shuffle.enabled} onToggle={(enabled) => shuffle({ enabled })}>
          <p className="text-neutral-400">{t('funny.shuffleInfo')}</p>
          <Scopes value={s.shuffle.scopes} onChange={(scopes) => shuffle({ scopes })} />
          <label className="flex items-start gap-2">
            <input type="checkbox" className="mt-1" checked={s.shuffle.mobChaos} onChange={(e) => shuffle({ mobChaos: e.target.checked })} />
            <span>
              {t('funny.mobChaos')}
              <span className="block text-xs text-neutral-500">{t('funny.mobChaosInfo')}</span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={settings.shuffle.sounds}
                disabled={!soundsAvailable}
                onChange={(e) => shuffle({ sounds: e.target.checked })}
              />
              {t('funny.sounds')}
            </label>
            <select
              value={s.shuffle.soundMode}
              onChange={(e) => shuffle({ soundMode: e.target.value as SoundMode })}
              disabled={!settings.shuffle.sounds}
              className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs disabled:opacity-40"
            >
              {SOUND_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`funny.soundMode.${m}`)}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-neutral-500">
            {soundsAvailable ? t('funny.soundsInfo') : soundsLoading ? t('funny.soundsLoading') : t('funny.soundsUnavailable')}
          </p>
        </Card>

        <Card title={t('funny.colorsTitle')} enabled={s.colors.enabled} onToggle={(enabled) => colors({ enabled })}>
          <p className="text-neutral-400">{t('funny.colorsInfo')}</p>
          <Scopes value={s.colors.scopes} onChange={(scopes) => colors({ scopes })} />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-neutral-400">{t('funny.style')}</span>
            <select
              value={s.colors.style}
              onChange={(e) => colors({ style: e.target.value as ColorStyle })}
              className="rounded bg-neutral-800 px-1.5 py-0.5 text-xs"
            >
              {COLOR_STYLES.map((c) => (
                <option key={c} value={c}>
                  {t(`funny.styles.${c}`)}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2">
            <span className="text-neutral-400">{t('funny.strength')}</span>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={Math.round(s.colors.strength * 100)}
              onChange={(e) => colors({ strength: Number(e.target.value) / 100 })}
              className="w-48"
            />
            <span className="w-10 text-right font-mono text-xs">{Math.round(s.colors.strength * 100)} %</span>
          </label>
        </Card>

        <section className="flex flex-col gap-3 rounded-lg border border-neutral-800 p-4 text-sm">
          <p className="text-xs text-neutral-500">{t('funny.guiHint')}</p>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={s.includeEdits} onChange={(e) => setS({ ...s, includeEdits: e.target.checked })} />
            {t('funny.includeEdits')}
          </label>
          <label className="flex items-center gap-2">
            <span className="text-neutral-400">{t('funny.seed')}</span>
            <input
              value={s.seed}
              onChange={(e) => setS({ ...s, seed: e.target.value })}
              className="w-32 rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs"
            />
            <span className="text-xs text-neutral-500">{t('funny.seedInfo')}</span>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Btn tone="primary" onClick={() => void apply()} disabled={!!busy || nothing}>
              {funny ? t('funny.reapply') : t('funny.apply')}
            </Btn>
            <Btn onClick={reroll} disabled={!!busy || nothing}>
              {t('funny.reroll')}
            </Btn>
            {funny && (
              <Btn tone="danger" onClick={removeFunny} disabled={!!busy}>
                {t('funny.remove')}
              </Btn>
            )}
            {busy && <span className="text-xs text-amber-300">{busy}</span>}
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          {funny && !busy && (
            <p className="text-xs text-emerald-400">
              {t('funny.applied', { textures: funny.stats.textures, sounds: funny.stats.sounds, colored: funny.stats.colored, seed: funny.settings.seed })}
            </p>
          )}
          <p className="text-xs text-neutral-500">{t('funny.undoInfo')}</p>
        </section>
      </div>
    </div>
  );
}
