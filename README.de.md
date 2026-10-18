# Minecraft Resource Pack Editor

[English](README.md) · **Deutsch**

Ein Editor für **Minecraft-Java-Resourcepacks**, der komplett im Browser läuft. Pack laden, alle Items und Mobs in 3D ansehen, Sounds anhören, Texturen und Sounds herunterladen oder ersetzen, eigene Sounds hinzufügen und das Pack wieder als ZIP exportieren.

## Funktionen

- **Alle Items** (~1650 in 26.3) mit Inventar-Render: Blöcke isometrisch, flache Items als Sprite, Färbungen (Laub, Gras, Tränke …) wie im Spiel.
- **3D-Viewer** pro Item, drehbar, mit den Display-Ansichten des Spiels (Inventar, Hand 1st/3rd Person, Boden, Rahmen, Kopf). Render als PNG herunterladbar.
- **38 Mobs in 3D** (Creeper, Zombie, Skelett, Spinne, Schwein, Kuh, Schaf, Fuchs, Axolotl, Spieler-Skins … inkl. Varianten) mit dem echten Vanilla-Modell, plus **UV-Overlay**: Auf der Textur sieht man, welcher Bereich zu Kopf, Körper, Beinen usw. gehört.
- **Texturen-Browser** für alle ~4000 Texturen (Blöcke, Items, Entities, GUI …).
- **Sounds**: alle ~2000 Sound-Events durchsuchen und abspielen, einzelne Dateien ersetzen, **eigene Sounds zu Events hinzufügen** (z. B. weitere Schrittgeräusche) oder die Vanilla-Varianten komplett ersetzen.
- **Bearbeiten ohne Risiko**: Jede Datei zeigt, ob sie aus Vanilla, dem Pack oder einer eigenen Änderung stammt. Änderungen lassen sich einzeln verwerfen oder auf Vanilla zurücksetzen.
- **Export** als neues Pack-ZIP mit Originaldateien und Änderungen. Ohne Pack startest du mit „Neues Pack erstellen“ auf Vanilla-Basis.
- **Mehrsprachig**: Oberfläche auf Deutsch und Englisch, umschaltbar oben rechts. Item- und Mob-Namen kommen aus Minecrafts eigenen Sprachdateien (z. B. „Diamantschwert“). Weitere Sprachen lassen sich leicht ergänzen (siehe [Sprachen](#sprachen)).
- **Privat**: Dein Pack verlässt den Rechner nicht. Die Vanilla-Dateien kommen direkt von Mojangs Servern und werden pro Version im Browser gespeichert.

## Schnellstart

**Fertiges Release (nur Node.js nötig):**

1. [Node.js](https://nodejs.org) 18.18 oder neuer installieren.
2. Das ZIP von der [Releases-Seite](https://github.com/keksi2k/minecraft-resourcepack-editor/releases) herunterladen und entpacken.
3. Unter Windows **`Start.bat`** doppelklicken, sonst im entpackten Ordner `node serve.mjs` ausführen.
4. http://127.0.0.1:8080 öffnen.

**Aus dem Quellcode:**

```sh
git clone https://github.com/keksi2k/minecraft-resourcepack-editor.git
cd minecraft-resourcepack-editor
npm install
npm run dev          # http://localhost:5173
```

Die ausführliche Anleitung für Windows, macOS und Linux, für Server-Hosting, Updates und bei Problemen steht in **[docs/INSTALLATION.de.md](docs/INSTALLATION.de.md)**.

## Bedienung in Kürze

1. Resourcepack-ZIP auf die Startseite ziehen. Die passende Minecraft-Version wird anhand von `pack_format` vorgeschlagen und kann geändert werden.
2. **Pack öffnen**. Beim ersten Mal wird die client.jar der Version geladen (~40 MB), danach kommt sie aus dem Browser-Cache.
3. In den Tabs **Items**, **Mobs**, **Texturen** und **Sounds** stöbern. Blauer Rahmen = vom Pack verändert, orange = von dir bearbeitet.
4. **⬆ Ersetzen** bei einer Textur oder einem Sound wählt eine eigene Datei. **+ Sound hinzufügen** hängt eine `.ogg` an ein Sound-Event an.
5. **Pack exportieren** lädt das fertige ZIP herunter. Das kommt in den Ordner `.minecraft/resourcepacks`.

## Sprachen

Die Oberfläche gibt es derzeit auf **Englisch** und **Deutsch**. Beim ersten Start wird die Sprache des Browsers verwendet, umschalten kannst du oben rechts. Die Wahl wird im Browser gespeichert.

### Neue Sprache hinzufügen

Alle Texte stehen in `src/i18n/locales/`. Englisch (`en.ts`) ist die Referenz und definiert jeden Schlüssel.

1. `src/i18n/locales/en.ts` nach z. B. `src/i18n/locales/fr.ts` kopieren und den Kopf anpassen:
   ```ts
   import type { Translation } from '../index';

   const fr: Translation = {
     app: { title: 'Resource Pack Editor', language: 'Langue', /* … */ },
     // …
   };

   export default fr;
   ```
2. Die Sprache in `src/i18n/index.ts` eintragen:
   ```ts
   import fr from './locales/fr';

   export const LOCALES = {
     en: { name: 'English', messages: en, minecraftLang: 'en_us' },
     de: { name: 'Deutsch', messages: de, minecraftLang: 'de_de' },
     fr: { name: 'Français', messages: fr, minecraftLang: 'fr_fr' },
   } satisfies Record<string, LocaleInfo>;
   ```
   `name` ist der Name der Sprache in ihr selbst (so erscheint sie in der Auswahl). `minecraftLang` ist der Name von Minecrafts Sprachdatei (`assets/minecraft/lang/<code>.json`, z. B. `fr_fr`, `es_es`, `pt_br`). Daraus kommen automatisch die Item- und Mob-Namen.
3. `npm test` ausführen. Der i18n-Test meldet fehlende Texte, unbekannte Schlüssel und abweichende Platzhalter.

Hinweise zum Übersetzen:

- `{name}`, `{count}` usw. sind Platzhalter. Sie müssen erhalten bleiben, dürfen aber an eine andere Stelle im Satz.
- Mengenangaben sind Objekte mit Pluralformen: `{ one: '{count} Datei', other: '{count} Dateien' }`. Sprachen mit mehr Formen ergänzen `zero`, `two`, `few` oder `many`, wie es [`Intl.PluralRules`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules) für die Sprache vorsieht.
- Fehlende Texte fallen auf Englisch zurück. Eine halbfertige Übersetzung funktioniert also schon, nur der Test schlägt an.
- TypeScript prüft die Schlüssel: Ein Tippfehler im Schlüssel oder ein Schlüssel, den es im Englischen nicht gibt, ist ein Compile-Fehler.

Auch die Doku lässt sich übersetzen: `README.<code>.md` und `docs/INSTALLATION.<code>.md` anlegen und oben in allen Fassungen die Sprachlinks ergänzen.

## Wie es funktioniert

| Bereich | Umsetzung |
| --- | --- |
| Vanilla-Basis | Die client.jar wird von `piston-data.mojang.com` geladen (CORS erlaubt). Behalten werden nur `textures`, `models`, `items` und `lang/en_us.json`, gespeichert pro Version in IndexedDB. |
| Layering | `src/assets/AssetStore.ts`: Vanilla ← Pack ← eigene Änderungen. Der Export enthält nur Pack-Dateien plus Änderungen. |
| Items | `src/models/`: Item-Definitionen (`assets/*/items/*.json`, ab 1.21.4) bzw. `models/item/*.json` bei älteren Versionen, Parent-Ketten, Textur-Variablen, Display-Transforms, Tints. |
| Rendering | `src/render/`: three.js mit Minecraft-Flächenschattierung. `item/generated` wird zum extrudierten 1-px-Sprite. Thumbnails laufen über einen geteilten Offscreen-Renderer. |
| Mobs | Mob-Modelle stehen im Java-Code des Spiels, nicht im Pack. `scripts/DumpEntityModels.java` lässt die Modell-Builder des Spiels laufen und schreibt die Geometrie nach `src/entities/entityModels.json`. `catalog.ts` ordnet Mobs Layer und Texturen zu. |
| Sounds | Vanilla-Sounds liegen auf `resources.download.minecraft.net`, das **kein CORS** sendet. `vite.config.ts` (Dev) und `scripts/serve.mjs` (Produktion) leiten `/mcres/<hash>` dorthin weiter. Alternativ geht ein lokaler `.minecraft/assets`-Ordner. |
| Sprachen | `src/i18n/`: Texte pro Sprache, typgeprüfte Schlüssel, Plurale über `Intl.PluralRules`. Item- und Mob-Namen kommen aus Minecrafts Sprachdatei (über denselben Proxy wie die Sounds, mit Englisch als Rückfall). |

## Entwicklung

```sh
npm run dev       # Dev-Server mit Hot Reload
npm test          # Unit-Tests (Vitest)
npm run build     # Typecheck + Produktions-Build nach dist/
npm run serve     # dist/ inkl. Sound-Proxy ausliefern (Port 8080)
npm run package   # Release-ZIP nach release/
```

Den Resolver gegen eine echte client.jar prüfen:

```sh
MC_JAR=/pfad/zur/client.jar npx vitest run vanilla
```

## Grenzen

- Mobs stehen in einer statischen Pose ohne Animation. Rüstung, Sattel, Halsband, Villager-Berufe und Mooshroom-Pilze fehlen noch.
- Spezialmodelle, die das Spiel per Code zeichnet (Truhen, Banner, Köpfe, Schilde, Shulkerboxen, Betten …), erscheinen als Würfel mit Partikeltextur.
- Animierte Texturen zeigen nur den ersten Frame.
- Dynamische Item-Zustände (Bogen spannen, Kompass …) zeigen den Ruhezustand.
- Die Zuordnung Item ↔ Sounds ist eine Namensheuristik, weil Minecraft sie im Code festlegt.
- Bedrock Edition wird nicht unterstützt.

## Rechtliches

Kein offizielles Minecraft-Produkt, nicht von Mojang oder Microsoft genehmigt oder mit ihnen verbunden. „Minecraft“ ist eine Marke von Mojang AB.

Das Repository enthält keine Minecraft-Texturen, -Sounds oder -Programmdateien. Diese lädt der Browser zur Laufzeit von Mojangs offiziellen Servern. `src/entities/entityModels.json` enthält nur Geometriedaten (Quadermaße und UV-Koordinaten) der Vanilla-Mob-Modelle, damit die Mobs dargestellt werden können.

Code unter [MIT-Lizenz](LICENSE).
