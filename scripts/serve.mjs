#!/usr/bin/env node
// Serves the built app (dist/) and proxies /mcres/* to resources.download.minecraft.net,
// which sends no CORS headers and therefore can't be fetched by the browser directly.
// No dependencies – Node 18+ only.
//
//   node scripts/serve.mjs [--port 8080] [--host 127.0.0.1] [--dir dist]

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : process.env[name.toUpperCase()] ?? fallback;
};

const here = fileURLToPath(new URL('.', import.meta.url));
// Works both from the repo (scripts/serve.mjs → ../dist) and from the release zip (serve.mjs next to index.html).
const defaultDir = existsSync(join(here, 'index.html')) ? here : join(here, '..', 'dist');
const root = resolve(opt('dir', defaultDir));
const port = Number(opt('port', 8080));
const host = opt('host', '127.0.0.1');

if (!existsSync(join(root, 'index.html'))) {
  console.error(`Kein Build gefunden in ${root}. Zuerst "npm run build" ausführen.`);
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const HASH_PATH = /^\/mcres\/([0-9a-f]{2})\/([0-9a-f]{40})$/;

async function proxy(req, res, m) {
  if (m[1] !== m[2].slice(0, 2)) return send(res, 400, 'Bad request');
  try {
    const upstream = await fetch(`https://resources.download.minecraft.net/${m[1]}/${m[2]}`);
    if (!upstream.ok) return send(res, upstream.status, `Upstream ${upstream.status}`);
    const body = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(200, {
      'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
      'content-length': body.length,
      // Objects are content-addressed by their hash, so they never change.
      'cache-control': 'public, max-age=31536000, immutable',
    });
    res.end(body);
  } catch (e) {
    send(res, 502, `Proxy-Fehler: ${e.message}`);
  }
}

function send(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function serveFile(req, res) {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = normalize(join(root, url));
  if (!file.startsWith(root + sep) && file !== root) return send(res, 403, 'Forbidden');
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
  const type = TYPES[extname(file)] ?? 'application/octet-stream';
  const immutable = file.includes(`${sep}assets${sep}`);
  res.writeHead(200, { 'content-type': type, 'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' });
  createReadStream(file).pipe(res);
}

createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
  const m = HASH_PATH.exec(req.url.split('?')[0]);
  if (m) return void proxy(req, res, m);
  if (req.url.startsWith('/mcres/')) return send(res, 404, 'Not found');
  serveFile(req, res);
}).listen(port, host, () => {
  console.log(`Resource Pack Editor läuft auf http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
});
