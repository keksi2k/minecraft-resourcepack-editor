import { resolveIncludes, shaderPath, toWebGL } from '../shaders/glsl';

/**
 * Runs a post effect (`post_effect/*.json`: passes of shaders between render targets) in WebGL 2
 * on a picture, the way the game runs it on the screen: what the spectator sees as a creeper,
 * spider or enderman, the menu blur, and so on.
 */

interface UniformJson {
  name: string;
  type: string;
  value: number | number[];
}

interface InputJson {
  sampler_name: string;
  target?: string;
  /** a texture instead of a target, e.g. `minecraft:effect/...` */
  location?: string;
  id?: string;
  bilinear?: boolean;
}

interface PassJson {
  vertex_shader: string;
  fragment_shader: string;
  inputs?: InputJson[];
  output: string;
  uniforms?: Record<string, UniformJson[]>;
}

export interface PostEffectJson {
  targets?: Record<string, unknown> | string[];
  passes?: PassJson[];
}

export interface PostSources {
  /** Text of a pack file (shaders and includes), as the pack has it now. */
  read(path: string): string | undefined;
  /** A texture used as an input, by id. */
  image(id: string): Promise<TexImageSource | undefined>;
}

/** What the game sets in its global uniforms; a fixed moment is enough for a preview. */
const GLOBALS: Record<string, number | number[]> = { MenuBlurRadius: 5, GameTime: 0.25, ScreenSize: [0, 0] };

const COPY_VS = `#version 300 es
out vec2 texCoord;
void main() {
  vec2 uv = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(uv * 2.0 - 1.0, 0.0, 1.0);
  texCoord = uv;
}`;
const COPY_FS = `#version 300 es
precision highp float;
uniform sampler2D InSampler;
in vec2 texCoord;
out vec4 fragColor;
void main() { fragColor = vec4(texture(InSampler, texCoord).rgb, 1.0); }`;

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
}

export class PostEffectError extends Error {}

function compile(gl: WebGL2RenderingContext, vs: string, fs: string, label: string): WebGLProgram {
  const shader = (type: number, src: string, which: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new PostEffectError(`${which}: ${gl.getShaderInfoLog(s)?.trim()}`);
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, shader(gl.VERTEX_SHADER, vs, `${label} (vertex)`));
  gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs, `${label} (fragment)`));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new PostEffectError(`${label}: ${gl.getProgramInfoLog(p)?.trim()}`);
  return p;
}

/** A shader as WebGL source: the pack's file, includes filled in. */
function source(sources: PostSources, id: string, ext: 'vsh' | 'fsh'): string {
  const path = shaderPath(id, ext);
  const text = sources.read(path);
  if (text === undefined) throw new PostEffectError(`${path}: not found`);
  return toWebGL(resolveIncludes(text, sources.read));
}

function setUniform(gl: WebGL2RenderingContext, p: WebGLProgram, name: string, type: string, value: number | number[]) {
  const loc = gl.getUniformLocation(p, name);
  if (!loc) return;
  const v = Array.isArray(value) ? value : [value];
  const t = type.replace(/^minecraft:/, '');
  if (t === 'int') gl.uniform1i(loc, v[0]);
  else if (t === 'vec2' || (t === 'float' && v.length === 2)) gl.uniform2fv(loc, v.slice(0, 2));
  else if (t === 'vec3') gl.uniform3fv(loc, v.slice(0, 3));
  else if (t === 'vec4') gl.uniform4fv(loc, v.slice(0, 4));
  else if (t === 'ivec3') gl.uniform3iv(loc, v.slice(0, 3));
  else if (t === 'matrix4x4' || t === 'mat4') gl.uniformMatrix4fv(loc, false, v.slice(0, 16));
  else gl.uniform1f(loc, v[0]);
}

/** Draws `input` through the effect into `canvas` (its size is the screen size). Throws on shader errors. */
export async function runPostEffect(canvas: HTMLCanvasElement, effect: PostEffectJson, sources: PostSources, input: TexImageSource): Promise<void> {
  const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
  if (!gl) throw new PostEffectError('WebGL 2 is not available');
  const W = canvas.width;
  const H = canvas.height;
  const textures: WebGLTexture[] = [];
  const buffers: WebGLFramebuffer[] = [];
  const programs: WebGLProgram[] = [];
  // targets are set up on a spare texture unit, so the inputs bound for a pass stay bound
  const SPARE = gl.TEXTURE0 + 15;
  const makeTarget = (): Target => {
    const active = gl.getParameter(gl.ACTIVE_TEXTURE) as number;
    gl.activeTexture(SPARE);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // without mipmaps a texture needs a plain filter, else it samples as black
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(active);
    textures.push(tex);
    buffers.push(fbo);
    return { tex, fbo };
  };
  const uploaded = (img: TexImageSource) => {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    textures.push(tex);
    return tex;
  };
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.viewport(0, 0, W, H);
  try {
    const copy = compile(gl, COPY_VS, COPY_FS, 'copy');
    programs.push(copy);
    const targets = new Map<string, Target>();
    const target = (name: string) => {
      let t = targets.get(name);
      if (!t) targets.set(name, (t = makeTarget()));
      return t;
    };
    // the screen starts out as the picture
    const draw = (p: WebGLProgram, out: Target | null) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, out?.fbo ?? null);
      gl.useProgram(p);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const picture = uploaded(input);
    gl.useProgram(copy);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, picture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform1i(gl.getUniformLocation(copy, 'InSampler'), 0);
    draw(copy, target('minecraft:main'));

    const cache = new Map<string, WebGLProgram>();
    for (const pass of effect.passes ?? []) {
      const key = `${pass.vertex_shader}|${pass.fragment_shader}`;
      let p = cache.get(key);
      if (!p) {
        p = compile(gl, source(sources, pass.vertex_shader, 'vsh'), source(sources, pass.fragment_shader, 'fsh'), `${pass.fragment_shader}`);
        cache.set(key, p);
        programs.push(p);
      }
      gl.useProgram(p);
      const inputs = pass.inputs ?? [];
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        gl.activeTexture(gl.TEXTURE0 + i);
        const loc = input.location ?? input.id;
        if (input.target) gl.bindTexture(gl.TEXTURE_2D, target(input.target).tex);
        else if (loc) {
          const img = await sources.image(loc);
          gl.bindTexture(gl.TEXTURE_2D, img ? uploaded(img) : target('__empty').tex);
        }
        const filter = input.bilinear ? gl.LINEAR : gl.NEAREST;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.uniform1i(gl.getUniformLocation(p, `${input.sampler_name}Sampler`), i);
      }
      setUniform(gl, p, 'OutSize', 'vec2', [W, H]);
      setUniform(gl, p, 'InSize', 'vec2', [W, H]);
      for (const [name, value] of Object.entries(GLOBALS)) setUniform(gl, p, name, Array.isArray(value) ? 'vec2' : name === 'MenuBlurRadius' ? 'int' : 'float', name === 'ScreenSize' ? [W, H] : value);
      for (const list of Object.values(pass.uniforms ?? {})) for (const u of Array.isArray(list) ? list : []) setUniform(gl, p, u.name, u.type, u.value);
      // drawn into a fresh target, which then takes the output's name (a pass may read what it writes)
      const out = makeTarget();
      draw(p, out);
      targets.set(pass.output, out);
    }
    gl.useProgram(copy);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, target('minecraft:main').tex);
    gl.uniform1i(gl.getUniformLocation(copy, 'InSampler'), 0);
    draw(copy, null);
  } finally {
    for (const t of textures) gl.deleteTexture(t);
    for (const b of buffers) gl.deleteFramebuffer(b);
    for (const p of programs) gl.deleteProgram(p);
    gl.deleteVertexArray(vao);
  }
}
