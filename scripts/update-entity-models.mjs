// Regenerates src/entities/entityModels.json from a Minecraft version fetched with fetch-minecraft.mjs.
//
//   node scripts/update-entity-models.mjs 26.3                    -> refresh all layers already in the file
//   node scripts/update-entity-models.mjs 26.3 --list             -> list every layer the game defines
//   node scripts/update-entity-models.mjs 26.3 minecraft:goat#main -> add layers (keeps existing ones)

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const [id, ...rest] = process.argv.slice(2);
if (!id) {
  console.error('Version angeben, z. B.: node scripts/update-entity-models.mjs 26.3');
  process.exit(1);
}
const dir = join('.mc', id);
if (!existsSync(join(dir, 'client.jar'))) {
  console.error(`${dir}/client.jar fehlt – zuerst: node scripts/fetch-minecraft.mjs ${id}`);
  process.exit(1);
}

const out = 'src/entities/entityModels.json';
const cp = [join(dir, 'client.jar'), join(dir, 'libs', '*')].join(delimiter);
let args;
if (rest[0] === '--list') args = [];
else if (rest.length === 0) args = ['--refresh', out];
else {
  const existing = Object.keys(JSON.parse(readFileSync(out, 'utf8')));
  args = [out, ...new Set([...existing, ...rest])];
}

const r = spawnSync('java', ['-cp', cp, 'scripts/DumpEntityModels.java', ...args], { stdio: 'inherit' });
rmSync('logs', { recursive: true, force: true }); // log4j output of the game code
if (r.error) console.error('Java nicht gefunden – JDK installieren (siehe docs/INSTALLATION.md).');
process.exit(r.status ?? 1);
