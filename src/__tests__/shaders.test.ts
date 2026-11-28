import { describe, expect, it } from 'vitest';
import { AssetStore } from '../assets/AssetStore';
import { effectPath, resolveIncludes, shaderFiles, shaderPath, tokenize, toWebGL } from '../shaders/glsl';
import { presetChanges } from '../shaders/presets';

const enc = (s: string) => new TextEncoder().encode(s);

describe('shader files', () => {
  it('sorts the files into effects, post and core shaders and includes', () => {
    const store = new AssetStore(
      new Map([
        ['assets/minecraft/post_effect/creeper.json', enc('{}')],
        ['assets/minecraft/shaders/post/invert.fsh', enc('')],
        ['assets/minecraft/shaders/core/terrain.vsh', enc('')],
        ['assets/minecraft/shaders/include/fog.glsl', enc('')],
        ['assets/minecraft/textures/block/stone.png', enc('')],
      ]),
      new Map(),
    );
    expect(shaderFiles(store).map((f) => [f.group, f.id])).toEqual([
      ['effect', 'minecraft:creeper'],
      ['core', 'minecraft:core/terrain'],
      ['include', 'minecraft:fog.glsl'],
      ['post', 'minecraft:post/invert'],
    ]);
    expect(shaderPath('minecraft:post/blit', 'fsh')).toBe('assets/minecraft/shaders/post/blit.fsh');
    expect(effectPath('spider')).toBe('assets/minecraft/post_effect/spider.json');
  });

  it('fills in includes once each', () => {
    const files: Record<string, string> = {
      'assets/minecraft/shaders/include/a.glsl': '#include <minecraft:b.glsl>\nfloat a;',
      'assets/minecraft/shaders/include/b.glsl': 'float b;',
    };
    const out = resolveIncludes('#include <minecraft:a.glsl>\n#moj_import <minecraft:b.glsl>\n#include <minecraft:none.glsl>\nvoid main(){}', (p) => files[p]);
    expect(out).toBe('float b;\nfloat a;\n\n// missing include minecraft:none.glsl\nvoid main(){}');
  });

  it('turns the game’s GLSL 330 into WebGL GLSL', () => {
    const src = `#version 330
#extension GL_ARB_separate_shader_objects : require
layout(std140) uniform SamplerInfo {
    vec2 OutSize;
    vec2 InSize;
};
layout(std140) uniform LightmapInfo {
    float SkyFactor;
} lightmapInfo;
layout(location = 0) in vec2 texCoord;
layout(location = 0) out vec4 fragColor;
void main() { int i = gl_VertexIndex; }`;
    const out = toWebGL(src);
    expect(out.startsWith('#version 300 es\nprecision highp float;')).toBe(true);
    expect(out).not.toMatch(/#extension|layout\(|#version 330|gl_VertexIndex/);
    expect(out).toContain('uniform vec2 OutSize;\nuniform vec2 InSize;');
    expect(out).toContain('struct LightmapInfo_t {');
    expect(out).toContain('uniform LightmapInfo_t lightmapInfo;');
    expect(out).toContain('in vec2 texCoord;');
    expect(out).toContain('gl_VertexID');
  });

  it('colours code without losing any of it', () => {
    const src = '#version 330\n// note\nuniform vec2 a = 1.5; /* x */ "s"';
    const tokens = tokenize(src);
    expect(tokens.map((t) => t.text).join('')).toBe(src);
    expect(tokens.filter((t) => t.kind !== 'text').map((t) => t.kind)).toEqual(['preprocessor', 'comment', 'keyword', 'type', 'number', 'comment', 'string']);
  });
});

describe('shader presets', () => {
  const fog = 'vec4 apply_fog(vec4 inColor) {\n    return vec4(mix(inColor.rgb, fogColor.rgb, fogValue * fogColor.a), inColor.a);\n}';
  const creeper = JSON.stringify({
    passes: [
      { uniforms: { ColorConfig: [{ name: 'RedMatrix', type: 'vec3', value: [0, 0, 0] }] } },
      { uniforms: { BitsConfig: [{ name: 'MosaicSize', type: 'float', value: 4 }] } },
    ],
  });
  const files: Record<string, string> = {
    'assets/minecraft/shaders/include/fog.glsl': fog,
    'assets/minecraft/shaders/core/lightmap.fsh': 'void main() {\n    fragColor = vec4(color, 1.0);\n}',
    'assets/minecraft/post_effect/creeper.json': creeper,
    'assets/minecraft/post_effect/invert.json': '{}',
  };
  const read = (p: string) => files[p];

  it('changes the files they need, if those look as expected', () => {
    expect(presetChanges('noFog', read)?.get('assets/minecraft/shaders/include/fog.glsl')).toContain('return inColor;');
    expect(presetChanges('fullbright', read)?.get('assets/minecraft/shaders/core/lightmap.fsh')).toContain('fragColor = vec4(1.0);');
    const gray = JSON.parse(presetChanges('grayCreeper', read)!.get('assets/minecraft/post_effect/creeper.json')!);
    expect(gray.passes[0].uniforms.ColorConfig[0].value).toEqual([0.3, 0.59, 0.11]);
    expect(gray.passes[1].uniforms.BitsConfig[0].value).toBe(1);
    expect([...presetChanges('plainViews', read)!.keys()]).toEqual(['assets/minecraft/post_effect/creeper.json', 'assets/minecraft/post_effect/invert.json']);
  });

  it('stays out of files from another version', () => {
    expect(presetChanges('noFog', () => 'something else')).toBeUndefined();
    expect(presetChanges('fullbright', () => undefined)).toBeUndefined();
    expect(presetChanges('grayCreeper', () => 'not json')).toBeUndefined();
  });
});
