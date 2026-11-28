import type { AssetStore } from '../assets/AssetStore';

/**
 * The game's shaders: which files a pack can replace, and turning the game's GLSL 330 (with its
 * `#include <ns:file.glsl>` lines and uniform blocks) into WebGL 2 GLSL, so post effects can be
 * previewed in the browser.
 */

export type ShaderGroup = 'effect' | 'post' | 'core' | 'include';

export interface ShaderFile {
  path: string;
  group: ShaderGroup;
  /** e.g. `minecraft:post/invert` or `minecraft:creeper` (effects) */
  id: string;
}

const GROUPS: [RegExp, ShaderGroup][] = [
  [/^assets\/([^/]+)\/post_effect\/(.+)\.json$/, 'effect'],
  [/^assets\/([^/]+)\/shaders\/(post\/.+)\.(?:fsh|vsh)$/, 'post'],
  [/^assets\/([^/]+)\/shaders\/(core\/.+)\.(?:fsh|vsh)$/, 'core'],
  [/^assets\/([^/]+)\/shaders\/include\/(.+)$/, 'include'],
];

/** Every shader file the pack or the game has, by group, sorted. */
export function shaderFiles(store: AssetStore): ShaderFile[] {
  const out: ShaderFile[] = [];
  for (const path of store.list('assets/')) {
    for (const [re, group] of GROUPS) {
      const m = re.exec(path);
      if (m) out.push({ path, group, id: `${m[1]}:${m[2]}` });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/** The file of a shader id: `minecraft:post/invert` + `fsh`. */
export function shaderPath(id: string, ext: 'fsh' | 'vsh'): string {
  const [ns, path] = id.includes(':') ? id.split(':') : ['minecraft', id];
  return `assets/${ns}/shaders/${path}.${ext}`;
}

export const effectPath = (id: string) => {
  const [ns, path] = id.includes(':') ? id.split(':') : ['minecraft', id];
  return `assets/${ns}/post_effect/${path}.json`;
};

/** Puts the text of `#include <ns:file>` (and the older `#moj_import`) lines in place, once each. */
export function resolveIncludes(src: string, read: (path: string) => string | undefined, seen = new Set<string>()): string {
  return src.replace(/^[ \t]*#(?:include|moj_import)\s*[<"]([^>"]+)[>"].*$/gm, (_, ref: string) => {
    const [ns, file] = ref.includes(':') ? ref.split(':') : ['minecraft', ref];
    const path = `assets/${ns}/shaders/include/${file}`;
    if (seen.has(path)) return '';
    seen.add(path);
    const text = read(path);
    return text === undefined ? `// missing include ${ref}` : resolveIncludes(text, read, seen);
  });
}

/**
 * The game's GLSL 330 as WebGL 2 GLSL ES 3.00: a different version line, no extensions or
 * location qualifiers, uniform blocks as plain uniforms (named blocks as a struct), and
 * `gl_VertexIndex` as `gl_VertexID`.
 */
export function toWebGL(src: string): string {
  let s = src.replace(/^[ \t]*#version.*$/m, '').replace(/^[ \t]*#extension.*$/gm, '');
  s = s.replace(/layout\s*\(\s*location\s*=\s*\d+\s*\)\s*/g, '');
  s = s.replace(/layout\s*\(\s*std140\s*\)\s*uniform\s+(\w+)\s*\{([^}]*)\}\s*(\w+)?\s*;/g, (_, block: string, body: string, instance?: string) =>
    instance ? `struct ${block}_t {${body}};\nuniform ${block}_t ${instance};` : body.replace(/([^;]+;)/g, (d) => `uniform ${d.trim()}\n`),
  );
  s = s.replace(/\bgl_VertexIndex\b/g, 'gl_VertexID');
  return `#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler2D;\n${s}`;
}

/** Words for the editor's highlighting. */
export const GLSL_KEYWORDS = new Set(
  'if else for while do return break continue discard in out inout uniform const struct layout true false void precision highp mediump lowp flat smooth'.split(' '),
);
export const GLSL_TYPES = new Set(
  'float int uint bool vec2 vec3 vec4 ivec2 ivec3 ivec4 uvec2 uvec3 uvec4 bvec2 bvec3 bvec4 mat2 mat3 mat4 mat2x2 mat3x3 mat4x4 sampler2D sampler3D samplerCube isampler2D usampler2D'.split(' '),
);

export type Token = { kind: 'comment' | 'preprocessor' | 'keyword' | 'type' | 'number' | 'string' | 'text'; text: string };

/** Splits GLSL (or JSON) into pieces for colouring; the pieces put together give the text back. */
export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  const re = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(^[ \t]*#[^\n]*)|("(?:[^"\\\n]|\\.)*")|(\b\d+\.?\d*(?:[eE][+-]?\d+)?[fu]?\b|\.\d+(?:[eE][+-]?\d+)?f?\b)|([A-Za-z_]\w*)/gm;
  let last = 0;
  for (let m; (m = re.exec(src)); ) {
    if (m.index > last) out.push({ kind: 'text', text: src.slice(last, m.index) });
    const [text] = m;
    const kind: Token['kind'] = m[1] ? 'comment' : m[2] ? 'preprocessor' : m[3] ? 'string' : m[4] ? 'number' : GLSL_KEYWORDS.has(text) ? 'keyword' : GLSL_TYPES.has(text) ? 'type' : 'text';
    out.push({ kind, text });
    last = m.index + text.length;
  }
  if (last < src.length) out.push({ kind: 'text', text: src.slice(last) });
  return out;
}
