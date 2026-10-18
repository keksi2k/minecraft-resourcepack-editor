import { describe, expect, it } from 'vitest';
import {
  addSoundToEvent,
  inspectOgg,
  newSoundName,
  packSoundNames,
  removeSoundFromEvent,
  setEventReplace,
  soundsJsonPath,
} from '../sounds/editSounds';
import { mergeSounds } from '../sounds/soundsJson';

const EV = 'minecraft:entity.zombie_villager.step';

function fakeOgg(codec: 'vorbis' | 'opus', channels = 1): Uint8Array {
  const b = new Uint8Array(80);
  b.set([..."OggS"].map((c) => c.charCodeAt(0)), 0);
  b[26] = 1; // one segment
  const p = 28;
  if (codec === 'opus') b.set([..."OpusHead"].map((c) => c.charCodeAt(0)), p);
  else {
    b[p] = 1;
    b.set([..."vorbis"].map((c) => c.charCodeAt(0)), p + 1);
    b[p + 11] = channels;
    new DataView(b.buffer).setUint32(p + 12, 44100, true);
  }
  return b;
}

describe('editing sounds.json', () => {
  it('adds sounds to an event without replacing vanilla', () => {
    let json = addSoundToEvent({}, EV, 'custom/entity.zombie_villager.step/step');
    json = addSoundToEvent(json, EV, 'custom/entity.zombie_villager.step/step_2');
    expect(json).toEqual({ 'entity.zombie_villager.step': { sounds: ['custom/entity.zombie_villager.step/step', 'custom/entity.zombie_villager.step/step_2'] } });
    expect(soundsJsonPath(EV)).toBe('assets/minecraft/sounds.json');

    const vanilla = { 'entity.zombie_villager.step': { sounds: ['mob/zombie/step1', 'mob/zombie/step2'] } };
    const [ev] = mergeSounds(vanilla, { minecraft: json });
    expect(ev.files.map((f) => [f.name, !!f.fromPack])).toEqual([
      ['minecraft:mob/zombie/step1', false],
      ['minecraft:mob/zombie/step2', false],
      ['minecraft:custom/entity.zombie_villager.step/step', true],
      ['minecraft:custom/entity.zombie_villager.step/step_2', true],
    ]);
    expect(ev.replaced).toBeUndefined();
  });

  it('toggles replace and removes entries again', () => {
    let json = addSoundToEvent({ other: { sounds: ['x'] } }, EV, 'custom/a');
    json = setEventReplace(json, EV, true);
    const ev = mergeSounds({ 'entity.zombie_villager.step': { sounds: ['mob/zombie/step1'] } }, { minecraft: json }).find((e) => e.id === EV)!;
    expect(ev.replaced).toBe(true);
    expect(ev.files.map((f) => f.name)).toEqual(['minecraft:custom/a']);

    json = removeSoundFromEvent(json, EV, 'minecraft:custom/a');
    expect(json['entity.zombie_villager.step']).toEqual({ replace: true, sounds: [] });
    json = setEventReplace(json, EV, false);
    expect(json).toEqual({ other: { sounds: ['x'] } });
    expect(packSoundNames(json, 'minecraft:other')).toEqual(['x']);
  });

  it('generates unique, clean file names', () => {
    const taken = new Set(['custom/entity.zombie_villager.step/my_step']);
    expect(newSoundName(EV, 'My Step!.OGG', (n) => taken.has(n))).toBe('custom/entity.zombie_villager.step/my_step_2');
  });
});

describe('inspectOgg', () => {
  it('accepts vorbis and reports channels', () => {
    expect(inspectOgg(fakeOgg('vorbis', 2))).toEqual({ channels: 2, sampleRate: 44100 });
  });
  it('rejects opus and non-ogg files', () => {
    expect(inspectOgg(fakeOgg('opus'))).toMatch(/Opus/);
    expect(inspectOgg(new Uint8Array(100))).toMatch(/Not an Ogg/);
  });
});

describe('volume and pitch', () => {
  it('turns entries into objects and back to plain strings at the defaults', async () => {
    const { setSoundAttributes } = await import('../sounds/editSounds');
    let json = addSoundToEvent({}, EV, 'custom/a');
    json = setSoundAttributes(json, EV, 'minecraft:custom/a', { volume: 0.5 });
    json = setSoundAttributes(json, EV, 'minecraft:custom/a', { pitch: 1.5 });
    expect(json['entity.zombie_villager.step'].sounds).toEqual([{ name: 'custom/a', volume: 0.5, pitch: 1.5 }]);
    json = setSoundAttributes(json, EV, 'minecraft:custom/a', { volume: undefined, pitch: 1 });
    expect(json['entity.zombie_villager.step'].sounds).toEqual(['custom/a']);
  });

  it('adopts vanilla variants with replace: true, keeping their attributes and event references', async () => {
    const { adoptEvent } = await import('../sounds/editSounds');
    const json = adoptEvent({ other: { sounds: ['x'] } }, EV, [{ name: 'minecraft:mob/zombie/step1' }, { name: 'minecraft:mob/zombie/step2', volume: 0.8 }], ['minecraft:some.event']);
    expect(json[ 'entity.zombie_villager.step']).toEqual({
      replace: true,
      sounds: ['minecraft:mob/zombie/step1', { name: 'minecraft:mob/zombie/step2', volume: 0.8 }, { name: 'minecraft:some.event', type: 'event' }],
    });
    const [ev] = mergeSounds({ 'entity.zombie_villager.step': { sounds: ['mob/zombie/step1', { name: 'mob/zombie/step2', volume: 0.8 }] } }, { minecraft: json }).filter((e) => e.id === EV);
    expect(ev.files.map((f) => [f.name, f.volume, !!f.fromPack])).toEqual([
      ['minecraft:mob/zombie/step1', undefined, true],
      ['minecraft:mob/zombie/step2', 0.8, true],
    ]);
  });
});
