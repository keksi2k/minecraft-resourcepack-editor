# Minecraft Resource Pack Editor

**English** · [Deutsch](README.de.md)

A browser-based editor for **Minecraft Java Edition resource packs**. Load a pack, view every item and mob in 3D, listen to sounds, download or replace textures and sounds, add your own sounds, and export the pack as a ZIP again.

## Features

- **Every item** (~1650 in 26.3) with an inventory-style render: blocks isometric, flat items as sprites, tints (leaves, grass, potions …) like in game.
- **3D viewer** for each item, orbitable, with the game's display contexts (inventory, 1st/3rd person hand, ground, item frame, head). Renders can be downloaded as PNG.
- **38 mobs in 3D** (creeper, zombie, skeleton, spider, pig, cow, sheep, fox, axolotl, player skins … including variants) using the real vanilla models, plus a **UV overlay** that shows which part of the texture belongs to the head, body, legs and so on.
- **Texture browser** for all ~4000 textures (blocks, items, entities, GUI …).
- **Sounds**: search and play all ~2000 sound events, replace individual files, **add your own sounds to events** (e.g. more footstep variants) or replace the vanilla variants entirely.
- **Safe editing**: every file shows whether it comes from vanilla, the pack or your own change. Changes can be discarded one by one or reset to vanilla.
- **Export** as a new pack ZIP with the original files plus your changes. Without a pack, “Create new pack” starts from vanilla.
- **Multilingual**: the interface is available in English and German (switch at the top right). Item and mob names come from Minecraft's own language files. More languages are easy to add (see [Languages](#languages)).
- **Private**: your pack never leaves your computer. Vanilla files come straight from Mojang's servers and are cached in the browser per version.

## Quick start

**Prebuilt release (only Node.js needed):**

1. Install [Node.js](https://nodejs.org) 18.18 or newer.
2. Download the ZIP from the [releases page](https://github.com/keksi2k/minecraft-resourcepack-editor/releases) and extract it.
3. On Windows, double-click **`Start.bat`**. Otherwise run `node serve.mjs` in the extracted folder.
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
4. **⬆ Replace** on a texture or sound lets you pick your own file. **+ Add sound** attaches an `.ogg` to a sound event.
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
| Vanilla base | The client.jar is downloaded from `piston-data.mojang.com` (CORS allowed). Only `textures`, `models`, `items` and `lang/en_us.json` are kept, stored per version in IndexedDB. |
| Layering | `src/assets/AssetStore.ts`: vanilla ← pack ← your edits. The export contains only pack files plus edits. |
| Items | `src/models/`: item definitions (`assets/*/items/*.json`, 1.21.4+) or `models/item/*.json` for older versions, parent chains, texture variables, display transforms, tints. |
| Rendering | `src/render/`: three.js with Minecraft's face shading. `item/generated` becomes an extruded 1 px sprite. Thumbnails use one shared offscreen renderer. |
| Mobs | Mob models live in the game's Java code, not in packs. `scripts/DumpEntityModels.java` runs the game's model builders and writes the geometry to `src/entities/entityModels.json`. `catalog.ts` maps mobs to layers and textures. |
| Sounds | Vanilla sounds live on `resources.download.minecraft.net`, which sends **no CORS** headers. `vite.config.ts` (dev) and `scripts/serve.mjs` (production) forward `/mcres/<hash>` there. A local `.minecraft/assets` folder works as an alternative. |
| Languages | `src/i18n/`: messages per language, type-checked keys, plurals via `Intl.PluralRules`. Item and mob names come from Minecraft's language file (through the same proxy as sounds, falling back to English). |

## Development

```sh
npm run dev       # dev server with hot reload
npm test          # unit tests (Vitest)
npm run build     # type check + production build to dist/
npm run serve     # serve dist/ including the sound proxy (port 8080)
npm run package   # release ZIP to release/
```

Check the resolver against a real client.jar:

```sh
MC_JAR=/path/to/client.jar npx vitest run vanilla
```

## Limitations

- Mobs are shown in a static pose without animation. Armour, saddles, collars, villager professions and mooshroom mushrooms are missing for now.
- Special models the game draws in code (chests, banners, heads, shields, shulker boxes, beds …) appear as a cube with their particle texture.
- Animated textures show only the first frame.
- Dynamic item states (drawing a bow, compass …) show the resting state.
- Matching sounds to items is a name heuristic, because Minecraft defines it in code.
- Bedrock Edition is not supported.

## Legal

Not an official Minecraft product. Not approved by or associated with Mojang or Microsoft. “Minecraft” is a trademark of Mojang AB.

The repository contains no Minecraft textures, sounds or program files. The browser downloads them at runtime from Mojang's official servers. `src/entities/entityModels.json` contains only geometry data (box sizes and UV coordinates) of the vanilla mob models, so the mobs can be displayed.

Code under the [MIT license](LICENSE).
