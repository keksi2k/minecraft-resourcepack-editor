/**
 * Ready-made shader changes. Each one starts from the file as it is now (the pack's, else the
 * game's) and only applies when that file still has the part it changes, since shaders differ from
 * one Minecraft version to the next.
 */

export type PresetId = 'noFog' | 'fullbright' | 'grayCreeper' | 'plainViews';
export const PRESETS: PresetId[] = ['noFog', 'fullbright', 'grayCreeper', 'plainViews'];

type Read = (path: string) => string | undefined;
type Changes = Map<string, string>;

const FOG = 'assets/minecraft/shaders/include/fog.glsl';
const LIGHTMAP = 'assets/minecraft/shaders/core/lightmap.fsh';
const effect = (name: string) => `assets/minecraft/post_effect/${name}.json`;

/** A post effect that shows the screen as it is: one copy pass. */
const plainEffect = () => ({
  targets: { swap: {} },
  passes: [
    {
      vertex_shader: 'minecraft:core/screenquad',
      fragment_shader: 'minecraft:post/blit',
      inputs: [{ sampler_name: 'In', target: 'minecraft:main' }],
      output: 'swap',
      uniforms: { BlitConfig: [{ name: 'ColorModulate', type: 'vec4', value: [1, 1, 1, 1] }] },
    },
    {
      vertex_shader: 'minecraft:core/screenquad',
      fragment_shader: 'minecraft:post/blit',
      inputs: [{ sampler_name: 'In', target: 'swap' }],
      output: 'minecraft:main',
      uniforms: { BlitConfig: [{ name: 'ColorModulate', type: 'vec4', value: [1, 1, 1, 1] }] },
    },
  ],
});

const json = (v: unknown) => `${JSON.stringify(v, null, 4)}\n`;

/** The files a preset writes, or undefined when the files it needs don't look as expected. */
export function presetChanges(id: PresetId, read: Read): Changes | undefined {
  const out: Changes = new Map();
  switch (id) {
    case 'noFog': {
      // fog still gets worked out, it just isn't mixed in
      const fog = read(FOG);
      const mix = /return vec4\(mix\(inColor\.rgb, fogColor\.rgb, [^;]*\), inColor\.a\);/;
      if (!fog || !mix.test(fog)) return undefined;
      out.set(FOG, fog.replace(mix, 'return inColor;'));
      return out;
    }
    case 'fullbright': {
      const lightmap = read(LIGHTMAP);
      const end = /fragColor = vec4\(color, 1\.0\);/;
      if (!lightmap || !end.test(lightmap)) return undefined;
      out.set(LIGHTMAP, lightmap.replace(end, 'fragColor = vec4(1.0);'));
      return out;
    }
    case 'grayCreeper': {
      const text = read(effect('creeper'));
      if (!text) return undefined;
      let fx: any;
      try {
        fx = JSON.parse(text);
      } catch {
        return undefined;
      }
      const gray = [0.3, 0.59, 0.11];
      let found = false;
      for (const pass of fx.passes ?? [])
        for (const u of pass.uniforms?.ColorConfig ?? [])
          if (/^(Red|Green|Blue)Matrix$/.test(u.name)) {
            u.value = gray;
            found = true;
          }
      // without the coarse pixels of the bits pass
      for (const pass of fx.passes ?? []) for (const u of pass.uniforms?.BitsConfig ?? []) if (u.name === 'MosaicSize') u.value = 1;
      if (!found) return undefined;
      out.set(effect('creeper'), json(fx));
      return out;
    }
    case 'plainViews': {
      for (const name of ['creeper', 'spider', 'invert']) if (read(effect(name)) !== undefined) out.set(effect(name), json(plainEffect()));
      return out.size ? out : undefined;
    }
  }
}
