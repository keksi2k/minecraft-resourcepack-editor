/**
 * Minimal GIF codec (no canvas needed, so it runs in tests): decodes animated GIFs into full RGBA
 * frames, and encodes RGBA frames into a looping animated GIF.
 */

export interface GifFrame {
  /** RGBA pixels of the whole image (width × height), after compositing. */
  pixels: Uint8ClampedArray;
  /** How long the frame shows, in milliseconds. */
  delayMs: number;
}

export interface Gif {
  width: number;
  height: number;
  frames: GifFrame[];
}

export const isGif = (b: Uint8Array) => b.length > 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;

function lzwDecode(data: Uint8Array, minSize: number, count: number): Uint8Array {
  const out = new Uint8Array(count);
  const clear = 1 << minSize;
  const eoi = clear + 1;
  const prefix = new Int16Array(4096);
  const suffix = new Uint8Array(4096);
  for (let i = 0; i < clear; i++) suffix[i] = i;
  const stack = new Uint8Array(4097);
  let size = minSize + 1;
  let mask = (1 << size) - 1;
  let next = eoi + 1;
  let prev = -1;
  let first = 0;
  let op = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < data.length && op < count; i++) {
    acc |= data[i] << bits;
    bits += 8;
    while (bits >= size && op < count) {
      const code = acc & mask;
      acc >>>= size;
      bits -= size;
      if (code === clear) {
        size = minSize + 1;
        mask = (1 << size) - 1;
        next = eoi + 1;
        prev = -1;
        continue;
      }
      if (code === eoi) return out;
      if (prev === -1) {
        if (code >= clear) continue; // corrupt: first code after clear must be a literal
        out[op++] = code;
        first = code;
        prev = code;
        continue;
      }
      let sp = 0;
      let c = code;
      if (code >= next) {
        stack[sp++] = first;
        c = prev;
      }
      while (c > eoi) {
        stack[sp++] = suffix[c];
        c = prefix[c];
      }
      stack[sp++] = c;
      first = c;
      while (sp > 0 && op < count) out[op++] = stack[--sp];
      if (next < 4096) {
        prefix[next] = prev;
        suffix[next] = first;
        next++;
        if (next === mask + 1 && size < 12) {
          size++;
          mask = (1 << size) - 1;
        }
      }
      prev = code;
    }
  }
  return out;
}

export function decodeGif(bytes: Uint8Array): Gif {
  if (!isGif(bytes)) throw new Error('Not a GIF file');
  let pos = 6;
  const u16 = () => {
    const v = bytes[pos] | (bytes[pos + 1] << 8);
    pos += 2;
    return v;
  };
  const width = u16();
  const height = u16();
  const flags = bytes[pos];
  pos += 3; // flags, background, aspect
  const readTable = (n: number) => {
    const t = bytes.subarray(pos, pos + n * 3);
    pos += n * 3;
    return t;
  };
  const global = flags & 0x80 ? readTable(2 << (flags & 7)) : undefined;
  const subBlocks = () => {
    const parts: Uint8Array[] = [];
    let len = 0;
    while (pos < bytes.length) {
      const n = bytes[pos++];
      if (!n) break;
      parts.push(bytes.subarray(pos, pos + n));
      len += n;
      pos += n;
    }
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts) out.set(p, (o += p.length) - p.length);
    return out;
  };

  let canvas = new Uint8ClampedArray(width * height * 4);
  const frames: GifFrame[] = [];
  let gce = { disposal: 0, delayMs: 0, transparent: -1 };
  while (pos < bytes.length) {
    const block = bytes[pos++];
    if (block === 0x21) {
      const label = bytes[pos++];
      if (label === 0xf9) {
        const data = subBlocks();
        gce = { disposal: (data[0] >> 2) & 7, delayMs: (data[1] | (data[2] << 8)) * 10, transparent: data[0] & 1 ? data[3] : -1 };
      } else subBlocks();
    } else if (block === 0x2c) {
      const ix = u16();
      const iy = u16();
      const iw = u16();
      const ih = u16();
      const packed = bytes[pos++];
      const table = packed & 0x80 ? readTable(2 << (packed & 7)) : global;
      const interlaced = (packed & 0x40) !== 0;
      const minSize = bytes[pos++];
      const indices = lzwDecode(subBlocks(), minSize, iw * ih);
      const saved = gce.disposal === 3 ? canvas.slice() : undefined;
      const rows = interlaced ? interlaceRows(ih) : undefined;
      for (let r = 0; r < ih; r++) {
        const y = iy + (rows ? rows[r] : r);
        if (y >= height) continue;
        for (let x = 0; x < iw; x++) {
          const k = indices[r * iw + x];
          if (k === gce.transparent || !table || k * 3 >= table.length || ix + x >= width) continue;
          const o = (y * width + ix + x) * 4;
          canvas[o] = table[k * 3];
          canvas[o + 1] = table[k * 3 + 1];
          canvas[o + 2] = table[k * 3 + 2];
          canvas[o + 3] = 255;
        }
      }
      frames.push({ pixels: canvas.slice(), delayMs: gce.delayMs });
      if (gce.disposal === 2) {
        for (let y = iy; y < Math.min(height, iy + ih); y++) canvas.fill(0, (y * width + ix) * 4, (y * width + Math.min(width, ix + iw)) * 4);
      } else if (saved) canvas = saved;
      gce = { disposal: 0, delayMs: 0, transparent: -1 };
    } else break; // 0x3b trailer, or garbage
  }
  return { width, height, frames };
}

/** Row order of an interlaced image: the r-th stored row is image row rows[r]. */
function interlaceRows(h: number): number[] {
  const rows: number[] = [];
  for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = start; y < h; y += step) rows.push(y);
  return rows;
}

/**
 * A palette of at most 256 entries for all frames. Pixels with alpha < 128 become transparent
 * (index 0); if there are too many colours, channels lose precision until they fit.
 */
function buildPalette(frames: Uint8ClampedArray[]) {
  let transparent = false;
  for (const f of frames) for (let i = 3; i < f.length && !transparent; i += 4) if (f[i] < 128) transparent = true;
  const max = transparent ? 255 : 256;
  let shift = 0;
  let buckets = new Map<number, number[]>();
  for (; shift < 8; shift++) {
    buckets = new Map();
    let ok = true;
    for (const f of frames) {
      for (let i = 0; i < f.length && ok; i += 4) {
        if (f[i + 3] < 128) continue;
        const key = ((f[i] >> shift) << 16) | ((f[i + 1] >> shift) << 8) | (f[i + 2] >> shift);
        let b = buckets.get(key);
        if (!b) {
          if (buckets.size >= max) ok = false;
          else buckets.set(key, (b = [0, 0, 0, 0]));
        }
        if (b) {
          b[0] += f[i];
          b[1] += f[i + 1];
          b[2] += f[i + 2];
          b[3]++;
        }
      }
      if (!ok) break;
    }
    if (ok) break;
  }
  const colors: [number, number, number][] = transparent ? [[0, 0, 0]] : [];
  const index = new Map<number, number>();
  for (const [key, [r, g, b, n]] of buckets) {
    index.set(key, colors.length);
    colors.push([Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
  }
  if (!colors.length) colors.push([0, 0, 0]);
  const lookup = (f: Uint8ClampedArray, i: number) =>
    f[i + 3] < 128 ? 0 : index.get(((f[i] >> shift) << 16) | ((f[i + 1] >> shift) << 8) | (f[i + 2] >> shift))!;
  return { colors, transparent, lookup };
}

function lzwEncode(indices: Uint8Array, minSize: number): Uint8Array {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  const clear = 1 << minSize;
  const eoi = clear + 1;
  let size = minSize + 1;
  let next = eoi + 1;
  const dict = new Map<number, number>();
  const write = (code: number) => {
    acc |= code << bits;
    bits += size;
    while (bits >= 8) {
      out.push(acc & 255);
      acc >>>= 8;
      bits -= 8;
    }
  };
  write(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const hit = dict.get(key);
    if (hit !== undefined) {
      prefix = hit;
      continue;
    }
    write(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > 1 << size && size < 12) size++;
    } else {
      write(clear);
      dict.clear();
      size = minSize + 1;
      next = eoi + 1;
    }
    prefix = k;
  }
  write(prefix);
  write(eoi);
  if (bits > 0) out.push(acc & 255);
  return Uint8Array.from(out);
}

/** Encodes same-sized RGBA frames as an endlessly looping GIF. `delayCs` is in hundredths of a second. */
export function encodeGif(width: number, height: number, frames: { pixels: Uint8ClampedArray; delayCs: number }[]): Uint8Array {
  const { colors, transparent, lookup } = buildPalette(frames.map((f) => f.pixels));
  const tableBits = Math.max(1, Math.ceil(Math.log2(colors.length)));
  const minSize = Math.max(2, tableBits);
  const out: number[] = [];
  const u16 = (v: number) => out.push(v & 255, (v >> 8) & 255);
  out.push(...[...'GIF89a'].map((c) => c.charCodeAt(0)));
  u16(width);
  u16(height);
  out.push(0x80 | 0x70 | (tableBits - 1), 0, 0);
  for (let i = 0; i < 1 << tableBits; i++) out.push(...(colors[i] ?? [0, 0, 0]));
  // NETSCAPE2.0: loop forever
  out.push(0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map((c) => c.charCodeAt(0)), 3, 1, 0, 0, 0);
  for (const f of frames) {
    // disposal 2 clears each frame, so transparent pixels don't show the previous one
    out.push(0x21, 0xf9, 4, (2 << 2) | (transparent ? 1 : 0));
    u16(Math.max(2, Math.round(f.delayCs)));
    out.push(0, 0);
    out.push(0x2c);
    u16(0);
    u16(0);
    u16(width);
    u16(height);
    out.push(0, minSize);
    const indices = new Uint8Array(width * height);
    for (let i = 0; i < indices.length; i++) indices[i] = lookup(f.pixels, i * 4);
    const data = lzwEncode(indices, minSize);
    for (let i = 0; i < data.length; i += 255) {
      const n = Math.min(255, data.length - i);
      out.push(n);
      for (let k = 0; k < n; k++) out.push(data[i + k]);
    }
    out.push(0);
  }
  out.push(0x3b);
  return Uint8Array.from(out);
}
