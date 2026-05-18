/* global KuroAriaBridge */
(function () {
  const { ext, DEFAULT_BRIDGE_PORT, sendToKuroAria, pingKuroAria } =
    KuroAriaBridge;

  function setStatus(text, ok) {
    const el = document.getElementById("status");
    el.textContent = text;
    el.className = `status ${ok ? "ok" : "err"}`;
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const portInput = document.getElementById("port");
    const intercept = document.getElementById("intercept");
    const stored = await ext.storage.local.get([
      "bridgePort",
      "interceptDownloads",
    ]);

    portInput.value = String(stored.bridgePort ?? DEFAULT_BRIDGE_PORT);
    intercept.checked = stored.interceptDownloads === true;

    try {
      await pingKuroAria();
      setStatus("Bridge connected", true);
    } catch {
      setStatus("Bridge not reachable. Enable it in KuroAria DL Settings.", false);
    }

    portInput.addEventListener("change", async () => {
      await ext.storage.local.set({
        bridgePort: Number(portInput.value) || DEFAULT_BRIDGE_PORT,
      });
      try {
        await pingKuroAria();
        setStatus("Bridge connected", true);
      } catch {
        setStatus("Bridge not reachable on this port", false);
      }
    });

    intercept.addEventListener("change", async () => {
      const value = intercept.checked;
      await ext.storage.local.set({ interceptDownloads: value });
      setStatus(value ? "Intercept enabled" : "Intercept disabled", true);
    });

    document.getElementById("sendTab").addEventListener("click", async () => {
      setStatus("Sending…", true);
      try {
        const [tab] = await ext.tabs.query({
          active: true,
          currentWindow: true,
        });
        const url = tab?.url;
        if (!url?.startsWith("http")) {
          throw new Error("Active tab has no HTTP URL");
        }
        await sendToKuroAria(url, null, url);
        setStatus("Sent to KuroAria DL", true);
      } catch (e) {
        setStatus(e instanceof Error ? e.message : "Failed", false);
      }
    });
  });
})();
