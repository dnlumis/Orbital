# Orbital

> YouTube Music, decoupled. A minimalist Electron wrapper that strips away the browser's overhead for a dedicated audio experience. A floating, always-on-top YouTube Music mini player for Windows.

[![Electron](https://img.shields.io/badge/Electron-36.6.0-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows&logoColor=white)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-active-success.svg)](#)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

Orbital is a hardened Electron shell that embeds YouTube Music in a floating window you can pin over anything else on your desktop. It ships with two compact mini-player variants, an expanded full view, and Windows 11 Mica/acrylic backdrops when your system supports them.

---

## Screenshots

> Placeholders — drop PNGs or GIFs into `docs/screenshots/` and they will render here.

| Expanded | Compact (tall) | Compact (slim) |
| :---: | :---: | :---: |
| ![Expanded mode](docs/screenshots/expanded.png) | ![Compact tall](docs/screenshots/compact-tall.png) | ![Compact slim](docs/screenshots/compact-slim.png) |

![Orbital demo](docs/screenshots/demo.gif)

---

## Features

- **Always-on-top floating shell** — stays pinned over your work so the player is one glance away
- **Two compact variants + expanded view** — swap between a slim now-playing strip, a taller art-forward card, or the full YouTube Music page
- **Mica and acrylic backdrops** — expanded mode uses Windows 11 Mica; compact mode uses a stronger acrylic-like glass treatment
- **Locked layout by default** — temporarily unlock with the `Adjust` button when you want to resize
- **Hardened web view** — YouTube Music runs inside a sandboxed `WebContentsView` with a strict session partition and host allowlist
- **Minimal renderer bridge** — `preload.js` exposes only the window-state and playback actions the shell needs, nothing more
- **Hidden launcher** — `run_orbital.vbs` starts the app without leaving a console window behind

---

## Project layout

```
electron-player/
├── main.js           # Main-process windowing, security policy, WebContentsView, player bridge
├── preload.js        # Minimal renderer bridge for window state and player actions
├── renderer/
│   ├── shell.html    # Shell markup
│   ├── shell.css     # Mica / acrylic styling
│   └── shell.js      # Compact and expanded player UI logic
├── package.json      # App manifest
├── package-lock.json # Locked dependency graph
├── run_orbital.bat   # Local launcher
└── run_orbital.vbs   # Hidden launcher (no console window)
```

---

## Getting started

### Prerequisites

- Windows 10 or 11
- Node.js 18 or newer
- npm 9 or newer

### Install and run

```powershell
npm install
npm start
```

If dependencies are already installed you can skip straight to:

```powershell
npm start
```

Or simply double-click `run_orbital.bat`. For a launch with no visible terminal window, double-click `run_orbital.vbs` instead.

---

## Usage

- **Pin / unpin** — toggles always-on-top behavior
- **Adjust** — temporarily unlocks the shell so you can resize or reposition it
- **Compact toggle** — cycles between expanded and the compact variants
- **Sign in** — authentication happens in a separate hardened popup so your credentials never touch the shell UI

---

## Built with safety in mind

Orbital is designed from the ground up to keep your browsing safe while you enjoy your music. Every layer of the app has been carefully locked down so you can pin it over your work with confidence.

- **Isolated music session** — YouTube Music runs inside its own private `persist:ytm-shell` sandbox, fully separated from the rest of the app and from anything else on your system
- **Trusted-sites only** — navigation is strictly limited to YouTube Music's official domains (`music.youtube.com`, `www.youtube.com`, `youtube.com`), so Orbital can't be tricked into loading anything unexpected
- **Minimal, locked-down bridge** — the connection between the player and the app exposes only the handful of safe actions the UI actually needs, with no access to your files or system
- **Safe link handling** — any external links you click open cleanly in your default browser, never inside the Orbital shell itself

The result is a floating player you can trust to stay in its lane: it plays your music, and nothing more.

---

## Roadmap

- [ ] Publish signed Windows installers via GitHub Releases
- [ ] Global media key support (play / pause / skip from anywhere)
- [ ] System tray icon with quick controls and show/hide
- [ ] Custom hotkey bindings
- [ ] Lyrics pane (when available from the embedded player)
- [ ] Last.fm / ListenBrainz scrobbling
- [ ] macOS support with vibrancy backdrop
- [ ] Linux support with a matching frosted-glass treatment
- [ ] Theming API (user-defined accent colors and backdrops)
- [ ] Auto-update via `electron-updater`

---

## Contributing

Issues and pull requests are welcome. If you'd like to add a feature from the roadmap — or something that isn't on it — please open an issue first so we can discuss scope.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/your-idea`)
3. Commit your changes
4. Open a pull request

---

## License

Released under the [MIT License](LICENSE).

---

## Acknowledgements

- Built on [Electron](https://www.electronjs.org/)
- Embeds [YouTube Music](https://music.youtube.com/) — all music content and branding belongs to their respective owners. Orbital is an unofficial shell and is not affiliated with or endorsed by YouTube or Google.
