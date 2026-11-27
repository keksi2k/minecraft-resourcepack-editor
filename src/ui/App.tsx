import { lazy, Suspense, useEffect } from 'react';
import { useApp } from '../state/appStore';
import { LoadScreen } from './LoadScreen';
import { UpdateBanner } from './UpdateBanner';

// The editor (3D, models, editors) is the big part; it loads while the start screen is shown.
const loadWorkspace = () => import('./Workspace');
const Workspace = lazy(() => loadWorkspace().then((m) => ({ default: m.Workspace })));

export function App() {
  const { phase, loadManifest } = useApp();
  useEffect(() => {
    void loadManifest();
    void loadWorkspace();
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
      <Suspense fallback={<div className="p-4 text-sm text-neutral-500">…</div>}>
        <Workspace />
      </Suspense>
    </div>
  );
}
