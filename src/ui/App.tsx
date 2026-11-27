import { useEffect } from 'react';
import { useApp } from '../state/appStore';
import { Header } from './Header';
import { FunnyView } from './FunnyView';
import { ItemsView } from './ItemsView';
import { LoadScreen } from './LoadScreen';
import { MobsView } from './MobsView';
import { PlantsView } from './PlantsView';
import { SoundsView } from './SoundsView';
import { TexturesView } from './TexturesView';
import { TextsView } from './TextsView';
import { ProgressView } from './ProgressView';
import { UpdateBanner } from './UpdateBanner';
import { ScenesView } from './scenes/ScenesView';

export function App() {
  const { phase, tab, loadManifest } = useApp();
  useEffect(() => {
    void loadManifest();
  }, [loadManifest]);

  if (phase !== 'ready')
    return (
      <>
        <UpdateBanner />
        <LoadScreen />
      </>
    );
  return (
    <div className="flex h-screen flex-col">
      <UpdateBanner />
      <Header />
      <main className="min-h-0 flex-1">
        {tab === 'items' && <ItemsView />}
        {tab === 'plants' && <PlantsView />}
        {tab === 'mobs' && <MobsView />}
        {tab === 'textures' && <TexturesView />}
        {tab === 'sounds' && <SoundsView />}
        {tab === 'scenes' && <ScenesView />}
        {tab === 'texts' && <TextsView />}
        {tab === 'progress' && <ProgressView />}
        {tab === 'funny' && <FunnyView />}
      </main>
    </div>
  );
}
