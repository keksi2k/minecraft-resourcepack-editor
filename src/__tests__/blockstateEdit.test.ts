import { describe, expect, it } from 'vitest';
import {
  blockProperties,
  defaultState,
  keyOf,
  matchingCases,
  parseWhen,
  stateParts,
  toMultipart,
  variantKeyFor,
  withFirst,
  writeWhen,
} from '../models/blockstateEdit';
import { elementProblems, newCube, textureVariables, tidyElement, withOwnElements } from '../models/modelEdit';

const fence = {
  multipart: [
    { apply: { model: 'block/oak_fence_post' } },
    { when: { north: 'true' }, apply: { model: 'block/oak_fence_side', uvlock: true } },
    { when: { east: 'true' }, apply: { model: 'block/oak_fence_side', y: 90, uvlock: true } },
    { when: { OR: [{ facing: 'north|south', open: 'true' }, { powered: 'true' }] }, apply: { model: 'block/x' } },
  ],
};

describe('block states', () => {
  it('collects the properties a file mentions, sorted', () => {
    expect(blockProperties(fence)).toEqual({ east: ['false', 'true'], facing: ['north', 'south'], north: ['false', 'true'], open: ['false', 'true'], powered: ['false', 'true'] });
    expect(blockProperties({ variants: { 'age=10': {}, 'age=2,lit=true': {}, 'age=1,lit=false': {} } })).toEqual({ age: ['1', '2', '10'], lit: ['false', 'true'] });
    expect(defaultState({ facing: ['east', 'north'], lit: ['false', 'true'], age: ['0', '1'] })).toEqual({ facing: 'north', lit: 'false', age: '0' });
  });

  it('reads and writes conditions, OR groups and | values', () => {
    expect(parseWhen(undefined)).toEqual([]);
    expect(parseWhen({ north: 'true', up: 'false|true' })).toEqual([{ north: ['true'], up: ['false', 'true'] }]);
    expect(parseWhen(fence.multipart[3].when)).toEqual([{ facing: ['north', 'south'], open: ['true'] }, { powered: ['true'] }]);
    expect(parseWhen({ AND: [{ a: 'x|y' }, { a: 'y', b: 'z' }] })).toEqual([{ a: ['y'], b: ['z'] }]);
    expect(writeWhen([])).toBeUndefined();
    expect(writeWhen([{ north: ['true'] }])).toEqual({ north: 'true' });
    expect(writeWhen([{ a: ['1', '2'] }, { b: [] }, { c: ['x'] }])).toEqual({ OR: [{ a: '1|2' }, { c: 'x' }] });
  });

  it('finds what a block shows in a state', () => {
    expect(matchingCases(fence, { north: 'true', east: 'false' })).toEqual([0, 1]);
    expect(matchingCases(fence, { powered: 'true' })).toEqual([0, 3]);
    expect(stateParts(fence, { north: 'true', east: 'true' }).map((p) => p[0].y ?? 0)).toEqual([0, 0, 90]);
    const variants = { variants: { 'facing=north': { model: 'a' }, 'facing=east': [{ model: 'b' }, { model: 'c' }] } };
    expect(variantKeyFor(variants, { facing: 'east', lit: 'true' })).toBe('facing=east');
    expect(stateParts(variants, { facing: 'east' })).toEqual([[{ model: 'b' }, { model: 'c' }]]);
    expect(stateParts(variants, { facing: 'up' })).toEqual([]);
    expect(keyOf({ lit: 'true', facing: 'east' })).toBe('facing=east,lit=true');
  });

  it('changes the first model and keeps random alternatives', () => {
    expect(withFirst({ model: 'a' }, { model: 'b', y: 90, x: 0 })).toEqual({ model: 'b', y: 90 });
    expect(withFirst([{ model: 'a' }, { model: 'c' }], { model: 'b', uvlock: true })).toEqual([{ model: 'b', uvlock: true }, { model: 'c' }]);
  });

  it('turns variants into multipart cases', () => {
    expect(toMultipart({ variants: { '': { model: 'a' }, 'lit=true': { model: 'b' } } })).toEqual({ multipart: [{ apply: { model: 'a' } }, { when: { lit: 'true' }, apply: { model: 'b' } }] });
  });
});

describe('model editing', () => {
  it('makes cubes, tidies corners and spots what the game refuses', () => {
    const cube = newCube('#side');
    expect(Object.keys(cube.faces)).toHaveLength(6);
    expect(tidyElement({ ...cube, from: [20, 0, -40], to: [4, 16, 16] })).toMatchObject({ from: [4, 0, -16], to: [20, 16, 16] });
    expect(elementProblems(cube)).toEqual([]);
    expect(elementProblems({ ...cube, to: [40, 16, 16], rotation: { origin: [8, 8, 8], axis: 'y', angle: 30 }, faces: {} })).toEqual(['range', 'angle', 'faces']);
  });

  it('copies inherited elements and lists texture variables', () => {
    const own = withOwnElements({ parent: 'block/cube_all', textures: { all: 'block/stone' } }, [newCube()]);
    expect(own.parent).toBe('block/cube_all');
    expect(own.elements).toHaveLength(1);
    expect(withOwnElements({}, []).elements).toHaveLength(1);
    expect(textureVariables({ top: 'x' }, { all: 'a', particle: 'p' })).toEqual(['all', 'top']);
  });
});
