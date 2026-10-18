import { Bounds, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import * as THREE from 'three';
import type { AssetStore } from '../assets/AssetStore';
import type { ItemEntry } from '../models/items';
import { resolveItemModels } from '../models/items';
import type { DisplayContext } from '../models/modelResolver';
import { buildItemObject, disposeObject } from '../render/buildMesh';

/** Display contexts offered in the viewer; labels are translated as `items.contexts.<context>`. */
export const CONTEXTS: DisplayContext[] = ['gui', 'none', 'ground', 'fixed', 'head', 'thirdperson_righthand', 'firstperson_righthand'];

/**
 * Orbitable three.js view of an object built asynchronously. `buildKey` must change whenever
 * `build` would produce something different. With `fit`, the camera frames the object.
 */
export function ObjectViewer({ build, buildKey, fit }: { build: () => Promise<THREE.Object3D>; buildKey: string; fit?: boolean }) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);

  useEffect(() => {
    let cancelled = false;
    let built: THREE.Object3D | null = null;
    void build().then((o) => {
      if (cancelled) return disposeObject(o);
      built = o;
      setObj(o);
    });
    return () => {
      cancelled = true;
      if (built) disposeObject(built);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildKey]);

  return (
    <Canvas
      className="checker rounded"
      camera={{ position: [1.1, 0.8, 1.5], fov: 40, near: 0.01, far: 100 }}
      gl={{ antialias: true, preserveDrawingBuffer: true }}
      onCreated={({ gl }) => (gl.outputColorSpace = THREE.SRGBColorSpace)}
    >
      {obj &&
        (fit ? (
          <Bounds fit clip margin={1.25} key={buildKey.split('|')[0]}>
            <primitive object={obj} />
          </Bounds>
        ) : (
          <primitive object={obj} />
        ))}
      <gridHelper args={[fit ? 4 : 2, fit ? 64 : 32, '#555', '#3a3a3a']} position={[0, fit ? 0 : -0.5, 0]} />
      <OrbitControls makeDefault enableDamping />
    </Canvas>
  );
}

export function ItemViewer({ store, item, context }: { store: AssetStore; item: ItemEntry; context: DisplayContext }) {
  return (
    <ObjectViewer
      buildKey={`${item.id}|${item.depsKey}|${context}`}
      // GUI-context resolution may differ from in-hand (e.g. trident), so resolve per context.
      build={() => buildItemObject(store, resolveItemModels(store, item.id, context === 'none' ? 'gui' : context), context)}
    />
  );
}
