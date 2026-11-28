import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AssetStore } from '../assets/AssetStore';
import { glintMatrix, lightBrightness } from '../render/layers';
import { drawMapTerrain, mapDecorations, MAP_COLORS, shade, SHADES } from '../scenes/map';
import { tooltipLayout, tooltipSprites, tooltipStyles } from '../scenes/tooltip';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe('tooltips', () => {
  it('finds the pack’s tooltip styles and their sprites', () => {
    const store = new AssetStore(
      new Map([
        ['assets/minecraft/textures/gui/sprites/tooltip/background.png', png],
        ['assets/mypack/textures/gui/sprites/tooltip/gold_background.png', png],
        ['assets/mypack/textures/gui/sprites/tooltip/gold_frame.png', png],
      ]),
      new Map(),
    );
    expect(tooltipStyles(store)).toEqual(['mypack:gold']);
    expect(tooltipSprites()).toEqual({ background: 'minecraft:gui/sprites/tooltip/background', frame: 'minecraft:gui/sprites/tooltip/frame' });
    expect(tooltipSprites('mypack:gold')).toEqual({ background: 'mypack:gui/sprites/tooltip/gold_background', frame: 'mypack:gui/sprites/tooltip/gold_frame' });
  });

  it('lays lines out like the game: 10 px each, 2 more after the name, 12 px around', () => {
    expect(tooltipLayout([40])).toEqual({ width: 40, height: 8, lineY: [0], box: { x: -12, y: -12, w: 64, h: 32 } });
    const three = tooltipLayout([30, 50, 20]);
    expect(three.height).toBe(30);
    expect(three.lineY).toEqual([0, 12, 22]);
    expect(three.box.w).toBe(74);
  });
});

describe('maps', () => {
  it('lists the decorations and draws land in the game’s map shades', () => {
    const store = new AssetStore(
      new Map([
        ['assets/minecraft/textures/map/decorations/player.png', png],
        ['assets/minecraft/textures/map/decorations/red_x.png', png],
        ['assets/minecraft/textures/map/map_background.png', png],
      ]),
      new Map(),
    );
    expect(mapDecorations(store)).toEqual(['minecraft:map/decorations/player', 'minecraft:map/decorations/red_x']);
    const map = drawMapTerrain(3);
    expect([map.width, map.height]).toEqual([128, 128]);
    const allowed = new Set(Object.values(MAP_COLORS).flatMap((c) => SHADES.slice(0, 3).map((s) => shade(c, s).join())));
    for (let i = 0; i < map.data.length; i += 4 * 97) expect(allowed.has([map.data[i], map.data[i + 1], map.data[i + 2]].join())).toBe(true);
    expect(drawMapTerrain(3).data).toEqual(map.data);
  });
});

describe('light and glint', () => {
  it('darkens like the game’s light map', () => {
    expect(lightBrightness(15)).toBeCloseTo(1, 1);
    expect(lightBrightness(0)).toBeGreaterThan(0.05);
    expect(lightBrightness(0)).toBeLessThan(0.1);
    for (let l = 1; l <= 15; l++) expect(lightBrightness(l)).toBeGreaterThan(lightBrightness(l - 1));
  });

  it('slides and turns the glint texture over time', () => {
    const at = (ms: number) => new THREE.Vector2(0, 0).applyMatrix3(glintMatrix(ms, 1));
    expect(at(0).toArray()).toEqual([0, 0]);
    const later = at(1000);
    // 8000 steps: −8000/110000 across, 8000/30000 up
    expect(later.x).toBeCloseTo(-8000 / 110000, 6);
    expect(later.y).toBeCloseTo(8000 / 30000, 6);
  });
});
