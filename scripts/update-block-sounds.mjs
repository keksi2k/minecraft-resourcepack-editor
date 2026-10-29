// Regenerates src/sounds/blockSounds.json (which sounds each block plays) from a Minecraft version
// fetched with fetch-minecraft.mjs.
//
//   node scripts/update-block-sounds.mjs 26.3

import { spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { delimiter, join } from 'node:path';

const id = process.argv[2];
if (!id) {
  console.error('Pass a version, e.g.: node scripts/update-block-sounds.mjs 26.3');
  process.exit(1);
}
const dir = join('.mc', id);
if (!existsSync(join(dir, 'client.jar'))) {
  console.error(`${dir}/client.jar is missing – run first: node scripts/fetch-minecraft.mjs ${id}`);
  process.exit(1);
}

const cp = [join(dir, 'client.jar'), join(dir, 'libs', '*')].join(delimiter);
const r = spawnSync('java', ['-cp', cp, 'scripts/DumpBlockSounds.java', 'src/sounds/blockSounds.json'], { stdio: 'inherit' });
rmSync('logs', { recursive: true, force: true }); // log4j output of the game code
if (r.error) console.error('Java not found – install a JDK (see docs/INSTALLATION.md).');
process.exit(r.status ?? 1);
