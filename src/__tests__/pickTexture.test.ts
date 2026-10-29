import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pickTexture } from '../render/entityMesh';
import type { TexInfo } from '../render/textures';

/** A 4×4 texture whose left half is opaque and right half transparent. */
function halfTexture(): TexInfo {
  const pixels = new Uint8ClampedArray(4 * 4 * 4);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 2; x++) pixels[(y * 4 + x) * 4 + 3] = 255;
  return { pixels, width: 4, height: 4 } as TexInfo;
}

const mesh = (layer: number, parts: string[]) => {
  const m = new THREE.Mesh();
  m.userData.picking = { layer, tex: halfTexture(), parts };
  return m;
};

/** A hit at texture position (u, v from the top left) on quad `quad`. */
const hit = (object: THREE.Object3D, u: number, v: number, distance: number, quad = 0) =>
  ({ object, distance, point: new THREE.Vector3(0, 0, distance), uv: new THREE.Vector2(u, 1 - v), faceIndex: quad * 2 + 1 }) as unknown as THREE.Intersection;

describe('texture picking', () => {
  const base = mesh(0, ['head', 'body']);
  const overlay = mesh(1, ['head', 'body']);

  it('finds the pixel and model part under a click', () => {
    expect(pickTexture([hit(base, 0.3, 0.6, 2, 1)])).toEqual({ layer: 0, part: 'body', u: 0.3, v: 0.6, x: 1, y: 2, width: 4, height: 4, point: [0, 0, 2] });
  });

  it('looks through transparent pixels of an overlay', () => {
    expect(pickTexture([hit(overlay, 0.8, 0.1, 1.9), hit(base, 0.1, 0.1, 2)])?.layer).toBe(0);
    expect(pickTexture([hit(overlay, 0.1, 0.1, 1.9), hit(base, 0.1, 0.1, 2)])?.layer).toBe(1);
  });

  it('looks through a transparent shell around a part of the same mesh (villager hat)', () => {
    expect(pickTexture([hit(base, 0.8, 0.1, 1.9, 1), hit(base, 0.1, 0.1, 2, 0)])?.part).toBe('head');
  });

  it('prefers the upper layer on the same surface', () => {
    expect(pickTexture([hit(base, 0.1, 0.1, 2), hit(overlay, 0.1, 0.1, 2)])?.layer).toBe(1);
  });

  it('ignores clicks on nothing pickable', () => {
    expect(pickTexture([hit(new THREE.Mesh(), 0.1, 0.1, 1)])).toBeUndefined();
    expect(pickTexture([hit(base, 0.9, 0.9, 1)])).toBeUndefined();
  });
});
