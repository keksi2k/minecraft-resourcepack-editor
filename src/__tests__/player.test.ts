import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AssetStore } from '../assets/AssetStore';
import { MOBS } from '../entities/catalog';
import { mobLayers } from '../entities/equipment';
import { isSlim, playerLayers, playerSkins, skinName } from '../entities/player';
import { ENTITY_MODELS, handDisplay, handMatrix } from '../render/entityMesh';

const steve = MOBS.find((m) => m.id === 'player')!;
const alex = MOBS.find((m) => m.id === 'player_slim')!;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

describe('player preview', () => {
  it('lists the default skins (and the pack’s) for wide or slim arms', () => {
    const store = new AssetStore(
      new Map([
        ['assets/minecraft/textures/entity/player/wide/steve.png', png],
        ['assets/minecraft/textures/entity/player/wide/kai.png', png],
        ['assets/minecraft/textures/entity/player/slim/alex.png', png],
        ['assets/minecraft/textures/entity/player/wide/old/x.png', png],
      ]),
      new Map(),
    );
    expect(playerSkins(store, false)).toEqual(['minecraft:entity/player/wide/kai', 'minecraft:entity/player/wide/steve']);
    expect(playerSkins(store, true)).toEqual(['minecraft:entity/player/slim/alex']);
    expect(skinName('minecraft:entity/player/wide/kai')).toBe('kai');
    expect(isSlim(alex)).toBe(true);
    expect(isSlim(steve)).toBe(false);
  });

  it('swaps the skin and adds a cape behind the body', () => {
    const layers = playerLayers(steve.layers, { skin: 'minecraft:entity/player/wide/kai', cape: '__custom:cape_1' }, 'minecraft:entity/equipment/wings/elytra');
    expect(layers[0]).toEqual({ ...steve.layers[0], texture: 'minecraft:entity/player/wide/kai' });
    expect(layers.at(-1)).toEqual({ model: 'minecraft:player#cape', texture: '__custom:cape_1', matchAspect: true });
    expect(ENTITY_MODELS['minecraft:player#cape']).toBeDefined();
  });

  it('puts the elytra in the chest slot, in the cape’s picture when there is a cape', () => {
    const store = new AssetStore(
      new Map([['assets/minecraft/equipment/iron.json', new TextEncoder().encode(JSON.stringify({ layers: { humanoid: [{ texture: 'minecraft:iron' }] } }))],
        ['assets/minecraft/equipment/elytra.json', new TextEncoder().encode(JSON.stringify({ layers: { wings: [{ texture: 'minecraft:elytra' }] } }))]]),
      new Map(),
    );
    const plain = mobLayers(store, steve, { elytra: true, armor: { chestplate: 'minecraft:iron', helmet: 'minecraft:iron' } });
    expect(plain.some((l) => l.model.endsWith('#chestplate'))).toBe(false);
    expect(plain.some((l) => l.model.endsWith('#helmet'))).toBe(true);
    expect(plain.at(-1)).toEqual({ model: 'minecraft:elytra#main', texture: 'minecraft:entity/equipment/wings/elytra', rootPose: { z: 2 } });
    const caped = mobLayers(store, steve, { elytra: true, cape: '__custom:cape_2' });
    expect(caped.at(-1)?.texture).toBe('__custom:cape_2');
    expect(caped.some((l) => l.model === 'minecraft:player#cape')).toBe(false);
  });

  it('mirrors the right hand’s display transform for the left hand', () => {
    const right = { rotation: [0, -90, 55] as [number, number, number], translation: [0, 4, 0.5] as [number, number, number], scale: [0.85, 0.85, 0.85] as [number, number, number] };
    expect(handDisplay({ thirdperson_righthand: right }, false)).toBe(right);
    expect(handDisplay({ thirdperson_righthand: right }, true)).toEqual({ ...right, translation: [-0, 4, 0.5], rotation: [0, 90, -55] });
    expect(handDisplay({}, true)).toBeUndefined();
  });

  it('holds items in front of the hand, like the game’s item-in-hand layer', () => {
    // right arm at rest: pivot (-5, 2, 0); the item ends up 10 px below the shoulder, 2 px in front
    const p = new THREE.Vector3().applyMatrix4(handMatrix([-5, 2, 0, 0, 0, 0], [0, 0, 0], false, false)).multiplyScalar(16);
    expect([p.x, p.y, p.z].map((v) => Math.round(v * 100) / 100)).toEqual([-6, 12, -2]);
    // slim arms: half a pixel further in, the left hand mirrored
    const q = new THREE.Vector3().applyMatrix4(handMatrix([5, 2, 0, 0, 0, 0], [0, 0, 0], true, true)).multiplyScalar(16);
    expect([q.x, q.y, q.z].map((v) => Math.round(v * 100) / 100)).toEqual([5.5, 12, -2]);
  });
});
