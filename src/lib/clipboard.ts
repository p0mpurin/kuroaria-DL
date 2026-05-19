import { isTauri } from "@tauri-apps/api/core";

/** Read clipboard text without the WebView permission prompt (uses OS APIs in Tauri). */
export async function readClipboardText(): Promise<string> {
  if (isTauri()) {
    const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
    return readText();
  }
  return navigator.clipboard.readText();
}
