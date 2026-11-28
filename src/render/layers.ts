import * as THREE from 'three';
import type { AssetStore } from '../assets/AssetStore';
import type { ResolvedItemModel } from '../models/items';
import type { DisplayContext } from '../models/modelResolver';
import { buildItemObject } from './buildMesh';
import { loadTexture, threeTexture } from './textures';

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
  setBrightness(obj, night ? 0.18 : 1);
}

/** Darkens everything but what glows to `brightness` (0…1). */
export function setBrightness(obj: THREE.Object3D, brightness: number): void {
  obj.traverse((m) => {
    if (m instanceof THREE.Mesh) {
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat.color) mat.color.setScalar(mat.userData.glow ? 1 : brightness);
    }
  });
}

/**
 * How bright a block face is at a light level (0…15), the way the game's light map works it out
 * with no ambient light and the default brightness setting: the light curve, a tiny bit of grey,
 * then halfway to the brighter "gamma" curve.
 */
export function lightBrightness(level: number): number {
  const f = Math.max(0, Math.min(15, level)) / 15;
  let b = f / (4 - 3 * f);
  b = b * 0.96 + 0.75 * 0.04;
  const bright = 1 - (1 - b) ** 4;
  return b + (bright - b) * 0.5;
}

/** The glint texture's UV transform at a time (ms), as the game's glint texturing sets it up. */
export function glintMatrix(ms: number, scale: number): THREE.Matrix3 {
  const i = Math.floor(ms * 8);
  const f = (i % 110000) / 110000;
  const f1 = (i % 30000) / 30000;
  // translate, then rotate 10°, then scale (applied to the item's own UVs, right to left)
  return new THREE.Matrix3().makeTranslation(-f, f1).multiply(new THREE.Matrix3().makeRotation((-10 * Math.PI) / 180)).multiply(new THREE.Matrix3().makeScale(scale, scale));
}

const GLINT_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// only where the item itself is visible, like the game's depth test on the item's own faces
const GLINT_FRAGMENT = `
uniform sampler2D glint;
uniform sampler2D base;
uniform bool hasBase;
uniform mat3 uvMatrix;
varying vec2 vUv;
void main() {
  if (hasBase && texture2D(base, vUv).a < 0.1) discard;
  gl_FragColor = vec4(texture2D(glint, (uvMatrix * vec3(vUv, 1.0)).xy).rgb, 1.0);
}`;

/**
 * The enchantment glint over every face of `base`: the glint texture added on top (the game blends
 * it as colour × colour + what's below), sliding and turned by 10°. Returns the function that moves
 * it on; call it every frame with the time in milliseconds.
 */
export async function addGlint(store: AssetStore, base: THREE.Object3D, texture = 'minecraft:misc/enchanted_glint_item', scale = 0.5): Promise<(ms: number) => void> {
  const tex = threeTexture(await loadTexture(store, texture)).clone();
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  // the shader writes the colours as they are, so read them as they are
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  const uvMatrix = { value: new THREE.Matrix3() };
  const meshes: THREE.Mesh[] = [];
  base.traverse((m) => {
    if (m instanceof THREE.Mesh) meshes.push(m);
  });
  for (const m of meshes) {
    const own = m.material as THREE.MeshBasicMaterial;
    const material = new THREE.ShaderMaterial({
      uniforms: { glint: { value: tex }, base: { value: own.map ?? null }, hasBase: { value: !!own.map }, uvMatrix },
      vertexShader: GLINT_VERTEX,
      fragmentShader: GLINT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: own.side,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcColorFactor,
      blendDst: THREE.OneFactor,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
    });
    material.userData.glow = true;
    const glint = new THREE.Mesh(m.geometry, material);
    glint.renderOrder = m.renderOrder + 1;
    m.add(glint);
  }
  const move = (ms: number) => uvMatrix.value.copy(glintMatrix(ms, scale));
  move(0);
  return move;
}
