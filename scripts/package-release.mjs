// Bundles the built app with the standalone server into release/<name>-<version>.zip.
// Run via `npm run package` (builds first).

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import JSZip from 'jszip';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const folder = `${pkg.name}-${pkg.version}`;
const repo = pkg.repository.url.replace(/\.git$/, '');
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
dir.file('Start.bat', readFileSync('Start.bat'));
dir.file('LICENSE', readFileSync('LICENSE'));
dir.file(
  'START.txt',
  `Minecraft Resource Pack Editor ${pkg.version}

Requirement: Node.js 18.18 or newer (https://nodejs.org)

Windows:
  Double-click Start.bat (opens the browser automatically).
  Other port: Start.bat 3000

macOS/Linux (or manually on Windows):
  1. Extract this ZIP.
  2. Open a terminal in the extracted folder.
  3. node serve.mjs
  4. Open http://127.0.0.1:8080 in your browser.

Other port:           node serve.mjs --port 3000
Reachable on the LAN: node serve.mjs --host 0.0.0.0

Full guide: ${repo}/blob/main/docs/INSTALLATION.md
Deutsch:    ${repo}/blob/main/docs/INSTALLATION.de.md
`,
);

mkdirSync('release', { recursive: true });
const out = join('release', `${folder}.zip`);
writeFileSync(out, await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
console.log(`${relative('.', out)} (${(statSync(out).size / 1024).toFixed(0)} KB)`);
