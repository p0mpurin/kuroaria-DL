/* global KuroAriaBridge */
(function () {
  const ext = globalThis.browser ?? globalThis.chrome;
  const DEFAULT_BRIDGE_PORT = 17888;

  function baseFilename(name) {
    if (!name || typeof name !== "string") return null;
    const base = name.replace(/\\/g, "/").split("/").pop() || "";
    return base || null;
  }

  async function sendToKuroAria(url, filename, referer, cookies) {
    const { bridgePort } = await ext.storage.local.get({
      bridgePort: DEFAULT_BRIDGE_PORT,
    });
    const port = Number(bridgePort) || DEFAULT_BRIDGE_PORT;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("KuroAria DL did not respond"));
      }, 5000);

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "add_download",
            url,
            filename: baseFilename(filename),
            referer: referer || null,
            cookies: cookies || null,
            force_start: true,
          }),
        );
      };

      ws.onmessage = (event) => {
        clearTimeout(timeout);
        try {
          const data = JSON.parse(String(event.data));
          if (data.type === "ack") resolve(data);
          else if (data.type === "error")
            reject(new Error(data.message || "Failed"));
          else reject(new Error("Unexpected response"));
        } catch (e) {
          reject(e);
        } finally {
          ws.close();
        }
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(
          new Error(
            "Cannot connect to KuroAria DL. Open the app and enable the bridge in Settings.",
          ),
        );
      };
    });
  }

  async function pingKuroAria() {
    const { bridgePort } = await ext.storage.local.get({
      bridgePort: DEFAULT_BRIDGE_PORT,
    });
    const port = Number(bridgePort) || DEFAULT_BRIDGE_PORT;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/`);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("No response"));
      }, 3000);

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "ping" }));
      };

      ws.onmessage = (event) => {
        clearTimeout(timeout);
        const data = JSON.parse(String(event.data));
        ws.close();
        if (data.type === "pong") resolve(true);
        else reject(new Error("Unexpected response"));
      };

      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Bridge unreachable"));
      };
    });
  }

  globalThis.KuroAriaBridge = {
    ext,
    DEFAULT_BRIDGE_PORT,
    sendToKuroAria,
    pingKuroAria,
  };
})();
