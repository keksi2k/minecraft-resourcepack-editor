import { useEffect } from 'react';
import { useApp } from '../state/appStore';
import { Header } from './Header';
import { ItemsView } from './ItemsView';
import { LoadScreen } from './LoadScreen';
import { MobsView } from './MobsView';
import { SoundsView } from './SoundsView';
import { TexturesView } from './TexturesView';

export function App() {
  const { phase, tab, loadManifest } = useApp();
  useEffect(() => {
    void loadManifest();
  }, [loadManifest]);

  if (phase !== 'ready') return <LoadScreen />;
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <main className="min-h-0 flex-1">
        {tab === 'items' && <ItemsView />}
        {tab === 'mobs' && <MobsView />}
        {tab === 'textures' && <TexturesView />}
        {tab === 'sounds' && <SoundsView />}
      </main>
    </div>
  );
}
