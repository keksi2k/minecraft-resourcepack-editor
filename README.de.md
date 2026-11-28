# Minecraft Resource Pack Editor

[![CI](https://github.com/keksi2k/minecraft-resourcepack-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/keksi2k/minecraft-resourcepack-editor/actions/workflows/ci.yml)

[English](README.md) · **Deutsch**

Ein Editor für **Minecraft-Java-Resourcepacks**, der komplett im Browser läuft. Pack laden, alle Items und Mobs in 3D ansehen, Sounds anhören, Texturen und Sounds herunterladen, ersetzen oder **direkt im Browser bearbeiten**, eigene Sounds aufnehmen und das Pack wieder als ZIP exportieren.

## Funktionen

- **Alle Items** (~1650 in 26.3) mit Inventar-Render: Blöcke isometrisch, flache Items als Sprite, Färbungen (Laub, Gras, Tränke …) wie im Spiel. Truhen, Shulkerkisten, Banner, Schilde, Köpfe, Betten, verzierte Krüge, Aquisitoren, Dreizacke und Kupfergolem-Statuen werden ebenfalls mit ihren echten Modellen gezeichnet, und animierte Texturen (Wasser, Lava, Feuer, Portale …) laufen im Grid, im 3D-Viewer und in der Texturvorschau.
- **3D-Viewer** pro Item, drehbar, mit den Display-Ansichten des Spiels (Inventar, Hand 1st/3rd Person, Boden, Rahmen, Kopf). Render als PNG herunterladbar.
- **Muster-Vorschau** für Banner und Schilde (Musterebenen und Farben) sowie Töpferscherben für verzierte Krüge, damit du deine Mustertexturen am echten Modell prüfen kannst.
- **Alle Pflanzen mit ihren Wachstumsstufen**: Feldfrüchte, Stiele, Kakao, Beerensträucher, Höhlenranken, Bambus, Rosablüten, Seegurken und Kannenpflanzen, dazu Blumen, Setzlinge, Gras, Pilze, Zuckerrohr, Seetang, Kakteen, Ranken und Tropfblätter, in 3D, so wie sie in der Welt stehen. Alle Stufen nebeneinander, als Wachstumsanimation abspielbar, und jede Textur des Blocks lässt sich direkt dort bearbeiten.
- **Item-Zustände**: Sieh dir an, wie ein Item beim Benutzen, gespannt, geladen, kaputt, mit anderem Kompasswinkel oder anderer Uhrzeit, mit anderem Rüstungsbesatz usw. aussieht. Jeder Schalter der Item-Definition lässt sich einstellen, und die Texturen dieses Zustands kannst du direkt dort ersetzen. **Alle Stadien** zeigt jedes Aussehen nebeneinander (Bogen gespannt, alle 64 Uhrzeiten, Kompasswinkel …) und spielt sie auf Wunsch nacheinander ab.
- **Alle 91 Mobs in 3D, 281 Einträge mit ihren Farb- und Biom-Varianten und 94 Babys** (von Creeper und Axolotl bis Warden und Enderdrache) mit dem echten Vanilla-Modell, **animiert** (umschauen, laufen) und mit ihrer **Ausrüstung**: Rüstung aus jedem Material, Pferde-, Wolf- und Nautilus-Rüstung, Sättel, Lama-Teppiche, Geschirr für den Glücklichen Ghast, Halsbänder, Pferdeabzeichen, Dorfbewohner-Biome, -Berufe und -Stufen, geladene Creeper und Mooshroom-Pilze – mit den Texturen deines Packs, die sich direkt dort bearbeiten lassen. Dazu ein **UV-Overlay**: Auf der Textur sieht man, welcher Bereich zu Kopf, Körper, Beinen usw. gehört, und eine **UV-Vorlage** zum Herunterladen (farbige Flächen, schattiert wie im Spiel, oder Umrisse über der Textur) – für Mobs und für Block- und Item-Modelle. Ein Klick auf den Mob markiert den Texturpixel an genau dieser Stelle.
- **Texturen-Browser** für alle ~4000 Texturen (Blöcke, Items, Entities, GUI …).
- **Textur-Einstellungen (.mcmeta)** ohne JSON zu schreiben: Animationstempo, weiches Überblenden, eigene Frame-Reihenfolge und -Dauer, Frames hinzufügen oder entfernen, Skalierung von GUI-Sprites (strecken, kacheln, Nine-Slice), Dorfbewohner-Hüte und blur/clamp. Jede Textur zeigt nur die Einstellungen, die Minecraft für sie liest; alles andere lässt sich als Text bearbeiten. Beim Export behält eine ersetzte animierte Textur ihre Animation. **Frames importieren** aus mehreren Bildern (eins pro Frame) oder einem animierten GIF samt Timing, und **jede Animation als GIF herunterladen**.
- **Textur-Editor**: Stift, Radierer, Füllen, Farbpipette, Linie und Rechteck, die Farbpalette der Textur, **Ebenen** (Sichtbarkeit, Deckkraft, Vereinen; beim Speichern werden sie zusammengeführt), eine **Auswahl**, in der gemalt wird, Verschieben, Kopieren und Einfügen (auch Bilder aus anderen Programmen, als neue Ebene), Spiegeln/Kippen/Drehen, Verschieben mit Umbruch für nahtlose Blöcke, Farbton/Sättigung/Helligkeit, Graustufen und Invertieren, mit Rückgängig. Das 3D-Modell und die Item- bzw. Mob-Details bleiben daneben offen und zeigen jeden Strich live. Animierte Texturen bekommen eine **Frame-Leiste**: Vorschaubilder, Frames hinzufügen, duplizieren, verschieben und löschen, Onion Skin (der vorige Frame scheint blass durch) und Abspielen; Transformieren und Farbe wirken auf den aktuellen Frame.
- **Paletten und Farbe ersetzen**: Paletten von [Lospec](https://lospec.com/palette-list) per Name oder Link laden oder .hex-, .gpl-, .pal-, .txt- und PNG-Palettendateien importieren; Farben daraus wählen und eine Textur an die nächstliegenden Palettenfarben angleichen. Eine Farbe durch eine andere ersetzen (nahe Schattierungen wandern mit), in der Textur, ihrem Ordner oder allen Texturen des Packs auf einmal, als ein Stapel, der sich rückgängig machen lässt.
- **Texturen per Name** (1.21.5+): Benenne ein Item im Amboss um, und es zeigt eine eigene Textur. Namen samt Bild fügst du in den Item-Details hinzu; die Item-Definition wird für dich geschrieben.
- **Zufällige Block-Varianten**: Gib einem Block mehrere Modelle (eigene Bilder oder gedrehte Kopien) mit Gewichtung, damit große Flächen nicht gekachelt aussehen.
- **Texte**: Pack-Beschreibung mit Farben und Formatierung bearbeiten (Live-Vorschau wie in der Pack-Liste), Pack-Format setzen, Splash-Texte des Titelbildschirms bearbeiten und beliebige Spieltexte (Item- und Blocknamen, Menüs) in jeder Sprache ändern; nur deine Änderungen kommen ins Pack.
- **Fortschritt**: wie viele Texturen des Spiels dein Pack ersetzt, pro Ordner, welche neben deinem Stil noch herausstechen, und welche Texturen seit einer älteren Minecraft-Version neu sind.
- **Viele Texturen auf einmal ändern**: Texturen (oder einen ganzen Ordner) auswählen und Farben verschieben, Graustufen oder Invertieren, oder ohne Unschärfe ×2/×4/×8 hochskalieren (z. B. von 16× auf 32×). Ein Klick nimmt die ganze Sammeländerung zurück.
- **Sound-Editor**: Wellenform mit Auswahl und Zoom; schneiden, zuschneiden, Stille einfügen, Stille abschneiden, ein-/ausblenden, rückwärts, Mono; Verstärkung, Kompressor, Normalisieren; **Tonhöhe** (Halbtöne, gleiche Länge), **Tempo** (gleiche Tonhöhe) und Geschwindigkeit wie bei einer Schallplatte; Bass, Höhen, Tief- und Hochpass; Hall, Echo und Verzerrung. Jeder Effekt lässt sich vor dem Anwenden vorhören und wirkt auf die Auswahl oder den ganzen Sound. Gespeichert wird als Ogg Vorbis.
- **Mikrofon-Aufnahme**: eine neue Sound-Variante für jedes Event aufnehmen oder am Cursor in einen bestehenden Sound hinein. MP3, WAV, FLAC und andere Audiodateien werden automatisch in Ogg Vorbis umgewandelt.
- **Sounds**: alle ~2000 Sound-Events durchsuchen und abspielen, einzelne Dateien ersetzen, **eigene Sounds zu Events hinzufügen** (z. B. weitere Schrittgeräusche), **Lautstärke und Tonhöhe pro Variante** einstellen oder die Vanilla-Varianten komplett ersetzen. Jedes Event zeigt, welche **Blöcke, Items und Mobs** es abspielen (Bruchstein und Andesit klingen nach `block.stone`), und lässt sich über deren Namen finden; Item- und Mob-Details listen ihre Sounds.
- **Bearbeiten ohne Risiko**: Jede Datei zeigt, ob sie aus Vanilla, dem Pack oder einer eigenen Änderung stammt. Änderungen lassen sich einzeln verwerfen oder auf Vanilla zurücksetzen. Deine Arbeit wird **automatisch im Browser gespeichert**; nach einem Neuladen oder Absturz machst du dort weiter, wo du aufgehört hast.
- **✨ Funny**: alle passenden Texturen und Sounds durchmischen (das Schwert sieht aus wie eine Karotte, die Kuh klingt wie ein Ghast) oder jede Textur knallbunt machen (Zufallsfarben, Regenbogen, Neon, invertiert). Der **Sound-Randomizer** gibt jedem Sound eine zufällige Tonhöhe (höher, tiefer oder beides, eine Stimme pro Event oder jede Variante anders) und versteckt Überraschungen aus anderen Events dazwischen. Texturen tauschen nur mit passenden (gleiche Art und Größe, Mobs nur mit gleich gebauten, optional Chaos-Modus); Sounds werden in der sounds.json umgeleitet, ohne Audiodateien zu kopieren. Deine eigenen Änderungen bleiben unberührt, ein Seed macht Ergebnisse wiederholbar, und ein Klick entfernt alles wieder.
- **Szenen**: Sieh dein Pack dort, wo Spieler es sehen. Der **Titelbildschirm** dreht dein Panorama hinter Logo, Splash-Text und Buttons (Ziehen zum Umsehen; ein 360°-Bild wird mit einem Klick zu den sechs Panorama-Bildern). Das **HUD** zeigt Hotbar, Herzen, Hunger, Rüstung und Erfahrung, und **Inventar, Truhe, Werkbank und Ofen** werden aus deinen GUI-Texturen gezeichnet, mit Items deiner Wahl. **Biomfarben** zeigen Gras, Laub, Laubstreu und Wasser jedes Bioms aus deinen Colormaps. Die **Schrift**-Vorschau zeigt beliebigen Text in deinen Bitmap-Schriften, und du kannst **eigene Zeichen** (Emojis, Symbole) auf privaten Unicode-Zeichen anlegen. **Partikel** spielen ihre Sprites ab, **Gemälde** hängen in ihrer Größe an der Wand, und im **Block-Sandkasten** setzt du Blöcke nebeneinander, um zu sehen, wie sich deine Texturen kacheln, mit zufälligen Varianten und Biomfarben.
- **Eigene 3D-Modelle**: Importiere ein Blockbench-Projekt (.bbmodel) oder ein Java-Modell mit seinen Texturen und nutze es für ein Item: als Ersatz, beim Umbenennen im Amboss oder für einen `custom_model_data`-Text (den `/give`-Befehl bekommst du dazu).
- **Versionen (Overlays)**: ein Pack für mehrere Minecraft-Versionen. Lege Overlay-Ordner mit ihren Format-Bereichen an und kopiere Dateien hinein; der Editor zeigt und bearbeitet, was die geladene Version bekommt.
- **Alte Packs aktualisieren**: Ein Pack für eine ältere Minecraft-Version (bis zurück zu 1.8) wird in einem Schritt, der sich rückgängig machen lässt, auf den aktuellen Stand gebracht: umbenannte und verschobene Texturen (1.13-Flattening, Rüstung → equipment, Mob-Varianten …), Sammeltexturen werden wie mit Mojangs Slicer in Sprites zerlegt (widgets.png, icons.png, Partikel, Kartensymbole, Betten, Schilder), `.lang`-Dateien werden mit den neuen Schlüsseln zu `.json`, Texturverweise in Modellen werden angepasst, `overrides` werden zu Item-Definitionen (1.21.4) und das Pack-Format wird gesetzt. Texturen mit geändertem Aufbau werden zum Neuzeichnen aufgelistet. Die Umbenennungstabellen werden aus Mojangs Client-Jars erzeugt (`scripts/update-upgrade-renames.mjs`, `scripts/update-gui-slices.mjs`).
- **An einem Pack-Ordner arbeiten** (Chrome, Edge): Öffne statt einer ZIP einen entpackten Pack-Ordner. Jede Änderung wird direkt hineingeschrieben, und Dateien, die du in anderen Programmen speicherst (Aseprite, Blockbench, ein Texteditor), werden neu eingelesen, sobald du zum Editor zurückwechselst. Nach einem Neuladen öffnet „Fortsetzen“ den Ordner wieder.
- **OptiFine-/Continuity-Extras**: Der Block-Sandkasten zeichnet verbundene Texturen (CTM: `ctm`, `ctm_compact`, `horizontal`, `vertical`, `horizontal+vertical`, `vertical+horizontal`, `top`, `random`, `repeat`, `fixed`) und Overlays (`overlay`-Säume mit ihrer Einfärbung, `overlay_ctm`, `overlay_random`, `overlay_repeat`, `overlay_fixed`) und listet die Regeln des gewählten Blocks; ein Nacht-Schalter lässt Emissive-Texturen (`suffix.emissive`) leuchten, im Sandkasten und in der Item-Ansicht. Die Item-Details zeigen OptiFine-CIT-Regeln mit ihren Texturen; Regeln, die nur auf den Item-Namen schauen, lassen sich in die Namensregeln des Spiels umwandeln und funktionieren dann ohne Mods.
- **Packs vergleichen**: Lade ein zweites Pack und sieh, was es hat und deins nicht (Texturen nebeneinander, Sounds zum Anhören), und übernimm Dateien, Ordner oder alles in einem Schritt, der sich rückgängig machen lässt.
- **Packs stapeln**: Mehrere Packs in der Reihenfolge der Pack-Liste von Minecraft in deins zusammenführen. Bei den meisten Dateien gewinnt das höhere Pack; Sprachdateien, `sounds.json` (mit `replace`), Atlanten und Schriften werden so kombiniert wie im Spiel.
- **Pack verkleinern**: entfernt Dateien, die genau wie die des Spiels sind, und Dateien, die das Spiel nie liest (Systemdateien, Projekte von Bildprogrammen, Sicherungen), schreibt JSON kompakt und komprimiert PNGs mit [oxipng](https://github.com/shssoichiro/oxipng) besser – jedes Pixel bleibt gleich. Auf Wunsch werden Sounds mit niedrigerer Qualität neu kodiert. Ein Schritt, der sich rückgängig machen lässt.
- **Tablets und Stifte**: Mit zwei Fingern zoomen und verschieben im Textur- und Sound-Editor, mit einem Finger oder Stift zeichnen (das Radierer-Ende radiert; sobald ein Stift benutzt wurde, zeichnet die aufliegende Hand nicht mehr), Antippen zeigt, was sonst beim Überfahren mit der Maus erscheint, und Bedienelemente in Fingergröße auf Touchscreens.
- **Alles finden mit Strg+K** (Items, Pflanzen, Mobs, Texturen, Sounds, Tabs, Aktionen), und **jede Änderung rückgängig machen und wiederholen** mit Strg+Z / Strg+Y.
- **Offline nutzbar und als App installierbar**: Nach dem ersten Besuch öffnet sich der Editor auch ohne Netz (die Vanilla-Dateien liegen im Browser).
- **Export** als neues Pack-ZIP mit Originaldateien und Änderungen. Vor dem Export listet eine **Prüfung** auf, was Minecraft ablehnen oder ignorieren würde: kaputtes JSON, ungültige Dateinamen, Animationen mit unpassenden Frames, fehlende Texturen, Modelle und Sounds, falsch große Texturen, Dateien in alten oder falschen Ordnern und ein unpassendes Pack-Format. Ohne Pack startest du mit „Neues Pack erstellen“ auf Vanilla-Basis. Ein Klick auf das Pack-Bild oben links lädt ein eigenes **Pack-Bild** hoch (jedes Bild, quadratisch zugeschnitten) oder bearbeitet es.
- **Mehrsprachig**: Oberfläche auf Deutsch und Englisch, umschaltbar oben rechts. Item- und Mob-Namen kommen aus Minecrafts eigenen Sprachdateien (z. B. „Diamantschwert“). Weitere Sprachen lassen sich leicht ergänzen (siehe [Sprachen](#sprachen)).
- **Privat**: Dein Pack verlässt den Rechner nicht. Die Vanilla-Dateien kommen direkt von Mojangs Servern und werden pro Version im Browser gespeichert. Um dich auf neue Versionen hinzuweisen, fragt der Editor höchstens alle 12 Stunden bei GitHub nach dem neuesten Release; dabei wird nichts über dich oder dein Pack gesendet.

## Schnellstart

**Fertiges Release (nur Node.js nötig):**

1. [Node.js](https://nodejs.org) 18.18 oder neuer installieren.
2. Das ZIP von der [Releases-Seite](https://github.com/keksi2k/minecraft-resourcepack-editor/releases) herunterladen und entpacken.
3. Unter Windows **`Start.bat`** doppelklicken (bietet an, Node.js zu installieren, falls es fehlt), sonst im entpackten Ordner `node serve.mjs` ausführen.
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
4. **⬆ Ersetzen** bei einer Textur oder einem Sound wählt eine eigene Datei, **✎ Bearbeiten** öffnet sie im Editor. **+ Sound hinzufügen** hängt eine Audiodatei an ein Sound-Event an, **🎤 Aufnehmen** nimmt eine neue auf.
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
| Vanilla-Basis | Die client.jar wird von `piston-data.mojang.com` geladen (CORS erlaubt). Behalten werden nur `textures`, `models`, `items`, `atlases`, `blockstates` und `lang/en_us.json`, gespeichert pro Version in IndexedDB. |
| Layering | `src/assets/AssetStore.ts`: Vanilla ← Pack ← eigene Änderungen. Der Export enthält nur Pack-Dateien plus Änderungen. |
| Items | `src/models/`: Item-Definitionen (`assets/*/items/*.json`, ab 1.21.4) bzw. `models/item/*.json` bei älteren Versionen, Parent-Ketten, Textur-Variablen, Display-Transforms, Tints. |
| Rendering | `src/render/`: three.js mit Minecraft-Flächenschattierung. `item/generated` wird zum extrudierten 1-px-Sprite. Thumbnails laufen über einen geteilten Offscreen-Renderer. |
| Mobs | Mob-Modelle stehen im Java-Code des Spiels, nicht im Pack. `scripts/DumpEntityModels.java` lässt die Modell-Builder des Spiels laufen und schreibt die Geometrie nach `src/entities/entityModels.json`. `catalog.ts` ordnet Mobs Layer und Texturen zu. |
| Sounds | Vanilla-Sounds liegen auf `resources.download.minecraft.net`, das **kein CORS** sendet. `vite.config.ts` (Dev) und `scripts/serve.mjs` (Produktion) leiten `/mcres/<hash>` dorthin weiter. Alternativ geht ein lokaler `.minecraft/assets`-Ordner. Welcher Block welchen Sound spielt, legt der Spielcode fest: `scripts/DumpBlockSounds.java` liest die Sound-Typen aller Blöcke (plus Tür-, Knopf- und Zauntor-Sounds) nach `src/sounds/blockSounds.json`; `src/sounds/soundLinks.ts` ergänzt Namenstreffer für Items und Mobs. |
| Spezialmodelle | Item-Definitionen beschreiben Truhen, Shulkerkisten, Banner, Schilde, Köpfe, Krüge und mehr als `minecraft:special`-Modelle, die per `transformation` platziert werden. `src/entities/specials.ts` ordnet sie den Modell-Layern und Texturen des Spiels zu, inklusive Banner-/Schildmustern und Krugscherben. |
| Rüstungsbesätze | Besatz-Texturen auf Items haben keine eigene Datei. Das Spiel erzeugt sie für seinen Item-Atlas (`paletted_permutations` in `atlases/items.json`), indem es eine Vorlage mit einer Palette umfärbt. `src/models/atlasPermutations.ts` liest diese Atlas-Einträge, auch die eines Packs, und wiederholt das Umfärben. Die Item-Details zeigen stattdessen Vorlage und Paletten zum Bearbeiten. |
| Editoren | `src/render/pixelEdit.ts` und `src/sounds/audioEdit.ts` enthalten die Bearbeitungsfunktionen auf rohen Pixeln und Samples (ohne Browser getestet). Während eine Textur bearbeitet wird, schreibt `previewTexture` die Pixel in die dekodierte Textur, die die 3D-Ansichten schon nutzen, sodass sie sich ohne Neuaufbau aktualisieren. Sounds werden mit dem Ogg-Vorbis-Encoder aus [wasm-media-encoders](https://github.com/arseneyr/wasm-media-encoders) (MIT) kodiert, der beim ersten Speichern geladen wird; Filter, Hall und Kompressor laufen in einem `OfflineAudioContext`. |
| Automatisch speichern | `src/state/session.ts`: Das Original-ZIP und deine Änderungen liegen in IndexedDB und werden auf der Startseite zum Fortsetzen angeboten. |
| Sprachen | `src/i18n/`: Texte pro Sprache, typgeprüfte Schlüssel, Plurale über `Intl.PluralRules`. Item- und Mob-Namen kommen aus Minecrafts Sprachdatei (über denselben Proxy wie die Sounds, mit Englisch als Rückfall). |

## Entwicklung

```sh
npm run dev       # Dev-Server mit Hot Reload
npm test          # Unit-Tests (Vitest)
npm run test:e2e  # End-to-End-Tests in Chromium (Playwright; einmalig: npx playwright install chromium,
                  # oder ein installiertes Google Chrome mit PW_CHANNEL=chrome)
npm run build     # Typecheck + Produktions-Build nach dist/
npm run serve     # dist/ inkl. Sound-Proxy ausliefern (Port 8080)
npm run package   # Release-ZIP nach release/
```

Jeder Push prüft Typen, Tests und Build auf Node 20, 22 und 26 (siehe [`.github/workflows/ci.yml`](.github/workflows/ci.yml)), lässt die End-to-End-Tests in Chromium und den Resolver-Test gegen die echte client.jar laufen. Einmal pro Woche läuft derselbe Test gegen die neueste Minecraft-Version, damit Spiel-Updates, die etwas kaputtmachen, früh auffallen.

Den Resolver gegen eine echte client.jar prüfen:

```sh
MC_JAR=/pfad/zur/client.jar npx vitest run vanilla
```

## Grenzen

- Die Mob-Animationen sind eine vereinfachte Vorschau (Kopf, Beine, Arme, Flügel, Schwänze), nicht die genauen Bewegungen des Spiels. Zustände wie wütende Wölfe, angreifende Plagegeister oder eine offene Shulker-Schale fehlen (ihre Texturen findest du im Texturen-Browser).
- Bannermuster und Töpferscherben sind nur eine Vorschau: Im Spiel stehen sie am Item und gehören deshalb nicht zum exportierten Pack (ihre Texturen schon).
- Im Pflanzen-Tab steht jede Pflanze in einer Haltung: Ranken an einer Seite, Tropfblätter nicht gekippt. Laubstreu ist noch nicht wie im Wald gefärbt.
- Bewegungen in der Hand (Essen, Bogen spannen, Blocken) stecken im Spielcode und nicht im Pack, deshalb sind sie nicht animiert; die Modelle dieser Zustände lassen sich aber ansehen.
- Block-Sounds kommen direkt aus dem Spiel; bei Items und Mobs ordnet der Editor nach dem Sound-Namen zu (`entity.wolf_angry.*` → Wolf). Sounds, die ein Mob oder Item unter einem ganz anderen Namen spielt, fehlen deshalb.
- Das Mikrofon funktioniert nur über `localhost`/`127.0.0.1` oder https. Öffnest du den Editor von einem anderen Gerät im LAN (`--host 0.0.0.0`), blockiert der Browser die Aufnahme.
- Beim Bearbeiten eines flachen Items (Schwert, Apfel …) ändern sich die Farben live in 3D, die Seiten des Items folgen neu gemalten oder radierten Pixeln aber erst nach dem Speichern.
- HUD und Inventare nutzen das Vanilla-Layout; ein Pack kann GUI-Elemente nicht verschieben, nur ihr Aussehen ändern. Zeichen aus TrueType- oder Unifont-Quellen zeichnet die Schrift-Vorschau ersatzweise.
- Bedrock Edition wird nicht unterstützt.

## Rechtliches

Kein offizielles Minecraft-Produkt, nicht von Mojang oder Microsoft genehmigt oder mit ihnen verbunden. „Minecraft“ ist eine Marke von Mojang AB.

Das Repository enthält keine Minecraft-Texturen, -Sounds oder -Programmdateien. Diese lädt der Browser zur Laufzeit von Mojangs offiziellen Servern. `src/entities/entityModels.json` enthält nur Geometriedaten (Quadermaße und UV-Koordinaten) der Vanilla-Mob-Modelle, damit die Mobs dargestellt werden können.

Code unter [MIT-Lizenz](LICENSE). Das Release-ZIP enthält `THIRD_PARTY_LICENSES.txt` mit den Lizenzen der mitgelieferten Bibliotheken (alle frei: MIT, BSD, ISC, Apache-2.0, Zlib), inklusive libogg/libvorbis im Ogg-Vorbis-Encoder.
