# Privacy Policy — KuroAria DL

**Last updated:** May 18, 2026

This policy describes how **KuroAria DL** (the desktop application) and the **KuroAria DL browser extension** (Firefox and Chrome) handle information. The project is open source: [github.com/p0mpurin/kuroaria-DL](https://github.com/p0mpurin/kuroaria-DL).

If you have questions, open an issue on GitHub or contact the maintainer listed on the repository.

---

## Summary

- **No accounts**, **no analytics**, and **no data sold** to third parties.
- Download data stays **on your computer** unless **you** choose to download files from the internet (which is the purpose of the app).
- The browser extension talks only to **KuroAria DL on your machine** (`127.0.0.1`), not to our servers — **we do not operate remote servers** for this product.

---

## Who this applies to

- **KuroAria DL** (Windows desktop app)
- **KuroAria DL** browser extension (Firefox, Chrome/Chromium)

---

## Information the desktop app processes

### Download and settings data (stored locally)

The app stores on your device, for example:

- Download URLs, file names, progress, and status
- Your chosen download folder and app settings (theme, speed limits, concurrent downloads, etc.)
- Logs shown in the app UI related to your downloads

Typical storage locations:

- **Windows:** `%LOCALAPPDATA%\KuroAria-DL\` (settings and state)
- **Downloads:** the folder you configure in Settings (default: `Downloads\KuroAria` under your user profile)

We do not upload this data to the developer.

### aria2

The app uses [aria2](https://aria2.github.io/) locally to perform downloads. aria2 may create session files and partial download files in your download directory. If you configure an RPC secret, it is stored in your local settings file.

### Optional: Start with Windows

If you enable **Start with Windows**, the app registers with the operating system to launch at sign-in. No extra personal data is collected for this feature.

### System tray

If enabled, the app may remain running in the system tray after you close the window. This does not send data off your device.

---

## Information the browser extension processes

The extension helps send browser downloads to the desktop app. It may access:

| Data | Purpose |
|------|---------|
| **Download URLs and file names** | To add or intercept downloads in KuroAria DL |
| **Page referer** (when available) | Some hosts require the original page URL to download correctly |
| **Cookies** (for specific sites, e.g. file hosts you are logged into) | Passed only to your local app so aria2 can download protected links — not sent to the developer |
| **Extension preferences** (e.g. intercept on/off, bridge port) | Stored in the browser’s extension storage on your device |

### Local bridge only

When the bridge is enabled in the app, the extension connects to:

- **WebSocket:** `ws://127.0.0.1:<port>` (default port `17888`)
- **HTTP:** `http://127.0.0.1:<port>` (health check)

Traffic does not leave your computer through this bridge. Other websites you visit are not contacted by the extension except:

- Hosts you download from (normal browser download behavior), and
- Hosts listed in the extension manifest (e.g. certain file-host domains used for cookie access when you use those sites).

### Firefox data collection disclosure

On Firefox 140+, the extension manifest declares [data collection permissions](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/) so you can see what categories may apply during install:

- **Browsing activity** (required): download URLs for intercept/send-to-app
- **Website content** (optional): cookies when needed for authenticated downloads
- **Technical and interaction** (optional): extension settings

These match local-only use described above.

---

## What we do **not** collect

We (the developer / repository maintainers) do **not**:

- Run cloud servers that receive your downloads, URLs, or cookies
- Sell or rent your personal information
- Use advertising or third-party analytics SDKs in the app or extension
- Require an account or email to use the software

---

## Third parties

### Websites you download from

When you download a file, **the remote site** (and your ISP) handle that request as with any download manager. Their privacy policies apply to that traffic. We do not control those sites.

### GitHub / Mozilla / Google

- **Source code** may be hosted on GitHub.
- **Firefox Add-ons (AMO)** or **Chrome Web Store** (if published) have their own policies for listing and updates.
- **aria2** is third-party software you run locally.

---

## Security

- Keep your PC and browser updated.
- The bridge listens on **localhost only**; do not expose the bridge port to the internet.
- Use an RPC secret for aria2 if you run it in an environment where others can reach your machine’s RPC port.

---

## Children

The software is not directed at children under 13, and we do not knowingly collect personal information from children.

---

## Your choices

- **Uninstall** the desktop app and remove the browser extension at any time.
- **Disable** the bridge in app Settings and **turn off intercept** in the extension popup.
- **Delete** downloaded files and clear app data by removing `%LOCALAPPDATA%\KuroAria-DL\` and your download folder contents.
- **Review** Firefox/Chrome extension permissions in the browser’s add-on manager.

---

## Changes to this policy

We may update this document when the app or extension changes. The **“Last updated”** date at the top will change. For significant changes, the GitHub repository or release notes may mention the update.

Continued use after an update means you accept the revised policy for new versions you install.

---

## Open source

You can inspect how data is handled in the source code. Relevant areas include:

- `src-tauri/` — desktop app and bridge server
- `extension/firefox/` and `extension/chrome/` — browser extensions
- `docs/bridge.md` — local bridge protocol

---

## Contact

For privacy-related questions about this project, use [GitHub Issues](https://github.com/p0mpurin/kuroaria-DL/issues) on the repository.
