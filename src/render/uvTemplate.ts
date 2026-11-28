import { frameSize, pngSize, type AssetStore } from '../assets/AssetStore';
import { resolveFaceTexture, type FaceDir, type ResolvedModel } from '../models/modelResolver';
import { texturePath } from '../models/resourceLocation';
import { defaultUV } from './buildMesh';

/**
 * UV templates: a picture of where each face of a model takes its pixels from, to paint a texture
 * on (or to see the parts over the current one). Every model part gets a colour, its faces the
 * game's shading of that colour (top lightest, bottom darkest), with a darker outline.
 */

export interface TemplateFace {
  part: string;
  face: FaceDir;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface UVTemplate {
  /** Texture size in pixels (one animation frame). */
  size: [number, number];
  faces: TemplateFace[];
}

/** Size of one frame of a texture, if it's in the pack or the game. */
export function textureFrameSize(store: AssetStore, textureId: string): [number, number] | undefined {
  const path = texturePath(textureId);
  const png = store.get(path);
  const size = png && pngSize(png);
  if (!size) return undefined;
  const anim = store.json<{ animation?: { width?: number; height?: number } }>(`${path}.mcmeta`)?.animation;
  return anim ? frameSize(anim, size[0], size[1]) : size;
}

/** The faces of a block or item model, per texture they use (texture id → template). */
export function modelTemplates(store: AssetStore, models: ResolvedModel[]): Map<string, UVTemplate> {
  const out = new Map<string, UVTemplate>();
  models.forEach((model, mi) => {
    if (model.kind !== 'elements') return;
    model.elements.forEach((el, ei) => {
      for (const [dir, face] of Object.entries(el.faces) as [FaceDir, NonNullable<(typeof el.faces)[FaceDir]>][]) {
        const tex = resolveFaceTexture(model.textures, face.texture);
        if (!tex) continue;
        let t = out.get(tex);
        if (!t) out.set(tex, (t = { size: textureFrameSize(store, tex) ?? [16, 16], faces: [] }));
        const [u0, v0, u1, v1] = face.uv ?? defaultUV(dir, el.from, el.to);
        const [sx, sy] = [t.size[0] / 16, t.size[1] / 16];
        const r = { x0: Math.min(u0, u1) * sx, y0: Math.min(v0, v1) * sy, x1: Math.max(u0, u1) * sx, y1: Math.max(v0, v1) * sy };
        // elements of a model with several parts (or several models) count as parts
        if (r.x1 > r.x0 && r.y1 > r.y0) t.faces.push({ part: `${models.length > 1 ? `${mi}/` : ''}${ei}`, face: dir, ...r });
      }
    });
  });
  return out;
}

const HUES = [0, 30, 55, 95, 150, 185, 210, 240, 270, 300, 330, 15];
/** The game's shading per face direction. */
const SHADE: Record<FaceDir, number> = { up: 1, north: 0.8, south: 0.8, east: 0.6, west: 0.6, down: 0.5 };

const topPart = (part: string) => part.split('/')[0] || 'root';

/** The colour of a part's face. */
export function faceColor(partIndex: number, face: FaceDir): string {
  return `hsl(${HUES[partIndex % HUES.length]} 70% ${Math.round(28 + 42 * SHADE[face])}%)`;
}

/**
 * Draws a template `scale` times the texture size. With `background` (the current texture), the
 * faces are outlined over it instead of filled.
 */
export function drawTemplate(template: UVTemplate, scale: number, background?: CanvasImageSource): HTMLCanvasElement {
  const [w, h] = template.size;
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  if (background) g.drawImage(background, 0, 0, w * scale, h * scale);
  const parts = [...new Set(template.faces.map((f) => topPart(f.part)))];
  const line = Math.max(1, Math.round(scale / 4));
  for (const f of template.faces) {
    const color = faceColor(parts.indexOf(topPart(f.part)), f.face);
    const [x, y, fw, fh] = [f.x0 * scale, f.y0 * scale, (f.x1 - f.x0) * scale, (f.y1 - f.y0) * scale];
    if (!background) {
      g.fillStyle = color;
      g.fillRect(x, y, fw, fh);
    }
    // the outline inside the face, so neighbouring faces keep their own
    if (fw > line * 2 && fh > line * 2) {
      g.strokeStyle = background ? color : 'rgba(0, 0, 0, 0.45)';
      g.lineWidth = line;
      g.strokeRect(x + line / 2, y + line / 2, fw - line, fh - line);
    }
  }
  return canvas;
}

/** A scale that makes the template about 512 pixels wide (at least the texture size). */
export const defaultScale = (size: [number, number]) => Math.max(1, Math.min(32, 2 ** Math.round(Math.log2(512 / Math.max(size[0], size[1])))));
