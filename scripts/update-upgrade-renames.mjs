// Regenerates src/pack/upgrade/renames.json: the textures the game moved or renamed between
// releases (the 1.13 flattening, `blocks/` → `block/`, armour → equipment in 1.21.2, mob variants
// in 1.21.5 …), which the pack upgrader applies to old packs.
//
//   node scripts/update-upgrade-renames.mjs
//
// Nothing is guessed: for each pair of consecutive releases, a texture that disappeared and one
// that appeared with exactly the same content (CRC-32 and size, read from the client jars'
// ZIP directories, so only a few hundred KB per version are downloaded) count as a rename.
// Content that is ambiguous (the same image under several names) is skipped.

import { writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

/** Releases where textures changed; each is compared with the one before. */
const VERSIONS = [
  '1.8.9', '1.9.4', '1.10.2', '1.11.2', '1.12.2', '1.13.2', '1.14.4', '1.15.2', '1.16.5', '1.17.1', '1.18.2', '1.19.2',
  '1.19.4', '1.20.1', '1.20.2', '1.20.4', '1.20.6', '1.21.1', '1.21.3', '1.21.4', '1.21.5', '1.21.8', '1.21.10',
  '1.21.11', '26.1.2', '26.2',
];
/** Pack formats of versions whose jar has no version.json with one. */
const OLD_FORMATS = { '1.8.9': 1, '1.9.4': 2, '1.10.2': 2, '1.11.2': 3, '1.12.2': 3, '1.13.2': 4 };

const manifest = await (await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')).json();
const latest = manifest.latest.release;
if (!VERSIONS.includes(latest)) VERSIONS.push(latest);

async function range(url, from, to) {
  const res = await fetch(url, { headers: { Range: `bytes=${from}-${to}` } });
  if (res.status !== 206) throw new Error(`No range request support (${res.status}) for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** The jar's files (path → CRC and size) and its resource pack format, from the ZIP directory alone. */
async function jarIndex(id) {
  const entry = manifest.versions.find((v) => v.id === id);
  if (!entry) throw new Error(`Unknown version ${id}`);
  const version = await (await fetch(entry.url)).json();
  const { url, size } = version.downloads.client;
  const tail = await range(url, Math.max(0, size - 65536), size - 1);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 5, 6]));
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);
  const cd = await range(url, cdOffset, cdOffset + cdSize - 1);
  const files = new Map();
  const all = new Map();
  for (let p = 0; p < cd.length; ) {
    const nameLen = cd.readUInt16LE(p + 28);
    const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
    const info = { crc: cd.readUInt32LE(p + 16), size: cd.readUInt32LE(p + 24), compressed: cd.readUInt32LE(p + 20), method: cd.readUInt16LE(p + 10), offset: cd.readUInt32LE(p + 42) };
    all.set(name, info);
    if (/^assets\/minecraft\/textures\/.+\.png$/.test(name)) files.set(name, info);
    p += 46 + nameLen + cd.readUInt16LE(p + 30) + cd.readUInt16LE(p + 32);
  }
  /** One file of the jar, fetched on its own. */
  const read = async (name) => {
    const f = all.get(name);
    if (!f) return undefined;
    const head = await range(url, f.offset, f.offset + 30 + 1024 + f.compressed);
    const start = 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
    const data = head.subarray(start, start + f.compressed);
    return f.method === 8 ? inflateRawSync(data) : data;
  };
  let format = OLD_FORMATS[id];
  const versionJson = await read('version.json');
  if (versionJson) {
    const pv = JSON.parse(versionJson.toString()).pack_version;
    format = typeof pv === 'number' ? pv : pv?.resource ?? pv?.resource_major ?? format;
  }
  return { id, format, files, read };
}

const key = (f) => `${f.crc}:${f.size}`;

/**
 * 1.13 renamed every block and item texture and retouched some of them in the same go (water,
 * leaves, crops …), so their content doesn't match any more. The layouts stayed, so for this
 * version only, names are matched too: same name in the new folder, `_stage_0` → `_stage0`, two
 * swapped words (`leaves_oak` → `oak_leaves`), or a few known ones. Every target must be a texture
 * that version added.
 */
const FLATTENING = {
  'blocks/leaves_big_oak': 'block/dark_oak_leaves',
  'blocks/farmland_dry': 'block/farmland',
  'blocks/melon_stem_connected': 'block/attached_melon_stem',
  'blocks/melon_stem_disconnected': 'block/melon_stem',
  'blocks/pumpkin_stem_connected': 'block/attached_pumpkin_stem',
  'blocks/pumpkin_stem_disconnected': 'block/pumpkin_stem',
  'blocks/noteblock': 'block/note_block',
  'blocks/observer_back_lit': 'block/observer_back_on',
  'blocks/shulker_top_purple': 'block/shulker_box',
  'entity/bed/silver': 'entity/bed/light_gray',
  'items/fish_cod_raw': 'item/cod',
  'items/fish_cod_cooked': 'item/cooked_cod',
  'items/fish_salmon_raw': 'item/salmon',
  'items/fish_salmon_cooked': 'item/cooked_salmon',
  'items/fish_clownfish_raw': 'item/tropical_fish',
  'items/fish_pufferfish_raw': 'item/pufferfish',
  'items/potion_bottle_drinkable': 'item/potion',
  'items/potion_bottle_empty': 'item/glass_bottle',
};

function flatteningByName(removed, added, matched) {
  const T = 'assets/minecraft/textures/';
  const fresh = new Set(added.map(([p]) => p));
  const taken = new Set(matched.flat());
  const out = [];
  for (const [path] of removed) {
    if (taken.has(path)) continue;
    const id = path.slice(T.length, -4);
    const moved = id.replace(/^blocks\//, 'block/').replace(/^items\//, 'item/');
    const name = moved.slice(moved.indexOf('/') + 1);
    const dir = moved.slice(0, moved.indexOf('/') + 1);
    const swapped = /^[a-z]+_[a-z]+$/.test(name) ? `${dir}${name.split('_').reverse().join('_')}` : undefined;
    const candidates = [FLATTENING[id], moved, moved.replace(/_(\d+)$/, '$1'), swapped].filter(Boolean);
    const to = candidates.map((c) => `${T}${c}.png`).find((c) => fresh.has(c) && !taken.has(c));
    if (FLATTENING[id] && !fresh.has(`${T}${FLATTENING[id]}.png`)) throw new Error(`${FLATTENING[id]} is not a texture 1.13 added`);
    if (to) {
      out.push([path, to]);
      taken.add(to);
    }
  }
  return out;
}
const steps = [];
const jars = new Map();
let prev = await jarIndex(VERSIONS[0]);
jars.set(prev.id, prev);
for (const id of VERSIONS.slice(1)) {
  const next = await jarIndex(id);
  jars.set(id, next);
  const removed = [...prev.files].filter(([p]) => !next.files.has(p));
  const added = [...next.files].filter(([p]) => !prev.files.has(p));
  // content → paths, on both sides; only one-to-one matches count
  const byContent = (list) => {
    const m = new Map();
    for (const [p, f] of list) m.set(key(f), [...(m.get(key(f)) ?? []), p]);
    return m;
  };
  const gone = byContent(removed);
  const fresh = byContent(added);
  // the same content elsewhere in the old jar too means it is a shared image, not a move
  const oldAll = byContent([...prev.files]);
  const renames = [];
  for (const [k, from] of gone) {
    const to = fresh.get(k);
    if (from.length === 1 && to?.length === 1 && oldAll.get(k).length === 1) renames.push([from[0], to[0]]);
  }
  if (id === '1.13.2') renames.push(...flatteningByName(removed, added, renames));
  renames.sort((a, b) => a[0].localeCompare(b[0]));
  console.log(`${prev.id} → ${id} (format ${next.format}): ${removed.length} removed, ${added.length} added, ${renames.length} renames`);
  // what disappeared without a match: its layout changed (or it was cut up, see the slicer) and it
  // has to be redrawn; the upgrader points such files out
  const moved = new Set(renames.map((r) => r[0]));
  const dropped = removed.map(([p]) => p).filter((p) => !moved.has(p));
  const id_ = (p) => p.slice('assets/minecraft/textures/'.length, -4);
  if (renames.length || dropped.length) steps.push({ version: id, format: next.format, renames: renames.map(([a, b]) => [id_(a), id_(b)]), dropped: dropped.map(id_).sort() });
  prev = next;
}

/**
 * 1.13 also renamed every translation key (`tile.stone.name` → `block.minecraft.stone`). Keys whose
 * English text is the same and unique on both sides are the same entry; later renames of the new
 * keys (`block.minecraft.grass` → `…short_grass`) are followed the same way.
 */
async function langKeys() {
  const lang = (text) =>
    Object.fromEntries(
      text
        .split(/\r?\n/)
        .filter((l) => l.includes('=') && !l.startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    );
  const unique = (o) => {
    const count = new Map();
    for (const v of Object.values(o)) count.set(v, (count.get(v) ?? 0) + 1);
    return new Map(Object.entries(o).filter(([, v]) => count.get(v) === 1).map(([k, v]) => [v, k]));
  };
  const old = lang((await jars.get('1.12.2').read('assets/minecraft/lang/en_us.lang')).toString('utf8'));
  const flat = JSON.parse((await jars.get('1.13.2').read('assets/minecraft/lang/en_us.json')).toString('utf8'));
  const now = JSON.parse((await jars.get(latest).read('assets/minecraft/lang/en_us.json')).toString('utf8'));
  const oldByText = unique(old);
  const flatByText = unique(flat);
  const nowByText = unique(now);
  const out = {};
  for (const [k, v] of Object.entries(old)) {
    let to = flat[k] !== undefined ? k : oldByText.get(v) === k ? flatByText.get(v) : undefined;
    if (to && now[to] === undefined) to = nowByText.get(flat[to]);
    if (to && to !== k) out[k] = to;
  }
  return out;
}
const langMap = await langKeys();
console.log(`Translation keys: ${Object.keys(langMap).length} renamed`);

writeFileSync(
  'src/pack/upgrade/renames.json',
  `${JSON.stringify({ note: 'Generated by scripts/update-upgrade-renames.mjs; texture ids without textures/ and .png', steps, langKeys: langMap })}\n`,
);
console.log('Wrote src/pack/upgrade/renames.json');
