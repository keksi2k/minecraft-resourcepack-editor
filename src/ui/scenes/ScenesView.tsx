import { useState } from 'react';
import { useT } from '../../i18n';
import { useApp } from '../../state/appStore';
import { useEditing } from '../../state/editorStore';
import { EditorPanel } from '../EditorPanel';
import { TitleScreen } from './TitleScreen';
import { HudScreen } from './HudScreen';
import { BiomesScreen } from './BiomesScreen';
import { FontsScreen } from './FontsScreen';
import { ParticlesScreen } from './ParticlesScreen';
import { PaintingsScreen } from './PaintingsScreen';

export const SCENES = ['title', 'hud', 'biomes', 'fonts', 'particles', 'paintings'] as const;
export type Scene = (typeof SCENES)[number];

/** Previews of what the pack changes outside items and mobs: menus, HUD, biomes, fonts … */
export function ScenesView() {
  const t = useT();
  const store = useApp((s) => s.store);
  const [scene, setScene] = useState<Scene>('title');
  if (!store) return null;
  return (
    <div className="flex h-full">
      <nav className="w-44 shrink-0 overflow-y-auto border-r border-neutral-800 p-2 text-sm">
        {SCENES.map((s) => (
          <button key={s} onClick={() => setScene(s)} className={`block w-full rounded px-2 py-1 text-left ${scene === s ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}>
            {t(`scenes.nav.${s}`)}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        {scene === 'title' && <TitleScreen store={store} />}
        {scene === 'hud' && <HudScreen store={store} />}
        {scene === 'biomes' && <BiomesScreen store={store} />}
        {scene === 'fonts' && <FontsScreen store={store} />}
        {scene === 'particles' && <ParticlesScreen store={store} />}
        {scene === 'paintings' && <PaintingsScreen store={store} />}
      </div>
    </div>
  );
}

/** A scene's preview with its files beside it; an open editor takes the preview's place. */
export function SceneLayout({ main, aside, asideWidth = 'w-[400px]' }: { main: React.ReactNode; aside: React.ReactNode; asideWidth?: string }) {
  const editing = useEditing('scenes');
  return (
    <div className="flex h-full">
      {editing && <EditorPanel />}
      <div className={`relative min-w-0 flex-1 ${editing ? 'hidden' : ''}`}>{main}</div>
      <aside className={`${asideWidth} shrink-0 overflow-y-auto border-l border-neutral-800 bg-neutral-950 text-sm`}>{aside}</aside>
    </div>
  );
}
