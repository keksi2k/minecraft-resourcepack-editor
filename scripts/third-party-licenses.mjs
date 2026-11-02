// Collects the licence texts of everything the built app ships: every runtime dependency (and
// their dependencies) from node_modules, plus code compiled into them that has no package of its
// own (libogg/libvorbis inside the Ogg Vorbis encoder). Used by package-release.mjs.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** Finds a package the way Node does: in node_modules of `from` or any parent folder. */
function findPackage(name, from) {
  for (let dir = from; ; dir = dirname(dir)) {
    const p = join(dir, 'node_modules', name);
    if (existsSync(join(p, 'package.json'))) return p;
    if (dirname(dir) === dir) return undefined;
  }
}

function licenseText(dir) {
  const file = readdirSync(dir).find((f) => /^(licen[cs]e|copying)(\.|-|$)/i.test(f));
  return file ? readFileSync(join(dir, file), 'utf8').trim() : undefined;
}

// libogg and libvorbis are compiled into wasm-media-encoders' ogg.wasm (BSD-3-Clause, Xiph.Org).
const XIPH = (name, years) => `Copyright (c) ${years} Xiph.Org Foundation

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions
are met:

- Redistributions of source code must retain the above copyright
notice, this list of conditions and the following disclaimer.

- Redistributions in binary form must reproduce the above copyright
notice, this list of conditions and the following disclaimer in the
documentation and/or other materials provided with the distribution.

- Neither the name of the Xiph.org Foundation nor the names of its
contributors may be used to endorse or promote products derived from
this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
\`\`AS IS'' AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
A PARTICULAR PURPOSE ARE DISCLAIMED.  IN NO EVENT SHALL THE FOUNDATION
OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.`;

const EMBEDDED = {
  'wasm-media-encoders': [
    { name: 'libogg', license: 'BSD-3-Clause', text: XIPH('libogg', '2002') },
    { name: 'libvorbis', license: 'BSD-3-Clause', text: XIPH('libvorbis', '2002-2020') },
  ],
};

const MIT = (holder) => `Copyright (c) ${holder}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

/** Licence text for a package without a licence file: the standard text of its licence. */
function fallbackText(p) {
  if (p.license === 'MIT') return MIT(p.author ? `${p.author} and contributors` : `the ${p.name} authors`);
  if (p.license === 'Apache-2.0')
    return `Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in
compliance with the License. You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under the License is
distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and limitations under the License.`;
  return `Licence: ${p.license}`;
}

/** All runtime packages reachable from the project's `dependencies`, sorted by name. */
export function collectLicenses(root = '.') {
  root = resolve(root);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const found = new Map();
  const missing = [];
  const visit = (name, from) => {
    const dir = findPackage(name, from);
    if (!dir) return missing.push(name);
    const meta = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const key = `${meta.name}@${meta.version}`;
    if (found.has(key)) return;
    const license = typeof meta.license === 'string' ? meta.license : meta.license?.type ?? '(see text)';
    const author = typeof meta.author === 'string' ? meta.author : meta.author?.name;
    // type definitions are only used while compiling and never end up in the app
    if (!meta.name.startsWith('@types/'))
      found.set(key, { name: meta.name, version: meta.version, license, author, homepage: meta.homepage, text: licenseText(dir) });
    for (const dep of Object.keys({ ...meta.dependencies, ...meta.optionalDependencies })) visit(dep, dir);
  };
  for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, root);
  const list = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { list, missing };
}

/** The THIRD_PARTY_LICENSES.txt text. */
export function thirdPartyNotice(appName, root = '.') {
  const { list } = collectLicenses(root);
  const rule = '='.repeat(78);
  const parts = [
    `${appName} includes the following third-party software.\nEach is used under the licence reproduced below.`,
  ];
  for (const p of list) {
    parts.push(`${rule}\n${p.name} ${p.version} (${p.license})${p.homepage ? `\n${p.homepage}` : ''}\n${rule}\n\n${p.text ?? fallbackText(p)}`);
    for (const e of EMBEDDED[p.name] ?? []) {
      parts.push(`${rule}\n${e.name} (${e.license}), compiled into ${p.name}\n${rule}\n\n${e.text}`);
    }
  }
  return parts.join('\n\n\n') + '\n';
}
