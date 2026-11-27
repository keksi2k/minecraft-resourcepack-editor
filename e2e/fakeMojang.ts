import type { Page } from '@playwright/test';
import JSZip from 'jszip';
import { deflateSync } from 'node:zlib';

/**
 * A tiny stand-in for Mojang's servers: a version list with one release whose client.jar holds a
 * handful of textures and models. The tests then run in seconds, offline, without the 40 MB jar.
 */

export const VERSION = 'e2e-1.0';
const FORMAT = 97;
const BASE = 'https://piston-meta.mojang.com';
const JAR = 'https://piston-data.mojang.com/v1/objects/e2e/client.jar';

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c >>> 0;
}

/** A solid-colour RGBA PNG. */
export function png(size: number, [r, g, b]: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: size }, () => [r, g, b, 255]).flat())]);
  const raw = Buffer.concat(Array.from({ length: size }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const json = (v: unknown) => JSON.stringify(v);

async function clientJar(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('version.json', json({ id: VERSION, pack_version: { resource: FORMAT, data: FORMAT } }));
  const a = 'assets/minecraft/';
  zip.file(`${a}lang/en_us.json`, json({ 'block.minecraft.stone': 'Stone', 'block.minecraft.dirt': 'Dirt', 'item.minecraft.apple': 'Apple', 'container.inventory': 'Inventory' }));
  zip.file(`${a}models/block/block.json`, json({ display: { gui: { rotation: [30, 225, 0], scale: [0.625, 0.625, 0.625] } } }));
  zip.file(
    `${a}models/block/cube_all.json`,
    json({
      parent: 'block/block',
      textures: { particle: '#all' },
      elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: Object.fromEntries(['down', 'up', 'north', 'south', 'west', 'east'].map((d) => [d, { texture: '#all' }])) }],
    }),
  );
  zip.file(`${a}models/item/generated.json`, json({}));
  for (const [name, color] of [['stone', [128, 128, 128]], ['dirt', [120, 80, 40]]] as const) {
    zip.file(`${a}models/block/${name}.json`, json({ parent: 'block/cube_all', textures: { all: `block/${name}` } }));
    zip.file(`${a}blockstates/${name}.json`, json({ variants: { '': { model: `block/${name}` } } }));
    zip.file(`${a}items/${name}.json`, json({ model: { type: 'minecraft:model', model: `block/${name}` } }));
    zip.file(`${a}textures/block/${name}.png`, png(16, color as [number, number, number]));
  }
  zip.file(`${a}models/item/apple.json`, json({ parent: 'item/generated', textures: { layer0: 'item/apple' } }));
  zip.file(`${a}items/apple.json`, json({ model: { type: 'minecraft:model', model: 'item/apple' } }));
  zip.file(`${a}textures/item/apple.png`, png(16, [220, 30, 30]));
  zip.file(`${a}texts/splashes.txt`, 'Tested!\n');
  // what the pack upgrade test's old pack turns into
  zip.file(`${a}textures/block/white_wool.png`, png(16, [240, 240, 240]));
  zip.file(`${a}textures/gui/sprites/widget/button.png`, png(16, [100, 100, 100]));
  return zip.generateAsync({ type: 'nodebuffer' });
}

let jar: Promise<Buffer> | undefined;

/** Answers the app's requests to Mojang (and GitHub) with the fake release. */
export async function fakeMojang(page: Page) {
  jar ??= clientJar();
  const bytes = await jar;
  await page.route(`${BASE}/mc/game/version_manifest_v2.json`, (r) =>
    r.fulfill({ contentType: 'application/json', body: json({ latest: { release: VERSION, snapshot: VERSION }, versions: [{ id: VERSION, type: 'release', url: `${BASE}/v1/packages/e2e/${VERSION}.json`, releaseTime: '2026-01-01T00:00:00+00:00' }] }) }),
  );
  await page.route(`${BASE}/v1/packages/e2e/${VERSION}.json`, (r) =>
    r.fulfill({ contentType: 'application/json', body: json({ id: VERSION, assetIndex: { id: 'e2e', url: `${BASE}/v1/packages/e2e/index.json` }, downloads: { client: { url: JAR, size: bytes.length, sha1: '' } } }) }),
  );
  await page.route(`${BASE}/v1/packages/e2e/index.json`, (r) => r.fulfill({ contentType: 'application/json', body: json({ objects: {} }) }));
  await page.route(JAR, (r) => r.fulfill({ contentType: 'application/java-archive', body: bytes }));
  await page.route('https://api.github.com/**', (r) => r.fulfill({ status: 404, body: '' }));
}

/** A pack for Minecraft 1.12 (format 3): textures in the old folders, the old combined widgets.png. */
export async function oldPack(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('pack.mcmeta', json({ pack: { pack_format: 3, description: 'Old pack' } }));
  zip.file('assets/minecraft/textures/blocks/wool_colored_white.png', png(16, [200, 30, 30]));
  zip.file('assets/minecraft/textures/gui/widgets.png', png(256, [30, 30, 200]));
  return zip.generateAsync({ type: 'nodebuffer' });
}

/** A resource pack ZIP replacing the stone texture. */
export async function samplePack(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('pack.mcmeta', json({ pack: { pack_format: FORMAT, description: 'E2E pack' } }));
  zip.file('assets/minecraft/textures/block/stone.png', png(16, [40, 90, 200]));
  return zip.generateAsync({ type: 'nodebuffer' });
}
