# Installation and operation

**English** · [Deutsch](INSTALLATION.de.md)

This guide explains step by step how to install, start, update and host the Minecraft Resource Pack Editor on Windows, macOS or Linux. Solutions for common problems are at the end.

**Contents**

1. [Which option suits me?](#1-which-option-suits-me)
2. [Requirements](#2-requirements)
3. [Installing Node.js](#3-installing-nodejs)
4. [Option A: Prebuilt release (recommended)](#4-option-a-prebuilt-release-recommended)
5. [Option B: From source](#5-option-b-from-source)
6. [Option C: On a server or your home network](#6-option-c-on-a-server-or-your-home-network)
7. [First start in the app](#7-first-start-in-the-app)
8. [Using the edited pack in Minecraft](#8-using-the-edited-pack-in-minecraft)
9. [Updating](#9-updating)
10. [Generating mob models for a new Minecraft version](#10-generating-mob-models-for-a-new-minecraft-version)
11. [Troubleshooting](#11-troubleshooting)
12. [Uninstalling](#12-uninstalling)

---

## 1. Which option suits me?

| You want to … | Option |
| --- | --- |
| just use the editor | **[A: Release ZIP](#4-option-a-prebuilt-release-recommended)**, only Node.js needed |
| work on the code or run the latest version | **[B: Source](#5-option-b-from-source)**, Node.js and Git |
| provide the editor to several people on a network | **[C: Server](#6-option-c-on-a-server-or-your-home-network)** |

The editor always runs in the browser. Node.js only serves the page and forwards sound requests to Mojang (see [Why a proxy?](#why-do-sounds-need-a-proxy)).

## 2. Requirements

| | Minimum | Note |
| --- | --- | --- |
| **Node.js** | 18.18 | Recommended: current LTS (20 or 22) |
| **Browser** | current Chrome, Edge, Firefox or Opera | WebGL must be enabled. Safari is untested and, depending on the version, doesn't play `.ogg` sounds. |
| **Storage** | about 100 MB free browser storage | for the vanilla files per Minecraft version |
| **Internet** | the first time you open a version | downloads the client.jar (~40 MB) from Mojang, cached afterwards |
| **Git** | only for option B | |
| **Java (JDK)** | only for [section 10](#10-generating-mob-models-for-a-new-minecraft-version) | the version the game needs (26.x: Java 25) |

Minecraft itself does **not** need to be installed.

## 3. Installing Node.js

First check whether Node.js is already installed. Open a terminal (Windows: *PowerShell*, macOS: *Terminal*, Linux: any terminal):

```sh
node -v
```

If it shows `v18.18.0` or higher, you're done and can skip this section.

### Windows

- **Installer:** download the **LTS** version from https://nodejs.org, run the `.msi` installer and keep the default options.
- **Or with winget** (in PowerShell):
  ```powershell
  winget install OpenJS.NodeJS.LTS
  ```

Then **reopen** the terminal so `node` is found.

### macOS

- **Installer:** download the LTS `.pkg` from https://nodejs.org and install it.
- **Or with Homebrew:**
  ```sh
  brew install node
  ```

### Linux

Distribution packages are often outdated. The most reliable way is **nvm**:

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
# reopen the terminal, then:
nvm install --lts
```

Official packages for Debian/Ubuntu/Fedora are listed at https://nodejs.org/en/download/package-manager.

## 4. Option A: Prebuilt release (recommended)

1. Open the **[releases page](https://github.com/keksi2k/minecraft-resourcepack-editor/releases)** and download `minecraft-resourcepack-editor-<version>.zip` from the latest release.
2. **Extract** the ZIP anywhere, e.g. into your Documents folder.
3. Open a terminal **in the extracted folder** `minecraft-resourcepack-editor-<version>`:
   - **Windows:** open the folder in Explorer, right-click an empty spot and choose *“Open in Terminal”*. Alternatively type `powershell` into the address bar and press Enter.
   - **macOS:** in Finder, right-click the folder → *Services* → *“New Terminal at Folder”*. Alternatively type `cd ` and drag the folder into the terminal.
   - **Linux:** right-click in the file manager → *“Open in Terminal”*, or `cd /path/to/folder`.
4. Start the editor:
   ```sh
   node serve.mjs
   ```
   You'll see `Resource Pack Editor running at http://127.0.0.1:8080`.
5. Open **http://127.0.0.1:8080** in your browser.

To **stop** it, press `Ctrl + C` in the terminal (macOS: `Control + C`).

### Options

| Option | Meaning | Example |
| --- | --- | --- |
| `--port <number>` | another port (default 8080) | `node serve.mjs --port 3000` |
| `--host <address>` | network address (default `127.0.0.1` = this computer only) | `node serve.mjs --host 0.0.0.0` |
| `--dir <folder>` | another folder with the files | `node serve.mjs --dir ./dist` |

Instead of the options you can set the environment variables `PORT`, `HOST` and `DIR`.

### Starting faster

- **Windows:** the folder contains a **`Start.bat`**. Double-clicking it checks that Node.js is installed, starts the server and opens the browser. `Start.bat 3000` uses another port. If something goes wrong, the window stays open so you can read the message.
  > On the first start Windows may show *“Windows protected your PC”* (SmartScreen), because the file comes from the internet. Click *More info → Run anyway*. Alternatively right-click the file beforehand → *Properties* → tick *Unblock*.
- **macOS/Linux:** create a file `start.sh` containing
  ```sh
  #!/bin/sh
  cd "$(dirname "$0")"
  (sleep 1 && (xdg-open http://127.0.0.1:8080 || open http://127.0.0.1:8080)) >/dev/null 2>&1 &
  node serve.mjs
  ```
  and make it executable with `chmod +x start.sh`.

## 5. Option B: From source

### Installing Git

- **Windows:** https://git-scm.com/download/win or `winget install Git.Git`
- **macOS:** `xcode-select --install` or `brew install git`
- **Linux:** `sudo apt install git` or `sudo dnf install git`

### Download and start

```sh
git clone https://github.com/keksi2k/minecraft-resourcepack-editor.git
cd minecraft-resourcepack-editor
npm ci            # installs dependencies exactly as in package-lock.json
npm run dev
```

Open **http://localhost:5173**. On Windows this also works without a terminal: double-clicking **`Start.bat`** in the repository folder installs the dependencies on first run, builds the app and starts it at http://127.0.0.1:8080. After a `git pull`, delete the `dist` folder so it gets rebuilt.

In dev mode, code changes show up in the browser immediately. The dev server includes the sound proxy.

### Production build

```sh
npm run build     # type check and optimised build to dist/
npm run serve     # serves dist/ including the sound proxy at http://127.0.0.1:8080
```

`npm start` does both in one step. Pass options with `npm run serve -- --port 3000 --host 0.0.0.0`.

### More commands

| Command | Purpose |
| --- | --- |
| `npm test` | run the unit tests |
| `npm run package` | build the release ZIP to `release/` (as in option A) |
| `npm run mc:fetch` / `npm run mc:models` | see [section 10](#10-generating-mob-models-for-a-new-minecraft-version) |

## 6. Option C: On a server or your home network

### On your home network (e.g. for other PCs or a tablet)

```sh
node serve.mjs --host 0.0.0.0 --port 8080
```

Other devices then reach the editor at `http://<your-computer's-IP>:8080`. Find the IP with `ipconfig` on Windows or `ip addr` / `ifconfig` on macOS/Linux. You may have to allow the port in your firewall.

> **Security:** the editor has no login. That's fine, because everyone only works with the files in their own browser and nothing is stored on the server. The built-in proxy only forwards requests of the form `/mcres/<xx>/<40-character-hash>` to Mojang and is **not** an open proxy.

### Permanently with systemd (Linux)

1. Extract the release to `/opt/resourcepack-editor`.
2. Create `/etc/systemd/system/resourcepack-editor.service`:
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
3. Enable it:
   ```sh
   sudo systemctl daemon-reload
   sudo systemctl enable --now resourcepack-editor
   ```

### Behind nginx (with your own domain/HTTPS)

Run the Node server on `127.0.0.1:8080` and put nginx in front of it:

```nginx
server {
    listen 443 ssl;
    server_name editor.example.org;
    # ssl_certificate … (e.g. with certbot)

    location / {
        proxy_pass http://127.0.0.1:8080;
    }
}
```

### Docker

A `Dockerfile` in the extracted release folder:

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

### Purely static hosting (GitHub Pages, Netlify, web space …)

The contents of `dist/` can go on any web space. **Without a proxy, though, vanilla sounds don't work.** Textures, models, mobs and pack sounds still do. There are three ways around it:

1. **Set your own proxy** at build time:
   ```sh
   VITE_RESOURCES_BASE=https://my-proxy.example.org npm run build
   ```
   On Windows (PowerShell): `$env:VITE_RESOURCES_BASE="https://…"; npm run build`
2. **Set the proxy URL in the app:** when sounds are missing, the Sounds tab shows an input field for it. The setting is saved in the browser.
3. **Use a local folder:** if Minecraft is installed, click *“Choose .minecraft/assets folder”* in the Sounds tab. The sounds are then read from disk.

A minimal proxy as a **Cloudflare Worker** (the free plan is enough):

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

Then use the worker URL (e.g. `https://mcres.your-name.workers.dev`) as `VITE_RESOURCES_BASE`.

### Why do sounds need a proxy?

Browsers may only load data from other servers if those servers allow it with CORS headers. Mojang's servers for the version list and client.jar (`piston-meta`/`piston-data.mojang.com`) do. The sound server (`resources.download.minecraft.net`) does **not**. That's why this one kind of request goes through your own server. Translated item and mob names live on the same server, so they need the proxy too.

## 7. First start in the app

1. **Load a resource pack:** drop the `.zip` onto the start page, or click and choose it. Packs zipped inside a subfolder are detected.
2. **Check the version:** the editor suggests a Minecraft version from `pack_format`. Pick the version your pack is made for. *“Show snapshots”* adds snapshots to the list.
3. **Open pack:** the first time per version, the browser downloads the client.jar (~40 MB). Depending on your connection that takes 10–60 seconds. After that it's in browser storage and starting takes only seconds.
4. Without a pack of your own: **“Create new pack”** starts with an empty pack on top of vanilla.
5. **Language:** switch between English and German at the top right. On first start the browser's language is used.
6. **Autosave:** your changes are saved in the browser as you go. If you reload the page or the browser crashes, the start page offers *“Continue”*. *“Close”* in the header discards the session, so export first.

Colour meaning: **blue frame/“Pack”** = changed by the loaded pack, **orange/“Edited”** = changed by you, **“Vanilla”** = original.

## 8. Using the edited pack in Minecraft

1. Click **“Export pack”** in the app. The ZIP lands in your downloads folder.
2. Copy the ZIP into Minecraft's resource pack folder (don't extract it):
   - **Windows:** `%APPDATA%\.minecraft\resourcepacks` (paste into the Explorer address bar)
   - **macOS:** `~/Library/Application Support/minecraft/resourcepacks`
   - **Linux:** `~/.minecraft/resourcepacks`
   - Other launchers (Prism, MultiMC, CurseForge, Modrinth): open the instance → *resourcepacks* folder
3. In Minecraft: *Options → Resource Packs* → move the pack to the right → *Done*.

Tip: if the pack is already in the folder, `F3 + T` in game reloads it after you've replaced the file.

## 9. Updating

- **Release (option A):** download and extract the new ZIP, delete the old folder. Your data lives in the browser and is kept.
- **Source (option B):**
  ```sh
  git pull
  npm ci
  npm run build   # if you use serve
  ```

> Changes are saved in the browser and survive a reload, but they're bound to that browser and its address (e.g. `127.0.0.1:8080`). Export your pack before updating to be safe.

## 10. Generating mob models for a new Minecraft version

The editor always reads item and block models directly from the selected version. **Mob models**, however, live in Minecraft's program code and are generated once into `src/entities/entityModels.json`. This is only needed when Mojang changes mob models and you work on the source (option B).

**Requirement:** a **JDK** (not just a JRE) in the version the game needs. For 26.x that's Java 25. Download it e.g. from https://adoptium.net, or use `winget install EclipseAdoptium.Temurin.25.JDK` or `brew install --cask temurin`. Check with `java -version`.

```sh
npm run mc:fetch -- 26.3              # download client.jar + libraries to .mc/26.3/ (official Mojang servers)
npm run mc:models -- 26.3             # regenerate all existing mob models
npm run mc:models -- 26.3 --list      # list every model layer the game defines
npm run mc:models -- 26.3 minecraft:goat#main   # add more layers
npm run mc:sounds -- 26.3             # regenerate which sounds each block plays (src/sounds/blockSounds.json)
```

A newly added layer only shows up in the app once `src/entities/catalog.ts` assigns it to a mob with a texture. The `.mc/` folder is excluded from Git.

## 11. Troubleshooting

**`node` is not found / “The term 'node' is not recognized”**
Node.js isn't installed, or the terminal was open before installing it. Close and reopen the terminal, then check `node -v`.

**`SyntaxError` or similar errors when starting `serve.mjs`**
Node.js is too old. `node -v` must show at least `v18.18.0`.

**The server starts but the page keeps loading forever**
Editor 1.3.0 and older stall on Node.js 26 once the browser reuses a connection. Update to 1.4.0 or newer.

**`EADDRINUSE: address already in use`**
The port is taken, often by an editor that's still running. Close the other terminal or use another port: `node serve.mjs --port 8081`.

**“Could not reach the Mojang version list” / client.jar doesn't download**
The browser can't reach `piston-meta.mojang.com` or `piston-data.mojang.com`. Check your internet connection, company firewall, ad blocker or Pi-hole.

**Vanilla sounds don't play (“No sound proxy configured” / “HTTP 404”)**
The page runs without a proxy, e.g. via `python -m http.server`, another web server or a web space. Fix: start it with `node serve.mjs` or `npm run dev`, or set up a proxy (see [static hosting](#purely-static-hosting-github-pages-netlify-web-space-)).

**Item and mob names are in English although another language is selected**
Only the English names are inside the client.jar. Translations come from Minecraft's language file, which lives on the same server as the sounds and therefore needs the proxy too. If vanilla sounds work, translated names work as well. The interface itself isn't affected.

**A sound doesn't play in Safari**
Depending on the version, Safari doesn't support Ogg Vorbis or only partly. Use Chrome, Edge or Firefox.

**“Not an Ogg file” / “Ogg Opus” when adding a sound**
Minecraft only plays **Ogg Vorbis**. In Audacity: *File → Export → Export as OGG*. With ffmpeg: `ffmpeg -i sound.mp3 -c:a libvorbis -ac 1 sound.ogg` (`-ac 1` = mono).

**Note “the file is stereo”**
Minecraft plays stereo sounds without direction or distance falloff. For footsteps, mob sounds and so on, convert the file to mono (see above).

**Thumbnails stay empty or black**
WebGL is disabled. In Chrome/Edge, enable *Settings → System → Use hardware acceleration* and restart the browser. `chrome://gpu` shows the status.

**“may not match this version” in the header**
The pack's `pack_format` doesn't exactly match the selected version. Usually harmless. For an exact preview, pick the version the pack was made for.

**Browser storage full / clearing the cache**
Each opened Minecraft version stores about 20–40 MB. To clear it: open the developer tools (`F12`) → *Application* (Firefox: *Storage*) → *IndexedDB* → delete `keyval-store`. Or use *“Clear data”* in the site settings for the editor's address.

**The page loads old files after an update**
Hard reload with `Ctrl + F5` (macOS: `Cmd + Shift + R`).

**Mob export: `ClassNotFoundException` or `UnsupportedClassVersionError`**
`ClassNotFoundException` means libraries are missing: run `npm run mc:fetch -- <version>` again. `UnsupportedClassVersionError` means the JDK is too old (see [section 10](#10-generating-mob-models-for-a-new-minecraft-version)).

A problem that isn't listed? Open an [issue](https://github.com/keksi2k/minecraft-resourcepack-editor/issues) with your operating system, browser, Minecraft version and the error message. Please don't attach packs you don't own.

## 12. Uninstalling

1. Stop the server with `Ctrl + C` and delete the editor's folder.
2. Optionally clear the browser storage (see [clearing the cache](#11-troubleshooting)).
3. Node.js can stay, or be removed via the system settings, `brew uninstall node` or `nvm uninstall`.

The editor creates no files outside its folder and the browser's storage.
