# Browser extension bridge

KuroAria DL exposes a local WebSocket bridge so Chrome/Firefox extensions can forward intercepted downloads.

## Endpoint

When **Settings → Enable bridge server** is on:

```
ws://127.0.0.1:{bridge_port}/
```

Default port: `17888`

## Message format

JSON, one object per message:

```json
{
  "type": "add_download",
  "url": "https://example.com/file.zip",
  "filename": null,
  "referer": "https://example.com/download-page",
  "cookies": "accountToken=…; other=…",
  "force_start": true
}
```

`referer` is optional. When omitted, signed CDN links use the download URL as Referer; Gofile CDN links default to `https://gofile.io/`. Extensions should pass the browser download's `referrer` when available.

`cookies` is optional. For **Gofile**, the extension reads Firefox/Chrome cookies (`accountToken`, etc.) and sends them so aria2 can download the real file from `file-*.gofile.io`. Without cookies, Gofile often returns a small HTML error page.

`force_start` defaults to `false` when omitted; the extension sets `true` so bridge adds start immediately in aria2.

```json
{ "type": "ping" }
```

### Responses

```json
{ "type": "pong" }
```

```json
{ "type": "ack", "download_id": "uuid" }
```

```json
{ "type": "error", "message": "reason" }
```

## Native messaging (alternative)

Extensions may also use Chrome `nativeMessaging` with a host manifest pointing to a small relay binary. The relay forwards payloads to the same WebSocket endpoint above.

## Security

- Bind to `127.0.0.1` only
- Validate URLs (`http` / `https` only)
- Optional shared secret header: `X-KuroAria-Token`

## Extension flow

1. User enables **Auto intercept** in the extension popup (bridge must be on in the app).
2. User clicks download in the browser (e.g. Gofile **Download**).
3. For Gofile, the extension **does not** intercept tiny API/metadata requests. It lets Firefox start the download until `fileSize` is known and at least ~256 KB, then cancels the browser job and sends the CDN URL with `referer` + `cookies`.
4. Extension sends `add_download` over WebSocket.
5. App enqueues via aria2 RPC and shows the task in the UI.

Reload the extension after updating to **v0.1.5+** so the `cookies` permission is granted.

## Install

- **Firefox:** `extension/firefox` — load via `about:debugging` → Load Temporary Add-on
- **Chrome:** `extension/chrome` — load via `chrome://extensions` → Load unpacked

See [../extension/README.md](../extension/README.md).
