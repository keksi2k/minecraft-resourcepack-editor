# Minecraft Resource Pack Editor

[![CI](https://github.com/keksi2k/minecraft-resourcepack-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/keksi2k/minecraft-resourcepack-editor/actions/workflows/ci.yml)

**English** · [Deutsch](README.de.md)

A browser-based editor for **Minecraft Java Edition resource packs**. Load a pack, view every item and mob in 3D, listen to sounds, download, replace or **edit textures and sounds right in the browser**, record your own sounds, and export the pack as a ZIP again.

## Highlights

| | |
|---|---|
| 🧊 **See everything in 3D** | Every item, block, plant and mob with your pack's textures – animated, from every angle, in all their variants. |
| 🎨 **Paint right in the browser** | A pixel editor with layers, selections, Lospec palettes and colour replacing across the whole pack. The 3D model updates with every stroke. |
| 🧍 **Your player, fully equipped** | Any skin, armour, elytra, a cape and items in both hands, placed like in the game. |
| 🧱 **Block states and models** | Edit multipart fences and walls with clickable conditions, and shape cuboid models in a live 3D view. |
| ✨ **Shaders, live** | Edit post effects and watch the creeper, spider and enderman views change as you type. |
| 🖼️ **Your pack where players see it** | Title screen, HUD and inventories, tooltips, maps, fonts, paintings, particles and a block sandbox with light levels. |
| 🔊 **Sounds** | Listen to every sound, record your own, cut, tune and replace them. |
| 🛠️ **Pack tools** | Upgrade packs from 1.8 onwards in one step, stack several packs, shrink them, check them for problems, export a ZIP. |
| 🔒 **Private by design** | Everything happens in your browser: no account, no upload. |

**New in 1.22:** layers, selections and palettes in the texture editor, the player preview, block state and model editors, live shaders, tooltips, maps and the enchantment glint. [See the release →](https://github.com/keksi2k/minecraft-resourcepack-editor/releases/latest)

## Features

- **Every item** (~1650 in 26.3) with an inventory-style render: blocks isometric, flat items as sprites, tints (leaves, grass, potions …) like in game. Chests, shulker boxes, banners, shields, heads, beds, decorated pots, conduits, tridents and copper golem statues are drawn with their real models too, and animated textures (water, lava, fire, portals …) play in the grid, the 3D viewer and the texture preview.
- **3D viewer** for each item, orbitable, with the game's display contexts (inventory, 1st/3rd person hand, ground, item frame, head). Renders can be downloaded as PNG.
- **Pattern preview** for banners and shields (pattern layers and colours) and pottery sherds for decorated pots, so you can check your pattern textures on the real model.
- **All plants, with their growth stages**: crops, stems, cocoa, berry bushes, cave vines, bamboo, pink petals, sea pickles and pitcher plants, and also flowers, saplings, grass, mushrooms, sugar cane, kelp, cacti, vines and dripleaves, in 3D as they stand in the world. All stages side by side, played as a growth animation, and every texture of the block can be edited right there.
- **Item states**: preview what an item looks like in use, pulled, loaded, broken, at another compass angle or time of day, with another trim and so on. Every switch in the item definition can be set, and the textures of that state can be replaced right there. **All stages** shows every look side by side (bow pulling, all 64 clock times, compass angles …) and can play them in turn.
- **All 91 mobs in 3D, 281 entries with their colour and biome variants and 94 babies** (from creeper and axolotl to warden and ender dragon) using the real vanilla models, **animated** (looking around, walking) and with their **equipment**: armour of every material, horse, wolf and nautilus armour, saddles, llama carpets, happy ghast harnesses, collars, horse markings, villager biomes, professions and levels, charged creepers and mooshroom mushrooms – drawn with your pack's textures, which can be edited right there. Plus a **UV overlay** that shows which part of the texture belongs to the head, body, legs and so on, and a **UV template** to download (coloured faces shaded like in the game, or outlines over the texture) – for mobs and for block and item models. Click the mob to mark the exact texture pixel at that spot.
- **Player preview**: the player with any of the game's default skins (or the pack's, or a skin picture of your own), armour, an **elytra**, a **cape** you load, and **items in both hands** placed like in the game (they follow the arms when walking). Shows your armour, elytra and item textures where players see them.
- **Texture browser** for all ~4000 textures (blocks, items, entities, GUI …).
- **Texture settings (.mcmeta)** without writing JSON: animation speed, smooth blending, own frame order and durations, adding or removing frames, GUI sprite scaling (stretch, tile, nine-slice), villager hats and blur/clamp. Each texture shows only the settings Minecraft reads for it; anything else can be edited as text. On export, a replaced animated texture keeps its animation. **Import frames** from several images (one per frame) or an animated GIF, timing included, and **download any animation as a GIF**.
- **Texture editor**: pencil, eraser, fill, colour picker, line and rectangle, the texture's own palette, **layers** (visibility, opacity, merge; saving merges them), a **selection** to paint inside, move, copy and paste (also images from other programs, as a new layer), mirror/flip/rotate, wrap-around move for seamless blocks, hue/saturation/lightness, grayscale and invert, with undo. The 3D model and the item or mob details stay open next to it and show every stroke live. Animated textures get a **frame strip**: thumbnails, add, duplicate, move and delete frames, onion skin (the previous frame shows faintly) and playback; transform and colour tools work on the current frame.
- **Palettes and colour replacing**: load palettes from [Lospec](https://lospec.com/palette-list) by name or link, or import .hex, .gpl, .pal, .txt or PNG palette files; pick from them and snap a texture to the nearest palette colours. Replace one colour with another (shading close to it moves along) in the texture, its folder or all of the pack's textures at once, as one batch you can undo.
- **Textures by name** (1.21.5+): rename an item in an anvil and it shows its own texture. Add names with an image in the item details; the item definition is written for you.
- **Random block variants**: give a block several models (own images or turned copies) with weights, so large areas don't look tiled.
- **Texts**: edit the pack description with colours and formatting (live preview like in the pack list), set the pack format, edit the title screen's splash texts, and change any game text (item and block names, menus) in any language; only your changes go into the pack.
- **Progress**: how many of the game's textures your pack replaces, per folder, which ones still stick out next to your style, and which textures are new since an older Minecraft version.
- **Change many textures at once**: pick textures (or a whole folder) and shift their colours, make them grayscale or inverted, or scale them up ×2/×4/×8 without blurring (e.g. 16× to 32×). One click undoes the whole batch.
- **Sound editor**: waveform with selection and zoom; cut, crop, insert silence, trim silence, fade in/out, reverse, make mono; gain, compressor, normalise; **pitch** (semitones, same length), **tempo** (same pitch) and record-style speed; bass, treble, low-pass and high-pass; reverb, echo and distortion. Every effect can be previewed before applying it, and works on the selection or the whole sound. Saved as Ogg Vorbis.
- **Microphone recording**: record a new sound variant for any event, or record into an existing sound at the cursor. MP3, WAV, FLAC and other audio files are converted to Ogg Vorbis automatically.
- **Sounds**: search and play all ~2000 sound events, replace individual files, **add your own sounds to events** (e.g. more footstep variants), set **volume and pitch per variant**, or replace the vanilla variants entirely. Every event shows which **blocks, items and mobs** play it (cobblestone and andesite sound like `block.stone`), and you can search by their names; item and mob details list their sounds.
- **Safe editing**: every file shows whether it comes from vanilla, the pack or your own change. Changes can be discarded one by one or reset to vanilla. Your work is **saved automatically** in the browser; after a reload or crash you can continue where you left off.
- **✨ Funny**: shuffle all matching textures and sounds (the sword looks like a carrot, the cow sounds like a ghast) or make every texture as colourful as possible (random colours, rainbow, neon, inverted). The **sound randomizer** gives every sound a random pitch (higher, lower or both, one voice per event or a new one per variant) and hides surprise variants from other events in between. Textures only swap with ones that fit (same kind and size, mobs only with mobs built the same way, optional chaos mode); sounds are redirected in sounds.json without copying audio. Your own edits are left alone, a seed makes results repeatable, and one click removes it all again.
- **Scenes**: see your pack where players see it. The **title screen** turns your panorama behind the logo, splash text and buttons (drag to look around; a 360° image becomes the six panorama images in one click). The **HUD** shows hotbar, hearts, hunger, armour and experience, and the **inventory, chest, crafting table and furnace** screens are drawn from your GUI textures with items you pick. **Biome colours** show grass, leaves, leaf litter and water of every biome from your colormaps. The **font** preview renders any text with your bitmap fonts, and you can add **glyphs of your own** (emoji, icons) on private use characters. **Particles** play their sprites, **paintings** hang at their size, and the **block sandbox** lets you place blocks side by side to see how your textures tile, random variants and biome colours included.
- **Block state and model editor**: open a blockstate file to pick any state and see the block in it, change the model and rotation of each state, and edit **multipart** cases (fences, walls, redstone) with their conditions as clickable property values, OR groups included; plain variants can be turned into multipart. Open a model file to edit its **cuboids**: corners, rotation (the angles the game allows), pivot, shading and faces with their texture variables, plus the texture variables themselves; inherited elements can be copied in to change them. Both with undo and a live 3D view.
- **Shaders**: every core shader, post shader, include and post effect of the pack (and the game) in an editor with GLSL colouring. Post effects – the creeper, spider and enderman spectator views, the menu blur – **run live** on the title panorama with your changes, compile errors included. Presets: no fog, fullbright, a grey creeper view and plain spectator views, each applied as one undoable batch, and only where the version's files still look as expected.
- **Tooltips, maps, glint and light**: item **tooltips** in the pack's tooltip sprites and font, in every `tooltip_style` the pack brings; a **map** in the hand with the pack's background and all its decorations; the **enchantment glint** moving over any item in the 3D view; and a **light level** slider (0–15, with day, torch, moonlight and mob-spawning presets) in the block sandbox that darkens blocks the way the game's light map does, emissive textures staying bright.
- **Own 3D models**: import a Blockbench project (.bbmodel) or a Java model with its textures, and use it for an item: replace it, show it when the item is renamed, or show it for a `custom_model_data` string (you get the `/give` command).
- **Versions (overlays)**: one pack for several Minecraft versions. Declare overlay folders with their format ranges and copy files into them; the editor shows and edits what the loaded version gets.
- **Upgrade old packs**: a pack made for an older Minecraft version (back to 1.8) is brought up to date in one undoable step: renamed and moved textures (1.13 flattening, armour → equipment, mob variants …), combined textures cut into sprites the way Mojang's slicer does it (widgets.png, icons.png, particles, map icons, beds, signs), `.lang` files converted to `.json` with the new keys, model texture references, `overrides` turned into 1.21.4 item definitions and the pack format. Textures whose layout changed are listed for redrawing. The rename tables are generated from Mojang's client jars (`scripts/update-upgrade-renames.mjs`, `scripts/update-gui-slices.mjs`).
- **Work on a pack folder** (Chrome, Edge): open an unzipped pack folder instead of a ZIP. Every change is written straight into it, and files you save in other programs (Aseprite, Blockbench, a text editor) are read again as soon as you switch back to the editor. After a reload, “Continue” opens the folder again.
- **OptiFine / Continuity extras**: the block sandbox draws connected textures (CTM: `ctm`, `ctm_compact`, `horizontal`, `vertical`, `horizontal+vertical`, `vertical+horizontal`, `top`, `random`, `repeat`, `fixed`) and overlays (`overlay` fringes with their tint, `overlay_ctm`, `overlay_random`, `overlay_repeat`, `overlay_fixed`) with each rule listed for the selected block, and a night switch shows emissive textures (`suffix.emissive`) glowing, in the sandbox and in the item viewer. The item details list OptiFine CIT rules with their textures; rules that only check the item's name can be turned into the game's own name rules, so they work without mods.
- **Compare packs**: load a second pack to see what it has that yours doesn't (textures side by side, sounds to play) and take files, folders or everything over in one undoable step.
- **Stack packs**: put several packs together into yours in the order of Minecraft's pack list. For most files the higher pack wins; language files, `sounds.json` (with `replace`), atlases and fonts are combined the way the game combines them.
- **Shrink pack**: removes files that are the same as the game's own and files the game never reads (system files, image editor projects, backups), writes JSON compactly and compresses PNGs better with [oxipng](https://github.com/shssoichiro/oxipng) – every pixel stays the same. Optionally re-encodes sounds at a lower quality. One step that can be undone.
- **Tablets and pens**: pinch with two fingers to zoom and pan in the texture and sound editors, draw with one finger or a pen (its eraser end erases; once a pen is used, a resting hand doesn't draw), tap to see what the mouse would show on hover, and finger-sized controls on touch screens.
- **Find anything with Ctrl+K** (items, plants, mobs, textures, sounds, tabs, actions), and **undo and redo** every change with Ctrl+Z / Ctrl+Y.
- **Works offline and installs as an app**: after the first visit the editor opens without a network (vanilla files are cached in the browser).
- **Export** as a new pack ZIP with the original files plus your changes. Before exporting, a **check** lists what Minecraft would reject or ignore: broken JSON, invalid file names, animations whose frames don't fit, missing textures, models and sounds, wrongly sized textures, files in old or wrong folders and a pack format that doesn't match. Without a pack, “Create new pack” starts from vanilla. Click the pack icon at the top left to upload your own **pack icon** (any image, cropped to a square) or edit it.
- **Multilingual**: the interface is available in English and German (switch at the top right). Item and mob names come from Minecraft's own language files. More languages are easy to add (see [Languages](#languages)).
- **Private**: your pack never leaves your computer. Vanilla files come straight from Mojang's servers and are cached in the browser per version. To tell you about new versions, the editor asks GitHub for the latest release at most every 12 hours; nothing about you or your pack is sent.

## Quick start

**Prebuilt release (only Node.js needed):**

1. Install [Node.js](https://nodejs.org) 18.18 or newer.
2. Download the ZIP from the [releases page](https://github.com/keksi2k/minecraft-resourcepack-editor/releases) and extract it.
3. On Windows, double-click **`Start.bat`** (it offers to install Node.js if it's missing). Otherwise run `node serve.mjs` in the extracted folder.
4. Open http://127.0.0.1:8080.

**From source:**

```sh
git clone https://github.com/keksi2k/minecraft-resourcepack-editor.git
cd minecraft-resourcepack-editor
npm install
npm run dev          # http://localhost:5173
```

The detailed guide for Windows, macOS and Linux, server hosting, updates and troubleshooting is in **[docs/INSTALLATION.md](docs/INSTALLATION.md)**.

## Usage in short

1. Drop a resource pack ZIP onto the start page. A matching Minecraft version is suggested from `pack_format`; you can change it.
2. **Open pack**. The first time, the version's client.jar (~40 MB) is downloaded. After that it comes from the browser cache.
3. Browse the **Items**, **Mobs**, **Textures** and **Sounds** tabs. Blue frame = changed by the pack, orange = edited by you.
4. **⬆ Replace** on a texture or sound lets you pick your own file, **✎ Edit** opens it in the editor. **+ Add sound** attaches an audio file to a sound event, **🎤 Record** records a new one.
5. **Export pack** downloads the finished ZIP. Put it into your `.minecraft/resourcepacks` folder.

## Languages

The interface is currently available in **English** and **German**. On first start the browser's language is used. You can switch at the top right, and the choice is remembered.

### Adding a language

All texts live in `src/i18n/locales/`. English (`en.ts`) is the reference and defines every key.

1. Copy `src/i18n/locales/en.ts` to, for example, `src/i18n/locales/fr.ts` and change the header:
   ```ts
   import type { Translation } from '../index';

   const fr: Translation = {
     app: { title: 'Resource Pack Editor', language: 'Langue', /* … */ },
     // …
   };

   export default fr;
   ```
2. Register the language in `src/i18n/index.ts`:
   ```ts
   import fr from './locales/fr';

   export const LOCALES = {
     en: { name: 'English', messages: en, minecraftLang: 'en_us' },
     de: { name: 'Deutsch', messages: de, minecraftLang: 'de_de' },
     fr: { name: 'Français', messages: fr, minecraftLang: 'fr_fr' },
   } satisfies Record<string, LocaleInfo>;
   ```
   `name` is the language's name in that language (that's how it appears in the picker). `minecraftLang` is the name of Minecraft's language file (`assets/minecraft/lang/<code>.json`, e.g. `fr_fr`, `es_es`, `pt_br`). Item and mob names are taken from it automatically.
3. Run `npm test`. The i18n test reports missing messages, unknown keys and mismatched placeholders.

Translation notes:

- `{name}`, `{count}` and so on are placeholders. Keep them, but feel free to move them within the sentence.
- Counts are objects with plural forms: `{ one: '{count} file', other: '{count} files' }`. Languages with more forms add `zero`, `two`, `few` or `many`, as [`Intl.PluralRules`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules) defines them for the language.
- Missing messages fall back to English, so a partial translation already works. Only the test complains.
- TypeScript checks the keys: a typo in a key, or a key English doesn't have, is a compile error.

The docs can be translated too: add `README.<code>.md` and `docs/INSTALLATION.<code>.md` and add the language links at the top of every version.

## How it works

| Area | Implementation |
| --- | --- |
| Vanilla base | The client.jar is downloaded from `piston-data.mojang.com` (CORS allowed). Only `textures`, `models`, `items`, `atlases`, `blockstates` and `lang/en_us.json` are kept, stored per version in IndexedDB. |
| Layering | `src/assets/AssetStore.ts`: vanilla ← pack ← your edits. The export contains only pack files plus edits. |
| Items | `src/models/`: item definitions (`assets/*/items/*.json`, 1.21.4+) or `models/item/*.json` for older versions, parent chains, texture variables, display transforms, tints. |
| Rendering | `src/render/`: three.js with Minecraft's face shading. `item/generated` becomes an extruded 1 px sprite. Thumbnails use one shared offscreen renderer. |
| Mobs | Mob models live in the game's Java code, not in packs. `scripts/DumpEntityModels.java` runs the game's model builders and writes the geometry to `src/entities/entityModels.json`. `catalog.ts` maps mobs to layers and textures. |
| Sounds | Vanilla sounds live on `resources.download.minecraft.net`, which sends **no CORS** headers. `vite.config.ts` (dev) and `scripts/serve.mjs` (production) forward `/mcres/<hash>` there. A local `.minecraft/assets` folder works as an alternative. Which block plays which sound is set in the game's code: `scripts/DumpBlockSounds.java` reads each block's sound type (and door/button/fence gate sounds) into `src/sounds/blockSounds.json`; `src/sounds/soundLinks.ts` adds name matches for items and mobs. |
| Special models | Item definitions describe chests, shulker boxes, banners, shields, heads, pots and more as `minecraft:special` models placed with a `transformation`. `src/entities/specials.ts` maps them to the game's model layers and textures, including banner/shield pattern layers and pot sherds. |
| Armour trims | Trim textures on items have no file. The game generates them for its item atlas (`paletted_permutations` in `atlases/items.json`) by recolouring a template with a palette. `src/models/atlasPermutations.ts` reads those atlas entries, including a pack's own, and repeats the recolouring. The item details list the template and palettes to edit instead. |
| Editors | `src/render/pixelEdit.ts` and `src/sounds/audioEdit.ts` hold the editing operations on raw pixels and samples (tested without a browser). While a texture is edited, `previewTexture` writes the pixels into the decoded texture the 3D views already use, so they update without being rebuilt. Sounds are encoded with the Ogg Vorbis encoder from [wasm-media-encoders](https://github.com/arseneyr/wasm-media-encoders) (MIT), loaded on first save; filters, reverb and the compressor run in an `OfflineAudioContext`. |
| Autosave | `src/state/session.ts`: the original pack ZIP and your edits are kept in IndexedDB and offered for resuming on the start page. |
| Languages | `src/i18n/`: messages per language, type-checked keys, plurals via `Intl.PluralRules`. Item and mob names come from Minecraft's language file (through the same proxy as sounds, falling back to English). |

## Development

```sh
npm run dev       # dev server with hot reload
npm test          # unit tests (Vitest)
npm run test:e2e  # end-to-end tests in Chromium (Playwright; once: npx playwright install chromium,
                  # or use an installed Google Chrome with PW_CHANNEL=chrome)
npm run build     # type check + production build to dist/
npm run serve     # serve dist/ including the sound proxy (port 8080)
npm run package   # release ZIP to release/
```

Every push runs type check, tests and build on Node 20, 22 and 26 (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)), the end-to-end tests in Chromium, and the resolver test against the real client.jar. Once a week the same test runs against the newest Minecraft release, so breaking game updates show up early.

Check the resolver against a real client.jar:

```sh
MC_JAR=/path/to/client.jar npx vitest run vanilla
```

## Limitations

- Mob animations are a simplified preview (head, legs, arms, wings, tails), not the game's exact movements. States like angry wolves, charging vexes or a shulker's open shell aren't shown (their textures are in the texture browser).
- Banner patterns and pottery sherds are a preview only: in game they are stored on the item, so they aren't part of the exported pack (their textures are).
- In the Plants tab, a plant shows one standing position: a vine on a single side, a dripleaf that isn't tilted. Leaf litter isn't tinted like in a forest yet.
- Movements in hand (eating, drawing a bow, blocking) are coded in the game and not part of a pack, so they aren't animated; the models of these states can be previewed.
- Block sounds come straight from the game; for items and mobs the editor matches sound names (`entity.wolf_angry.*` → wolf), so sounds a mob or item plays under an unrelated name are not linked.
- The microphone only works on `localhost`/`127.0.0.1` or over https. If you open the editor from another device on the LAN (`--host 0.0.0.0`), the browser blocks recording.
- While editing a flat item (sword, apple …), colours update live in 3D, but the item's sides only follow newly painted or erased pixels after saving.
- The HUD and container screens use the vanilla layout; a pack can't move GUI elements, only change how they look. Characters from TrueType or unifont providers are drawn with a stand-in in the font preview.
- Bedrock Edition is not supported.

## Legal

Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft. “Minecraft” is a trademark of Mojang AB.

The repository contains no Minecraft textures, sounds or program files. The browser downloads them at runtime from Mojang's official servers. `src/entities/entityModels.json` contains only geometry data (box sizes and UV coordinates) of the vanilla mob models, so the mobs can be displayed.

Code under the [MIT license](LICENSE). The release ZIP contains `THIRD_PARTY_LICENSES.txt` with the licences of the bundled libraries (all permissive: MIT, BSD, ISC, Apache-2.0, Zlib), including libogg/libvorbis inside the Ogg Vorbis encoder.
