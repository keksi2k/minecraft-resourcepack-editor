// Downloads a Minecraft version's client.jar and its platform-independent libraries into .mc/<version>/,
// as needed by scripts/DumpEntityModels.java. Everything comes from Mojang's official servers.
//
//   node scripts/fetch-minecraft.mjs            -> latest release
//   node scripts/fetch-minecraft.mjs 26.3

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const manifest = await (await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')).json();
const id = process.argv[2] ?? manifest.latest.release;
const entry = manifest.versions.find((v) => v.id === id);
if (!entry) {
  console.error(`Unknown version "${id}". Latest release: ${manifest.latest.release}`);
  process.exit(1);
}
const version = await (await fetch(entry.url)).json();
const dir = join('.mc', id);
const libDir = join(dir, 'libs');
mkdirSync(libDir, { recursive: true });

async function download(url, sha1, target) {
  if (existsSync(target) && createHash('sha1').update(readFileSync(target)).digest('hex') === sha1) return;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (createHash('sha1').update(buf).digest('hex') !== sha1) throw new Error(`Checksum mismatch: ${url}`);
  writeFileSync(target, buf);
}

const client = version.downloads.client;
console.log(`client.jar ${id} (${(client.size / 1048576).toFixed(1)} MB) …`);
await download(client.url, client.sha1, join(dir, 'client.jar'));

// Natives (rules) and LWJGL aren't needed to build model geometry.
const libs = version.libraries.filter((l) => l.downloads?.artifact && !l.rules && !l.name.startsWith('org.lwjgl'));
let n = 0;
for (const l of libs) {
  const a = l.downloads.artifact;
  await download(a.url, a.sha1, join(libDir, basename(a.path)));
  process.stdout.write(`\rLibraries ${++n}/${libs.length}`);
}
console.log(`\nDone: ${dir}`);
console.log(`Exporting mob models needs Java ${version.javaVersion?.majorVersion ?? '?'} or newer.`);
