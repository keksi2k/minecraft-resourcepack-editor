import { lazy, Suspense, useCallback, useState } from 'react';
import { useApp } from '../state/appStore';
import { CommandPalette, useGlobalShortcuts } from './CommandPalette';
import { Header } from './Header';
import { ItemsView } from './ItemsView';
import { MobsView } from './MobsView';
import { PlantsView } from './PlantsView';
import { SoundsView } from './SoundsView';
import { TexturesView } from './TexturesView';

// these tabs load when they're opened (the others are part of the item details anyway)
const named = <K extends string>(load: () => Promise<Record<K, React.ComponentType>>, name: K) => lazy(() => load().then((m) => ({ default: m[name] })));
const ScenesView = named(() => import('./scenes/ScenesView'), 'ScenesView');
const TextsView = named(() => import('./TextsView'), 'TextsView');
const ProgressView = named(() => import('./ProgressView'), 'ProgressView');
const FunnyView = named(() => import('./FunnyView'), 'FunnyView');

/** The editor once a pack is open: header, tabs and the command palette. */
export function Workspace() {
  const tab = useApp((s) => s.tab);
  const [palette, setPalette] = useState(false);
  useGlobalShortcuts(useCallback(() => setPalette(true), []));
  return (
    <>
      <Header onSearch={() => setPalette(true)} />
      {palette && <CommandPalette onClose={() => setPalette(false)} />}
      <main className="min-h-0 flex-1">
        <Suspense fallback={<div className="p-4 text-sm text-neutral-500">…</div>}>
          {tab === 'items' && <ItemsView />}
          {tab === 'plants' && <PlantsView />}
          {tab === 'mobs' && <MobsView />}
          {tab === 'textures' && <TexturesView />}
          {tab === 'sounds' && <SoundsView />}
          {tab === 'scenes' && <ScenesView />}
          {tab === 'texts' && <TextsView />}
          {tab === 'progress' && <ProgressView />}
          {tab === 'funny' && <FunnyView />}
        </Suspense>
      </main>
    </>
  );
}
