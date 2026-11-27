import { describe, expect, it } from 'vitest';
import { bbmodelToJava, customModelId, giveCommand, javaModelImport, placeTextures, readCmdCases, writeCmdCases } from '../models/customModels';

const PNG = 'iVBORw0KGgo=';

describe('Blockbench import', () => {
  const bb = {
    meta: { model_format: 'java_block' },
    resolution: { width: 32, height: 32 },
    textures: [{ name: 'Ruby Blade.png', source: `data:image/png;base64,${PNG}` }],
    elements: [
      { name: 'blade', type: 'cube', from: [7, 0, 7], to: [9, 16, 9], origin: [8, 8, 8], rotation: [0, 0, 30], faces: { north: { uv: [0, 0, 16, 32], texture: 0 }, up: { uv: [0, 0, 4, 4], texture: null } } },
      { name: 'gem', type: 'mesh', vertices: {} },
    ],
    display: { gui: { rotation: [30, 45, 0] } },
  };

  it('converts cubes, UVs and one-axis rotations', () => {
    const { model, textures, warnings } = bbmodelToJava(bb);
    expect(model.elements).toHaveLength(1);
    const el = model.elements[0];
    expect(el.faces.north).toEqual({ uv: [0, 0, 8, 16], texture: '#0' });
    expect(el.faces.up).toBeUndefined();
    expect(el.rotation).toEqual({ angle: 22.5, axis: 'z', origin: [8, 8, 8] });
    expect(model.textures).toEqual({ 0: '#0', particle: '#0' });
    expect(model.display.gui.rotation).toEqual([30, 45, 0]);
    expect(textures[0].name).toBe('Ruby Blade');
    expect(textures[0].png?.[0]).toBe(0x89);
    expect(warnings.map((w) => w.code).sort()).toEqual(['mesh', 'rotation']);
  });

  it('puts textures beside the model and points the model at them', () => {
    const placed = placeTextures(bbmodelToJava(bb), 'minecraft:item/custom/diamond_sword/ruby');
    expect(placed.files.map(([id]) => id)).toEqual(['minecraft:item/custom/diamond_sword/ruby/ruby_blade']);
    expect(placed.model.textures).toEqual({ 0: 'minecraft:item/custom/diamond_sword/ruby/ruby_blade', particle: 'minecraft:item/custom/diamond_sword/ruby/ruby_blade' });
    expect(placed.model.elements[0].faces.north.texture).toBe('#0');
  });
});

describe('Java model import', () => {
  it('matches textures to the picked PNGs by name and keeps existing ones', () => {
    const model = { parent: 'block/block', textures: { side: 'custom/lamp_side', top: 'block/stone', bad: 'nope/missing' }, elements: [] };
    const pngs = new Map([['lamp_side.png', new Uint8Array([1])]]);
    const r = javaModelImport(model, pngs, (id) => id === 'minecraft:block/stone');
    expect(r.model.textures).toEqual({ side: '#side', top: 'block/stone', bad: 'nope/missing' });
    expect(r.warnings).toEqual([{ code: 'missingTexture', name: 'nope/missing' }]);
    const placed = placeTextures(r, 'mypack:item/custom/x');
    expect(placed.model.textures.side).toBe('mypack:item/custom/x/lamp_side');
    expect(placed.model.textures.top).toBe('block/stone');
  });
});

describe('custom_model_data cases', () => {
  it('wraps the item model in a select and back', () => {
    const def = { model: { type: 'minecraft:model', model: 'minecraft:item/stick' } };
    const next = writeCmdCases(def, def.model, [{ value: 'wand', model: 'minecraft:item/custom/stick/wand' }]);
    expect(next.model).toMatchObject({ type: 'minecraft:select', property: 'minecraft:custom_model_data', fallback: def.model });
    const read = readCmdCases(next);
    expect(read.cases).toEqual([{ value: 'wand', model: 'minecraft:item/custom/stick/wand' }]);
    expect(writeCmdCases(next, read.base, []).model).toEqual(def.model);
  });

  it('names models and commands', () => {
    expect(customModelId('minecraft:stick', 'Magic Wand', () => false)).toBe('minecraft:item/custom/stick/magic_wand');
    expect(customModelId('minecraft:stick', 'x', (id) => id.endsWith('/x'))).toBe('minecraft:item/custom/stick/x_2');
    expect(giveCommand('minecraft:stick', 'wand')).toBe('/give @s minecraft:stick[minecraft:custom_model_data={strings:["wand"]}]');
  });
});
