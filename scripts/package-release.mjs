// Bundles the built app with the standalone server into release/<name>-<version>.zip.
// Run via `npm run package` (builds first).

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import JSZip from 'jszip';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const folder = `${pkg.name}-${pkg.version}`;
const zip = new JSZip();
const dir = zip.folder(folder);

function addDir(src, target) {
  for (const name of readdirSync(src)) {
    const p = join(src, name);
    if (statSync(p).isDirectory()) addDir(p, target.folder(name));
    else target.file(name, readFileSync(p));
  }
}

addDir('dist', dir);
dir.file('serve.mjs', readFileSync('scripts/serve.mjs'));
dir.file('LICENSE', readFileSync('LICENSE'));
dir.file(
  'START.txt',
  `Minecraft Resource Pack Editor ${pkg.version}

Voraussetzung: Node.js 18.18 oder neuer (https://nodejs.org)

Starten:
  1. Dieses ZIP entpacken.
  2. Im entpackten Ordner ein Terminal öffnen.
  3. node serve.mjs
  4. Im Browser http://127.0.0.1:8080 öffnen.

Anderer Port:  node serve.mjs --port 3000
Im Netzwerk erreichbar:  node serve.mjs --host 0.0.0.0

Ausführliche Anleitung: ${pkg.repository.url.replace(/\.git$/, '')}/blob/main/docs/INSTALLATION.md
`,
);

mkdirSync('release', { recursive: true });
const out = join('release', `${folder}.zip`);
writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(`${relative('.', out)} (${(statSync(out).size / 1024).toFixed(0)} KB)`);
