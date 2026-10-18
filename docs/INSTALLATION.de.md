# Installation und Betrieb

[English](INSTALLATION.md) · **Deutsch**

Diese Anleitung erklärt Schritt für Schritt, wie du den Minecraft Resource Pack Editor auf Windows, macOS oder Linux installierst, startest, aktualisierst und auf einem Server betreibst. Am Ende stehen Lösungen für typische Probleme.

**Inhalt**

1. [Welcher Weg passt zu mir?](#1-welcher-weg-passt-zu-mir)
2. [Voraussetzungen](#2-voraussetzungen)
3. [Node.js installieren](#3-nodejs-installieren)
4. [Variante A: Fertiges Release (empfohlen)](#4-variante-a-fertiges-release-empfohlen)
5. [Variante B: Aus dem Quellcode](#5-variante-b-aus-dem-quellcode)
6. [Variante C: Auf einem Server oder im Heimnetz](#6-variante-c-auf-einem-server-oder-im-heimnetz)
7. [Erster Start in der App](#7-erster-start-in-der-app)
8. [Das bearbeitete Pack in Minecraft verwenden](#8-das-bearbeitete-pack-in-minecraft-verwenden)
9. [Aktualisieren](#9-aktualisieren)
10. [Mob-Modelle für eine neue Minecraft-Version erzeugen](#10-mob-modelle-für-eine-neue-minecraft-version-erzeugen)
11. [Fehlerbehebung](#11-fehlerbehebung)
12. [Deinstallation](#12-deinstallation)

---

## 1. Welcher Weg passt zu mir?

| Du möchtest … | Weg |
| --- | --- |
| den Editor einfach benutzen | **[A: Release-ZIP](#4-variante-a-fertiges-release-empfohlen)**, nur Node.js nötig |
| am Code mitarbeiten oder die neueste Version | **[B: Quellcode](#5-variante-b-aus-dem-quellcode)**, Node.js und Git |
| den Editor für mehrere Leute im Netz bereitstellen | **[C: Server](#6-variante-c-auf-einem-server-oder-im-heimnetz)** |

Der Editor läuft immer im Browser. Node.js liefert nur die Seite aus und leitet Sound-Anfragen an Mojang weiter (siehe [Warum ein Proxy?](#warum-braucht-es-einen-proxy-für-sounds)).

## 2. Voraussetzungen

| | Minimum | Hinweis |
| --- | --- | --- |
| **Node.js** | 18.18 | Empfohlen: aktuelle LTS-Version (20 oder 22) |
| **Browser** | aktuelles Chrome, Edge, Firefox oder Opera | WebGL muss aktiv sein. Safari ist nicht getestet und spielt `.ogg`-Sounds je nach Version nicht ab. |
| **Speicher** | ca. 100 MB frei im Browser-Speicher | für die Vanilla-Dateien pro Minecraft-Version |
| **Internet** | beim ersten Öffnen einer Version | lädt die client.jar (~40 MB) von Mojang, danach aus dem Cache |
| **Git** | nur für Variante B | |
| **Java (JDK)** | nur für [Abschnitt 10](#10-mob-modelle-für-eine-neue-minecraft-version-erzeugen) | Version wie das Spiel (26.x: Java 25) |

Minecraft selbst muss **nicht** installiert sein.

## 3. Node.js installieren

Prüfe zuerst, ob Node.js schon da ist. Öffne ein Terminal (Windows: *PowerShell*, macOS: *Terminal*, Linux: Terminal deiner Wahl):

```sh
node -v
```

Zeigt das `v18.18.0` oder höher, bist du fertig und kannst diesen Abschnitt überspringen.

### Windows

- **Installer:** Auf https://nodejs.org die **LTS**-Version herunterladen, den `.msi`-Installer ausführen und die Standardoptionen übernehmen.
- **Oder per winget** (in PowerShell):
  ```powershell
  winget install OpenJS.NodeJS.LTS
  ```

Danach das Terminal **neu öffnen**, damit `node` gefunden wird.

### macOS

- **Installer:** Auf https://nodejs.org das `.pkg` der LTS-Version herunterladen und installieren.
- **Oder per Homebrew:**
  ```sh
  brew install node
  ```

### Linux

Die Pakete der Distributionen sind oft veraltet. Am zuverlässigsten ist **nvm**:

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# Terminal neu öffnen, dann:
nvm install --lts
```

Alternativ gibt es die offiziellen Pakete für Debian/Ubuntu/Fedora unter https://nodejs.org/en/download/package-manager.

## 4. Variante A: Fertiges Release (empfohlen)

1. Öffne die **[Releases-Seite](https://github.com/keksi2k/minecraft-resourcepack-editor/releases)** und lade beim neuesten Release `minecraft-resourcepack-editor-<version>.zip` herunter.
2. **Entpacke** das ZIP an einen beliebigen Ort, z. B. in deinen Dokumente-Ordner.
3. Öffne ein Terminal **im entpackten Ordner** `minecraft-resourcepack-editor-<version>`:
   - **Windows:** Ordner im Explorer öffnen, mit Rechtsklick auf eine freie Stelle *„In Terminal öffnen“* wählen. Alternativ in die Adressleiste `powershell` tippen und Enter drücken.
   - **macOS:** Im Finder Rechtsklick auf den Ordner → *Dienste* → *„Neues Terminal beim Ordner“*. Alternativ `cd ` tippen und den Ordner ins Terminal ziehen.
   - **Linux:** Rechtsklick im Dateimanager → *„Im Terminal öffnen“* oder `cd /pfad/zum/ordner`.
4. Starte den Editor:
   ```sh
   node serve.mjs
   ```
   Es erscheint `Resource Pack Editor running at http://127.0.0.1:8080`.
5. Öffne **http://127.0.0.1:8080** im Browser.

Zum **Beenden** im Terminal `Strg + C` drücken (macOS: `Control + C`).

### Optionen

| Option | Bedeutung | Beispiel |
| --- | --- | --- |
| `--port <zahl>` | anderer Port (Standard 8080) | `node serve.mjs --port 3000` |
| `--host <adresse>` | Netzwerkadresse (Standard `127.0.0.1` = nur dieser Rechner) | `node serve.mjs --host 0.0.0.0` |
| `--dir <ordner>` | anderer Ordner mit den Dateien | `node serve.mjs --dir ./dist` |

Statt der Optionen kannst du auch die Umgebungsvariablen `PORT`, `HOST` und `DIR` setzen.

### Schneller starten

- **Windows:** Im Ordner liegt eine **`Start.bat`**. Ein Doppelklick prüft, ob Node.js installiert ist, startet den Server und öffnet den Browser. Mit `Start.bat 3000` wählst du einen anderen Port. Bei einem Fehler bleibt das Fenster offen, damit du die Meldung lesen kannst.
  > Beim ersten Start zeigt Windows eventuell *„Der Computer wurde durch Windows geschützt“* (SmartScreen), weil die Datei aus dem Internet stammt. Mit *Weitere Informationen → Trotzdem ausführen* geht es weiter. Alternativ vorher Rechtsklick auf die Datei → *Eigenschaften* → *Zulassen* anhaken.
- **macOS/Linux:** Lege eine Datei `start.sh` an mit
  ```sh
  #!/bin/sh
  cd "$(dirname "$0")"
  (sleep 1 && (xdg-open http://127.0.0.1:8080 || open http://127.0.0.1:8080)) >/dev/null 2>&1 &
  node serve.mjs
  ```
  und mache sie mit `chmod +x start.sh` ausführbar.

## 5. Variante B: Aus dem Quellcode

### Git installieren

- **Windows:** https://git-scm.com/download/win oder `winget install Git.Git`
- **macOS:** `xcode-select --install` oder `brew install git`
- **Linux:** `sudo apt install git` bzw. `sudo dnf install git`

### Herunterladen und starten

```sh
git clone https://github.com/keksi2k/minecraft-resourcepack-editor.git
cd minecraft-resourcepack-editor
npm ci            # installiert die Abhängigkeiten genau wie in package-lock.json
npm run dev
```

Öffne **http://localhost:5173**. Unter Windows geht es auch ohne Terminal: Ein Doppelklick auf **`Start.bat`** im Repo-Ordner installiert beim ersten Mal die Abhängigkeiten, baut die App und startet sie auf http://127.0.0.1:8080. Nach einem `git pull` den Ordner `dist` löschen, damit neu gebaut wird.

Im Dev-Modus werden Änderungen am Code sofort im Browser sichtbar. Den Sound-Proxy liefert der Dev-Server automatisch mit.

### Produktions-Build

```sh
npm run build     # Typecheck und optimierter Build nach dist/
npm run serve     # liefert dist/ inkl. Sound-Proxy auf http://127.0.0.1:8080 aus
```

`npm start` macht beides in einem Schritt. Mit `npm run serve -- --port 3000 --host 0.0.0.0` reichst du Optionen durch.

### Weitere Befehle

| Befehl | Zweck |
| --- | --- |
| `npm test` | Unit-Tests ausführen |
| `npm run package` | Release-ZIP nach `release/` bauen (wie in Variante A) |
| `npm run mc:fetch` / `npm run mc:models` | siehe [Abschnitt 10](#10-mob-modelle-für-eine-neue-minecraft-version-erzeugen) |

## 6. Variante C: Auf einem Server oder im Heimnetz

### Im Heimnetz (z. B. für andere PCs oder ein Tablet)

```sh
node serve.mjs --host 0.0.0.0 --port 8080
```

Andere Geräte erreichen den Editor dann über `http://<IP-deines-Rechners>:8080`. Die IP findest du unter Windows mit `ipconfig` und unter macOS/Linux mit `ip addr` bzw. `ifconfig`. Eventuell musst du den Port in der Firewall freigeben.

> **Sicherheit:** Der Editor hat keine Anmeldung. Das ist unkritisch, denn jede Person arbeitet nur mit den Dateien in ihrem eigenen Browser, und auf dem Server wird nichts gespeichert. Der eingebaute Proxy leitet nur Anfragen der Form `/mcres/<xx>/<40-stelliger-hash>` an Mojang weiter und ist **kein** offener Proxy.

### Dauerhaft mit systemd (Linux)

1. Release nach `/opt/resourcepack-editor` entpacken.
2. Datei `/etc/systemd/system/resourcepack-editor.service` anlegen:
   ```ini
   [Unit]
   Description=Minecraft Resource Pack Editor
   After=network-online.target

   [Service]
   ExecStart=/usr/bin/node /opt/resourcepack-editor/serve.mjs --host 127.0.0.1 --port 8080
   Restart=on-failure
   DynamicUser=yes

   [Install]
   WantedBy=multi-user.target
   ```
3. Aktivieren:
   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable --now resourcepack-editor
   ```

### Hinter nginx (mit eigener Domain/HTTPS)

Den Node-Server auf `127.0.0.1:8080` laufen lassen und nginx davorschalten:

```nginx
server {
    listen 443 ssl;
    server_name editor.example.org;
    # ssl_certificate … (z. B. mit certbot)

    location / {
        proxy_pass http://127.0.0.1:8080;
    }
}
```

### Docker

Eine `Dockerfile` im entpackten Release-Ordner:

```dockerfile
FROM node:22-alpine
WORKDIR /app
COPY . .
EXPOSE 8080
CMD ["node", "serve.mjs", "--host", "0.0.0.0", "--port", "8080"]
```

```sh
docker build -t resourcepack-editor .
docker run -d -p 8080:8080 --name resourcepack-editor resourcepack-editor
```

### Rein statisches Hosting (GitHub Pages, Netlify, Webspace …)

Der Inhalt von `dist/` lässt sich auf jeden Webspace legen. **Ohne Proxy funktionieren dann aber die Vanilla-Sounds nicht.** Texturen, Modelle, Mobs und Pack-Sounds gehen trotzdem. Es gibt drei Möglichkeiten:

1. **Eigenen Proxy angeben** und beim Build einbauen:
   ```sh
   VITE_RESOURCES_BASE=https://mein-proxy.example.org npm run build
   ```
   Unter Windows (PowerShell): `$env:VITE_RESOURCES_BASE="https://…"; npm run build`
2. **Proxy-URL in der App setzen:** Im Sounds-Tab erscheint bei fehlenden Sounds ein Eingabefeld dafür. Die Einstellung wird im Browser gespeichert.
3. **Lokalen Ordner nutzen:** Ist Minecraft installiert, im Sounds-Tab *„.minecraft/assets-Ordner wählen“* klicken. Die Sounds kommen dann von der Festplatte.

Ein minimaler Proxy als **Cloudflare Worker** (kostenloser Tarif reicht):

```js
export default {
  async fetch(req) {
    const m = new URL(req.url).pathname.match(/^\/([0-9a-f]{2})\/([0-9a-f]{40})$/);
    if (!m || m[1] !== m[2].slice(0, 2)) return new Response('Not found', { status: 404 });
    const res = await fetch(`https://resources.download.minecraft.net/${m[1]}/${m[2]}`, { cf: { cacheEverything: true } });
    const out = new Response(res.body, res);
    out.headers.set('Access-Control-Allow-Origin', '*');
    out.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    return out;
  },
};
```

Die Worker-URL (z. B. `https://mcres.dein-name.workers.dev`) dann als `VITE_RESOURCES_BASE` verwenden.

### Warum braucht es einen Proxy für Sounds?

Browser dürfen Daten von fremden Servern nur laden, wenn diese es per CORS-Header erlauben. Mojangs Server für Versionsliste und client.jar (`piston-meta`/`piston-data.mojang.com`) tun das. Der Server für Sounds (`resources.download.minecraft.net`) tut es **nicht**. Deshalb läuft diese eine Art von Anfragen über den eigenen Server.

## 7. Erster Start in der App

1. **Resourcepack laden:** Die `.zip` auf die Startseite ziehen oder anklicken und auswählen. Packs, die in einem Unterordner gezippt sind, werden erkannt.
2. **Version prüfen:** Der Editor schlägt anhand von `pack_format` eine Minecraft-Version vor. Wähle die Version, für die dein Pack gedacht ist. Mit *„Snapshots zeigen“* stehen auch Snapshots zur Auswahl.
3. **Pack öffnen:** Beim ersten Mal pro Version lädt der Browser die client.jar (~40 MB). Das dauert je nach Leitung 10–60 Sekunden. Danach liegt sie im Browser-Speicher und der Start dauert nur noch Sekunden.
4. Ohne eigenes Pack: **„Neues Pack erstellen“** startet mit einem leeren Pack auf Vanilla-Basis.
5. **Sprache:** Oben rechts lässt sich zwischen Deutsch und Englisch wechseln. Beim ersten Start gilt die Sprache des Browsers.
6. **Automatisch speichern:** Deine Änderungen werden laufend im Browser gespeichert. Lädst du die Seite neu oder stürzt der Browser ab, bietet die Startseite *„Fortsetzen“* an. *„Schließen“* in der Kopfzeile verwirft die Sitzung, also vorher exportieren.

Bedeutung der Farben: **blauer Rahmen/„Pack“** = vom geladenen Pack verändert, **orange/„Bearbeitet“** = von dir geändert, **„Vanilla“** = Original.

## 8. Das bearbeitete Pack in Minecraft verwenden

1. In der App **„Pack exportieren“** klicken. Das ZIP landet in deinem Download-Ordner.
2. Das ZIP in den Resourcepack-Ordner von Minecraft kopieren (nicht entpacken):
   - **Windows:** `%APPDATA%\.minecraft\resourcepacks` (in die Explorer-Adressleiste einfügen)
   - **macOS:** `~/Library/Application Support/minecraft/resourcepacks`
   - **Linux:** `~/.minecraft/resourcepacks`
   - Bei anderen Launchern (Prism, MultiMC, CurseForge, Modrinth): Instanz öffnen → Ordner *resourcepacks*
3. In Minecraft: *Optionen → Ressourcenpakete* → Pack nach rechts schieben → *Fertig*.

Tipp: Liegt das Pack schon im Ordner, reicht im Spiel `F3 + T` zum Neuladen, nachdem du die Datei ersetzt hast.

## 9. Aktualisieren

- **Release (Variante A):** Das neue ZIP herunterladen und entpacken, den alten Ordner löschen. Deine Daten liegen im Browser und bleiben erhalten.
- **Quellcode (Variante B):**
  ```sh
  git pull
  npm ci
  npm run build   # falls du mit serve arbeitest
  ```

> Änderungen werden im Browser gespeichert und überstehen ein Neuladen, sind aber an diesen Browser und die Adresse (z. B. `127.0.0.1:8080`) gebunden. Exportiere dein Pack sicherheitshalber, bevor du aktualisierst.

## 10. Mob-Modelle für eine neue Minecraft-Version erzeugen

Item- und Block-Modelle liest der Editor immer direkt aus der gewählten Version. **Mob-Modelle** stehen dagegen im Programmcode von Minecraft und werden einmalig als `src/entities/entityModels.json` erzeugt. Das ist nur nötig, wenn Mojang Mob-Modelle ändert und du am Quellcode arbeitest (Variante B).

**Voraussetzung:** ein **JDK** (nicht nur JRE) in der Version, die das Spiel verlangt. Für 26.x ist das Java 25. Download z. B. bei https://adoptium.net, oder per `winget install EclipseAdoptium.Temurin.25.JDK` bzw. `brew install --cask temurin`. Prüfen mit `java -version`.

```sh
npm run mc:fetch -- 26.3              # client.jar + Bibliotheken nach .mc/26.3/ laden (offizielle Mojang-Server)
npm run mc:models -- 26.3             # alle vorhandenen Mob-Modelle neu erzeugen
npm run mc:models -- 26.3 --list      # alle Modell-Layer des Spiels auflisten
npm run mc:models -- 26.3 minecraft:goat#main   # weitere Layer hinzufügen
```

Ein neu hinzugefügter Layer erscheint erst in der App, wenn er in `src/entities/catalog.ts` einem Mob mit Textur zugeordnet ist. Der Ordner `.mc/` ist von Git ausgeschlossen.

## 11. Fehlerbehebung

**`node` wird nicht gefunden / „Der Begriff 'node' wurde nicht erkannt“**
Node.js ist nicht installiert oder das Terminal war schon vor der Installation offen. Terminal schließen und neu öffnen, dann `node -v` prüfen.

**`SyntaxError` oder ähnliche Fehler beim Start von `serve.mjs`**
Node.js ist zu alt. `node -v` muss mindestens `v18.18.0` zeigen.

**`EADDRINUSE: address already in use`**
Der Port ist belegt, oft durch einen noch laufenden Editor. Entweder das andere Terminal schließen oder einen anderen Port nehmen: `node serve.mjs --port 8081`.

**„Mojang-Versionsliste nicht erreichbar“ / client.jar lädt nicht**
Der Browser erreicht `piston-meta.mojang.com` bzw. `piston-data.mojang.com` nicht. Internetverbindung, Firmen-Firewall, Adblocker oder Pi-hole prüfen.

**Vanilla-Sounds spielen nicht („Kein Sound-Proxy konfiguriert“ / „HTTP 404“)**
Die Seite läuft ohne Proxy, etwa über `python -m http.server`, einen anderen Webserver oder einen Webspace. Lösung: über `node serve.mjs` bzw. `npm run dev` starten oder einen Proxy einrichten (siehe [Statisches Hosting](#rein-statisches-hosting-github-pages-netlify-webspace-)).

**Ein Sound spielt in Safari nicht**
Je nach Version unterstützt Safari Ogg Vorbis nicht oder nur eingeschränkt. Chrome, Edge oder Firefox verwenden.

**„Keine Ogg-Datei“ / „Ogg Opus“ beim Hinzufügen eines Sounds**
Minecraft spielt nur **Ogg Vorbis** ab. In Audacity: *Datei → Exportieren → Als OGG exportieren*. Mit ffmpeg: `ffmpeg -i sound.mp3 -c:a libvorbis -ac 1 sound.ogg` (`-ac 1` = Mono).

**Hinweis „Die Datei ist Stereo“**
Stereo-Sounds spielt Minecraft ohne Richtung und ohne Entfernungsabfall ab. Für Schritte, Mob-Geräusche usw. die Datei in Mono umwandeln (siehe oben).

**Vorschaubilder bleiben leer oder schwarz**
WebGL ist deaktiviert. In Chrome/Edge unter *Einstellungen → System* die *Hardwarebeschleunigung* einschalten und den Browser neu starten. Unter `chrome://gpu` lässt sich der Status prüfen.

**„passt evtl. nicht zur Version“ in der Kopfzeile**
Das `pack_format` des Packs passt nicht genau zur gewählten Version. Meist ist das harmlos. Für eine exakte Darstellung die Version wählen, für die das Pack gebaut wurde.

**Browser-Speicher voll / Cache leeren**
Pro geöffneter Minecraft-Version werden ca. 20–40 MB gespeichert. So löschst du den Cache: Entwicklertools öffnen (`F12`) → *Anwendung/Application* (Firefox: *Web-Speicher*) → *IndexedDB* → `keyval-store` löschen. Oder in den Website-Einstellungen *„Daten löschen“* für die Adresse des Editors.

**Item- und Mob-Namen sind englisch, obwohl Deutsch eingestellt ist**
Nur die englischen Namen stecken in der client.jar. Die deutschen kommen aus Minecrafts Sprachdatei, die auf demselben Server wie die Sounds liegt und deshalb ebenfalls den Proxy braucht. Wenn Vanilla-Sounds funktionieren, funktionieren auch die übersetzten Namen. Die Oberfläche selbst ist davon nicht betroffen.

**Seite lädt nach einem Update alte Dateien**
Hartes Neuladen mit `Strg + F5` (macOS: `Cmd + Shift + R`).

**Mob-Export: `ClassNotFoundException` oder `UnsupportedClassVersionError`**
Bei `ClassNotFoundException` fehlen Bibliotheken: `npm run mc:fetch -- <version>` erneut ausführen. Bei `UnsupportedClassVersionError` ist das JDK zu alt (siehe [Abschnitt 10](#10-mob-modelle-für-eine-neue-minecraft-version-erzeugen)).

Ein Problem, das hier nicht steht? Öffne ein [Issue](https://github.com/keksi2k/minecraft-resourcepack-editor/issues) mit Betriebssystem, Browser, Minecraft-Version und der Fehlermeldung. Schicke dabei keine Packs mit, die dir nicht gehören.

## 12. Deinstallation

1. Den Server mit `Strg + C` beenden und den Ordner des Editors löschen.
2. Optional den Browser-Speicher leeren (siehe [Cache leeren](#11-fehlerbehebung)).
3. Node.js kann bleiben oder über die Systemsteuerung, `brew uninstall node` bzw. `nvm uninstall` entfernt werden.

Der Editor legt außerhalb seines Ordners und des Browser-Speichers keine Dateien an.
