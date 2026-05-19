# KuroAria DL — Browser extensions

Send downloads from your browser to the desktop app over a local WebSocket bridge.

## Setup (all browsers)

1. Run **KuroAria DL**.
2. **Settings → Browser integration → Enable bridge server** (default port `17888`).
3. Install the extension for your browser (below).

## Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `extension/firefox/manifest.json` (or any file inside that folder)

### Firefox features

- Toolbar popup → **Send current tab URL**
- **Right-click any link** → **Download with KuroAria DL**
- **Intercept new Firefox downloads** (popup checkbox) — requires **bridge enabled in the app**

After changing the extension or app, reload the temporary add-on in `about:debugging`.

> **“Background script: Stopped”** in `about:debugging` is normal for Manifest V3 — Firefox suspends the background when idle. Intercept still works: start a download or open the extension popup to wake it. A keepalive alarm runs every minute while the extension is loaded. For daily use, install a signed build from [GitHub Releases](https://github.com/p0mpurin/kuroaria-DL/releases) (stable extension ID `io.kuroaria.dl@extension`).

> Temporary add-ons are removed when Firefox restarts. Reload the same way after a restart.

### Troubleshooting intercept

1. KuroAria DL is running.
2. **Settings → Enable bridge server** is on (popup should say “Bridge connected”).
3. Reload the extension in `about:debugging`.
4. Enable **Intercept** in the extension popup — wait for “Intercept enabled” before closing the popup.

## Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the `extension/chrome` folder

## Protocol

See [../docs/bridge.md](../docs/bridge.md).
