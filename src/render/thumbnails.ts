import * as THREE from 'three';
import type { AssetStore } from '../assets/AssetStore';
import type { ItemEntry } from '../models/items';
import type { MobDef } from '../entities/catalog';
import type { SpecialOptions } from '../entities/specials';
import { texturePath } from '../models/resourceLocation';
import { subscribeTicks } from './animation';
import { buildItemObject, disposeObject } from './buildMesh';
import { buildMobObject, mobDeps } from './entityMesh';
import { loadTexture } from './textures';

let renderer: THREE.WebGLRenderer | null = null;
const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, -10, 10);
const cache = new Map<string, Promise<string>>();
/** WebGL renders share one renderer, so they run one after another. */
let queue: Promise<unknown> = Promise.resolve();

function getRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, preserveDrawingBuffer: true });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  return renderer;
}

/** Flat items look the same as the GUI render of their extruded mesh, so they are composited in 2D. */
async function composite2D(store: AssetStore, item: ItemEntry, size: number): Promise<string> {
  const layers = await Promise.all(
    item.models.flatMap((m) => m.model.layers.map(async (id, i) => ({ tex: await loadTexture(store, id), tint: m.ref.tints[i] }))),
  );
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const g = out.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  for (const { tex, tint } of layers) {
    let src: HTMLCanvasElement = tex.canvas;
    if (tint !== undefined && tint !== 0xffffff) {
      src = document.createElement('canvas');
      src.width = tex.width;
      src.height = tex.height;
      const sg = src.getContext('2d')!;
      const img = sg.createImageData(tex.width, tex.height);
      const [r, gr, b] = [(tint >> 16) & 255, (tint >> 8) & 255, tint & 255];
      for (let i = 0; i < tex.pixels.length; i += 4) {
        img.data[i] = (tex.pixels[i] * r) / 255;
        img.data[i + 1] = (tex.pixels[i + 1] * gr) / 255;
        img.data[i + 2] = (tex.pixels[i + 2] * b) / 255;
        img.data[i + 3] = tex.pixels[i + 3];
      }
      sg.putImageData(img, 0, 0);
    }
    g.drawImage(src, 0, 0, size, size);
  }
  return out.toDataURL();
}

async function render3D(store: AssetStore, item: ItemEntry, size: number, options?: SpecialOptions): Promise<string> {
  const obj = await buildItemObject(store, item.models, 'gui', options);
  const scene = new THREE.Scene();
  scene.add(obj);
  const r = getRenderer();
  r.setSize(size, size, false);
  r.render(scene, camera);
  const url = r.domElement.toDataURL();
  disposeObject(obj);
  return url;
}

/**
 * Inventory-style render of an item as a data URL ('' if the item has nothing to draw).
 * `options` feed special models (banner patterns …) like item components do in game.
 */
export function itemThumbnail(store: AssetStore, item: ItemEntry, size = 128, options?: SpecialOptions): Promise<string> {
  const key = `${item.id}|${item.depsKey}|${size}|${options ? JSON.stringify(options) : ''}`;
  let p = cache.get(key);
  if (!p) {
    if (item.models.length === 0) p = Promise.resolve('');
    else if (!options && item.models.every((m) => m.model.kind === 'generated')) p = composite2D(store, item, size);
    else {
      p = queue.then(() => render3D(store, item, size, options));
      queue = p.catch(() => {});
    }
    cache.set(key, p);
  }
  return p;
}

/** Whether any texture of the item has an `.mcmeta` (and so may be animated). */
export function hasAnimatedTextures(store: AssetStore, item: ItemEntry): boolean {
  return item.textures.some((t) => store.has(`${texturePath(t)}.mcmeta`));
}

/**
 * Live inventory render into `canvas`: re-rendered whenever one of the item's animated textures
 * shows a new frame. Returns a function that stops it.
 */
export function animateThumbnail(store: AssetStore, item: ItemEntry, canvas: HTMLCanvasElement, size = 128): () => void {
  let stopped = false;
  let cleanup = () => {};
  void buildItemObject(store, item.models, 'gui').then((obj) => {
    if (stopped) return disposeObject(obj);
    const scene = new THREE.Scene();
    scene.add(obj);
    const maps = new Set<THREE.Texture>();
    obj.traverse((o) => {
      const map = o instanceof THREE.Mesh ? (o.material as THREE.MeshBasicMaterial).map : null;
      if (map) maps.add(map);
    });
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d')!;
    let shown = -1;
    const unsubscribe = subscribeTicks(() => {
      // texture listeners run first and bump `version` when their frame changes
      let version = 0;
      for (const m of maps) version += m.version;
      if (version === shown) return;
      shown = version;
      const r = getRenderer();
      r.setSize(size, size, false);
      r.render(scene, camera);
      g.clearRect(0, 0, size, size);
      g.drawImage(r.domElement, 0, 0);
    });
    cleanup = () => {
      unsubscribe();
      disposeObject(obj);
    };
  });
  return () => {
    stopped = true;
    cleanup();
  };
}

/** Orthographic camera from the front-right and slightly above, framed tightly around the object. */
export function fitCamera(obj: THREE.Object3D, aspect = 1, margin = 1.08): THREE.OrthographicCamera {
  const box = new THREE.Box3().setFromObject(obj);
  const center = box.getCenter(new THREE.Vector3());
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
  cam.position.copy(center).add(new THREE.Vector3(1, 0.75, 1.6).normalize().multiplyScalar(10));
  cam.lookAt(center);
  cam.updateMatrixWorld();
  const inv = cam.matrixWorldInverse;
  let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
    const p = new THREE.Vector3(x, y, z).applyMatrix4(inv);
    [x0, x1, y0, y1] = [Math.min(x0, p.x), Math.max(x1, p.x), Math.min(y0, p.y), Math.max(y1, p.y)];
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const half = (Math.max((x1 - x0) / aspect, y1 - y0) / 2) * margin;
  [cam.left, cam.right, cam.top, cam.bottom] = [cx - half * aspect, cx + half * aspect, cy + half, cy - half];
  cam.updateProjectionMatrix();
  return cam;
}

async function renderMob(store: AssetStore, mob: MobDef, size: number): Promise<string> {
  const obj = await buildMobObject(store, mob);
  const scene = new THREE.Scene();
  scene.add(obj);
  scene.updateMatrixWorld();
  const r = getRenderer();
  r.setSize(size, size, false);
  r.render(scene, fitCamera(obj));
  const url = r.domElement.toDataURL();
  disposeObject(obj);
  return url;
}

export function mobThumbnail(store: AssetStore, mob: MobDef, size = 160): Promise<string> {
  const key = `mob:${mob.id}|${mobDeps(mob).map((d) => store.rev(d)).join('.')}|${size}`;
  let p = cache.get(key);
  if (!p) {
    p = queue.then(() => renderMob(store, mob, size));
    queue = p.catch(() => {});
    cache.set(key, p);
  }
  return p;
}
