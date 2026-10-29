import { Bounds, OrbitControls } from '@react-three/drei';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { AssetStore } from '../assets/AssetStore';
import type { SpecialOptions } from '../entities/specials';
import type { ItemState } from '../models/itemDefinition';
import type { ItemEntry } from '../models/items';
import { resolveItemModels } from '../models/items';
import type { DisplayContext } from '../models/modelResolver';
import { buildItemObject, disposeObject } from '../render/buildMesh';

/** Display contexts offered in the viewer; labels are translated as `items.contexts.<context>`. */
export const CONTEXTS: DisplayContext[] = ['gui', 'none', 'ground', 'fixed', 'head', 'thirdperson_righthand', 'firstperson_righthand'];

/** Pointer travel (px) up to which a press counts as a click rather than orbiting. */
const CLICK_SLOP = 4;

/**
 * Orbitable three.js view of an object built asynchronously. `buildKey` must change whenever
 * `build` would produce something different. With `fit`, the camera frames the object.
 * `onPick` gets everything under a click (nearest first), not called when the view was dragged;
 * `marker` shows a point (world space), e.g. the picked one.
 */
export function ObjectViewer({ build, buildKey, fit, onPick, marker }: {
  build: () => Promise<THREE.Object3D>;
  buildKey: string;
  fit?: boolean;
  onPick?: (hits: THREE.Intersection[]) => void;
  marker?: [number, number, number];
}) {
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

  // the marker scales with the object, since the camera frames it
  const markerSize = useMemo(() => (obj ? new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3()).length() / 120 : 0), [obj]);

  const click = onPick
    ? (e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation(); // one call per click, not one per mesh hit
        if (e.delta > CLICK_SLOP) return;
        // e.intersections holds only the nearest hit per mesh; a transparent shell (a villager's hat)
        // would hide the surface below it in the same mesh, so cast the click's ray again for every hit
        onPick(new THREE.Raycaster(e.ray.origin, e.ray.direction).intersectObject(e.eventObject, true));
      }
    : undefined;

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
            <primitive object={obj} onClick={click} />
          </Bounds>
        ) : (
          <primitive object={obj} onClick={click} />
        ))}
      {marker && (
        <mesh position={marker} renderOrder={1000}>
          <sphereGeometry args={[markerSize, 12, 8]} />
          <meshBasicMaterial color="#fff" depthTest={false} transparent />
        </mesh>
      )}
      <gridHelper args={[fit ? 4 : 2, fit ? 64 : 32, '#555', '#3a3a3a']} position={[0, fit ? 0 : -0.5, 0]} />
      <OrbitControls makeDefault enableDamping />
    </Canvas>
  );
}

export function ItemViewer({ store, item, context, options, state = {} }: {
  store: AssetStore;
  item: ItemEntry;
  context: DisplayContext;
  options?: SpecialOptions;
  state?: ItemState;
}) {
  return (
    <ObjectViewer
      buildKey={`${item.id}|${item.depsKey}|${context}|${JSON.stringify(options ?? {})}|${JSON.stringify(state)}`}
      // GUI-context resolution may differ from in-hand (e.g. trident), so resolve per context.
      build={() => buildItemObject(store, resolveItemModels(store, item.id, context === 'none' ? 'gui' : context, state), context, options)}
    />
  );
}
