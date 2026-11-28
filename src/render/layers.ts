import * as THREE from 'three';
import type { AssetStore } from '../assets/AssetStore';
import type { ResolvedItemModel } from '../models/items';
import type { DisplayContext } from '../models/modelResolver';
import { buildItemObject } from './buildMesh';

/**
 * Extra layers drawn on top of a built object, for OptiFine's overlays (connected-texture fringes)
 * and emissive textures. Glowing layers keep their full brightness at night.
 */
export async function addLayer(store: AssetStore, base: THREE.Object3D, models: ResolvedItemModel[], context: DisplayContext, glow: boolean): Promise<void> {
  const layer = await buildItemObject(store, models, context);
  layer.traverse((m) => {
    if (m instanceof THREE.Mesh) {
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.userData.glow = glow;
      // in front of the faces they cover, without moving them
      mat.polygonOffset = true;
      mat.polygonOffsetFactor = glow ? -2 : -1;
      mat.polygonOffsetUnits = glow ? -8 : -4;
    }
  });
  base.add(layer);
}

/** Night: everything dark except what glows. */
export function setNight(obj: THREE.Object3D, night: boolean): void {
  obj.traverse((m) => {
    if (m instanceof THREE.Mesh) {
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.setScalar(night && !mat.userData.glow ? 0.18 : 1);
    }
  });
}
