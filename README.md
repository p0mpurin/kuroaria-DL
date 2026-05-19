# KuroAria DL

Premium desktop download manager built with **Tauri v2**, **React**, **TypeScript**, **Tailwind CSS**, **shadcn/ui**, **Framer Motion**, and **aria2** (JSON-RPC).

## Prerequisites

1. [Node.js](https://nodejs.org/) 20+
2. [Rust](https://rustup.rs/)
3. [aria2](https://aria2.github.io/) with RPC enabled

### aria2

Install aria2 and ensure `aria2c` is on your PATH. **KuroAria DL starts aria2 automatically** when the app launches (and stops it on exit). If you already run your own aria2 RPC server, the app will use that instance instead.

Optional: set an RPC secret in **Settings → aria2 RPC** (must match `--rpc-secret` if you run aria2 manually).

## Development

```bash
npm install
npm run tauri dev
```

## Features

- Add downloads by URL or drag & drop
- Queue, pause, resume, cancel, retry
- Segmented downloads (aria2 `split`)
- Live speed, progress, ETA
- Persistent state + auto-resume on startup
- Browser extension bridge (see `docs/bridge.md`)
- [Privacy Policy](docs/PRIVACY.md)

## Project layout

- `src/` — React UI
- `src-tauri/` — Rust backend, aria2 RPC, persistence
- `docs/bridge.md` — extension integration protocol
