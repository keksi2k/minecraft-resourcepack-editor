import * as THREE from 'three';
import type { AssetStore } from '../assets/AssetStore';
import { specialLayers, type SpecialLayer, type SpecialOptions } from '../entities/specials';
import type { ResolvedItemModel } from '../models/items';
import {
  resolveFaceTexture,
  type DisplayContext,
  type DisplayTransform,
  type FaceDir,
  type ModelElement,
  type ResolvedModel,
  type Vec3,
} from '../models/modelResolver';
import { buildLayerMesh } from './entityMesh';
import { loadTexture, threeTexture, type TexInfo } from './textures';
import { chainMatrix } from './transformation';

/** Minecraft's fixed per-face shading (no dynamic lights needed for the classic look). */
const SHADE: Record<FaceDir, number> = { up: 1, down: 0.5, north: 0.8, south: 0.8, east: 0.6, west: 0.6 };

/** Corners in order top-left, top-right, bottom-right, bottom-left, as seen from outside the face. */
function faceCorners(dir: FaceDir, [x0, y0, z0]: Vec3, [x1, y1, z1]: Vec3): Vec3[] {
  switch (dir) {
    case 'north':
      return [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]];
    case 'south':
      return [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]];
    case 'east':
      return [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]];
    case 'west':
      return [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]];
    case 'up':
      return [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
    case 'down':
      return [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]];
  }
}

/** UVs Minecraft derives from the element bounds when a face omits `uv`. */
export function defaultUV(dir: FaceDir, [x0, y0, z0]: Vec3, [x1, y1, z1]: Vec3): [number, number, number, number] {
  switch (dir) {
    case 'north':
      return [16 - x1, 16 - y1, 16 - x0, 16 - y0];
    case 'south':
      return [x0, 16 - y1, x1, 16 - y0];
    case 'east':
      return [16 - z1, 16 - y1, 16 - z0, 16 - y0];
    case 'west':
      return [z0, 16 - y1, z1, 16 - y0];
    case 'up':
      return [x0, z0, x1, z1];
    case 'down':
      return [x0, 16 - z1, x1, 16 - z0];
  }
}

function elementTransform(el: ModelElement): (v: Vec3) => Vec3 {
  const r = el.rotation;
  if (!r) return (v) => v;
  const origin = new THREE.Vector3(...r.origin);
  const q = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);
  const deg = THREE.MathUtils.degToRad;
  if (r.axis && r.angle) {
    const axis = new THREE.Vector3(r.axis === 'x' ? 1 : 0, r.axis === 'y' ? 1 : 0, r.axis === 'z' ? 1 : 0);
    q.setFromAxisAngle(axis, deg(r.angle));
    if (r.rescale) {
      const s = 1 / Math.cos(deg(Math.abs(r.angle)));
      scale.set(r.axis === 'x' ? 1 : s, r.axis === 'y' ? 1 : s, r.axis === 'z' ? 1 : s);
    }
  } else {
    q.setFromEuler(new THREE.Euler(deg(r.x ?? 0), deg(r.y ?? 0), deg(r.z ?? 0), 'XYZ'));
  }
  return (v) => {
    const p = new THREE.Vector3(...v).sub(origin).applyQuaternion(q).multiply(scale).add(origin);
    return [p.x, p.y, p.z];
  };
}

/** Vertex colour for shade × tint, converted to linear space so it matches the game's sRGB multiply. */
export function vertexColor(shade: number, tint: number): THREE.Color {
  const c = new THREE.Color();
  c.setRGB(
    (((tint >> 16) & 255) / 255) * shade,
    (((tint >> 8) & 255) / 255) * shade,
    ((tint & 255) / 255) * shade,
    THREE.SRGBColorSpace,
  );
  return c;
}

export class MeshBatch {
  pos: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];

  quad(corners: Vec3[], uvs: [number, number][], color: THREE.Color) {
    const base = this.pos.length / 3;
    for (let i = 0; i < 4; i++) {
      this.pos.push(...corners[i]);
      this.uv.push(...uvs[i]);
      this.col.push(color.r, color.g, color.b);
    }
    this.idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
  }

  toMesh(tex: TexInfo, side: THREE.Side = THREE.FrontSide, layer = 0): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    const m = new THREE.MeshBasicMaterial({
      map: threeTexture(tex),
      vertexColors: true,
      side,
      transparent: tex.translucent,
      alphaTest: tex.translucent ? 0.01 : 0.5,
      polygonOffset: layer > 0,
      polygonOffsetFactor: -layer,
      polygonOffsetUnits: -layer * 4,
    });
    return new THREE.Mesh(g, m);
  }
}

async function buildElements(store: AssetStore, model: ResolvedModel, tints: number[]): Promise<THREE.Group> {
  const batches = new Map<string, MeshBatch>();
  for (const el of model.elements) {
    const xf = elementTransform(el);
    for (const [dir, face] of Object.entries(el.faces) as [FaceDir, ModelElement['faces'][FaceDir]][]) {
      if (!face) continue;
      const tex = resolveFaceTexture(model.textures, face.texture) ?? '#missing';
      let batch = batches.get(tex);
      if (!batch) batches.set(tex, (batch = new MeshBatch()));

      const [u1, v1, u2, v2] = face.uv ?? defaultUV(dir, el.from, el.to);
      const uvs: [number, number][] = [[u1, v1], [u2, v1], [u2, v2], [u1, v2]].map(
        ([u, v]) => [u / 16, 1 - v / 16] as [number, number],
      );
      const k = (((face.rotation ?? 0) / 90) % 4 + 4) % 4;
      const rotated = uvs.map((_, i) => uvs[(i - k + 4) % 4]);
      const corners = faceCorners(dir, el.from, el.to).map((c) => xf(c).map((n) => n / 16 - 0.5) as Vec3);
      const tint = face.tintindex !== undefined && face.tintindex >= 0 ? (tints[face.tintindex] ?? 0xffffff) : 0xffffff;
      batch.quad(corners, rotated, vertexColor(el.shade === false ? 1 : SHADE[dir], tint));
    }
  }
  const group = new THREE.Group();
  for (const [tex, batch] of batches) {
    const info = await loadTexture(store, tex.startsWith('#') ? 'minecraft:missingno' : tex);
    group.add(batch.toMesh(info));
  }
  return group;
}

/** item/generated: each layer becomes a 1px thick sprite with edge faces for every opaque border pixel. */
export async function buildGenerated(store: AssetStore, layers: string[], tints: number[]): Promise<THREE.Group> {
  const group = new THREE.Group();
  const zf = 0.5 / 16;
  for (let li = 0; li < layers.length; li++) {
    const tex = await loadTexture(store, layers[li]);
    const color = (shade: number) => vertexColor(shade, tints[li] ?? 0xffffff);
    const b = new MeshBatch();
    const full = (z: number, corners: [number, number][]) => b.quad(
      corners.map(([x, y]) => [x, y, z] as Vec3),
      corners.map(([x, y]) => [x + 0.5, y + 0.5] as [number, number]),
      color(1),
    );
    full(zf, [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]);
    full(-zf, [[0.5, 0.5], [-0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]]);

    const { width: w, height: h, pixels } = tex;
    const opaque = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && pixels[(y * w + x) * 4 + 3] > 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!opaque(x, y)) continue;
        const x0 = x / w - 0.5, x1 = (x + 1) / w - 0.5;
        const yT = 0.5 - y / h, yB = 0.5 - (y + 1) / h;
        const uv: [number, number] = [(x + 0.5) / w, 1 - (y + 0.5) / h];
        const uvs = [uv, uv, uv, uv];
        if (!opaque(x, y - 1)) b.quad([[x0, yT, -zf], [x1, yT, -zf], [x1, yT, zf], [x0, yT, zf]], uvs, color(SHADE.up));
        if (!opaque(x, y + 1)) b.quad([[x0, yB, zf], [x1, yB, zf], [x1, yB, -zf], [x0, yB, -zf]], uvs, color(SHADE.down));
        if (!opaque(x - 1, y)) b.quad([[x0, yT, -zf], [x0, yT, zf], [x0, yB, zf], [x0, yB, -zf]], uvs, color(SHADE.west));
        if (!opaque(x + 1, y)) b.quad([[x1, yT, zf], [x1, yT, -zf], [x1, yB, -zf], [x1, yB, zf]], uvs, color(SHADE.east));
      }
    }
    group.add(b.toMesh(tex, THREE.DoubleSide, li));
  }
  return group;
}

/** Stand-in for models rendered by code in-game (chests, banners, heads …): a cube with the particle texture. */
function placeholderModel(model: ResolvedModel): ResolvedModel {
  const tex = model.textures.particle && !model.textures.particle.startsWith('#') ? model.textures.particle : 'minecraft:missingno';
  const face = { texture: tex };
  return {
    ...model,
    textures: { particle: tex },
    elements: [{ from: [2, 2, 2], to: [14, 14, 14], faces: { north: face, south: face, east: face, west: face, up: face, down: face } }],
  };
}

const DEFAULT_BLOCK_GUI: DisplayTransform = { rotation: [30, 225, 0], scale: [0.625, 0.625, 0.625] };

export function applyDisplay(obj: THREE.Object3D, t: DisplayTransform | undefined) {
  const deg = THREE.MathUtils.degToRad;
  const [tx, ty, tz] = t?.translation ?? [0, 0, 0];
  const [rx, ry, rz] = t?.rotation ?? [0, 0, 0];
  const [sx, sy, sz] = t?.scale ?? [1, 1, 1];
  obj.position.set(tx / 16, ty / 16, tz / 16);
  obj.rotation.set(deg(rx), deg(ry), deg(rz), 'XYZ');
  obj.scale.set(sx, sy, sz);
}

const HALF = new THREE.Matrix4().makeTranslation(0.5, 0.5, 0.5);
const MINUS_HALF = new THREE.Matrix4().makeTranslation(-0.5, -0.5, -0.5);

/** Special models are drawn by code from entity model layers, placed with the item's `transformation`. */
async function buildSpecial(store: AssetStore, layers: SpecialLayer[], chain: THREE.Matrix4): Promise<THREE.Group> {
  // item space is 0..1 around the block; the layers are in pixels
  const outer = chain.clone().multiply(new THREE.Matrix4().makeScale(1 / 16, 1 / 16, 1 / 16));
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  group.matrix.copy(MINUS_HALF.clone().multiply(outer));
  for (let i = 0; i < layers.length; i++) {
    const mesh = await buildLayerMesh(store, layers[i], i, outer);
    if (mesh) group.add(mesh);
  }
  return group;
}

export async function buildModelObject(
  store: AssetStore,
  { ref, model }: ResolvedItemModel,
  context: DisplayContext,
  options?: SpecialOptions,
): Promise<THREE.Object3D> {
  const wrapper = new THREE.Group();
  let inner: THREE.Group;
  let display = context === 'none' ? undefined : model.display[context];
  const chain = chainMatrix(ref.transforms);
  const special = ref.special && specialLayers(ref.special, options);
  if (special) {
    inner = await buildSpecial(store, special, chain);
  } else {
    if (model.kind === 'generated') {
      inner = await buildGenerated(store, model.layers, ref.tints);
    } else if (model.kind === 'elements') {
      inner = await buildElements(store, model, ref.tints);
    } else {
      inner = await buildElements(store, placeholderModel(model), []);
      if (context === 'gui' && !display) display = DEFAULT_BLOCK_GUI;
    }
    if (ref.transforms?.length) {
      // Geometry is centred on the origin; transformations apply in 0..1 block space.
      inner.matrixAutoUpdate = false;
      inner.matrix.copy(MINUS_HALF.clone().multiply(chain).multiply(HALF));
    }
  }
  wrapper.add(inner);
  applyDisplay(wrapper, display);
  return wrapper;
}

export async function buildItemObject(
  store: AssetStore,
  models: ResolvedItemModel[],
  context: DisplayContext,
  options?: SpecialOptions,
): Promise<THREE.Group> {
  const root = new THREE.Group();
  for (const m of models) root.add(await buildModelObject(store, m, context, options));
  return root;
}

export function disposeObject(obj: THREE.Object3D) {
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      (o.material as THREE.Material).dispose();
    }
  });
}
