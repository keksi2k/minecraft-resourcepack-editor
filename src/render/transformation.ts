import * as THREE from 'three';
import type { TransformationJson } from '../models/itemDefinition';

function rotation(r: unknown): THREE.Quaternion {
  if (Array.isArray(r) && r.length === 4) return new THREE.Quaternion(r[0], r[1], r[2], r[3]).normalize();
  if (r && typeof r === 'object' && 'axis' in r && 'angle' in r) {
    const { axis, angle } = r as { axis: number[]; angle: number };
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(axis[0], axis[1], axis[2]).normalize(), angle);
  }
  return new THREE.Quaternion();
}

/** Matrix of one Minecraft `transformation`: translation · left_rotation · scale · right_rotation. */
export function transformationMatrix(t: TransformationJson): THREE.Matrix4 {
  if (Array.isArray(t)) {
    // 16 numbers, row-major like Matrix4.set
    return t.length === 16 ? new THREE.Matrix4().set(...(t as Parameters<THREE.Matrix4['set']>)) : new THREE.Matrix4();
  }
  const [tx, ty, tz] = t.translation ?? [0, 0, 0];
  const [sx, sy, sz] = t.scale ?? [1, 1, 1];
  return new THREE.Matrix4()
    .makeTranslation(tx, ty, tz)
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation(t.left_rotation)))
    .multiply(new THREE.Matrix4().makeScale(sx, sy, sz))
    .multiply(new THREE.Matrix4().makeRotationFromQuaternion(rotation(t.right_rotation)));
}

/** Combined matrix of a chain of transformations, outermost first. */
export function chainMatrix(chain: TransformationJson[] | undefined): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  for (const t of chain ?? []) m.multiply(transformationMatrix(t));
  return m;
}
