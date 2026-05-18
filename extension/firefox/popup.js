/* global KuroAriaBridge */
(function () {
  const { ext, DEFAULT_BRIDGE_PORT, sendToKuroAria, pingKuroAria } =
    KuroAriaBridge;

  function setStatus(text, ok) {
    const el = document.getElementById("status");
    if (!el) return;
    el.textContent = text;
    el.className = ok ? "ok" : "err";
  }

  async function checkBridge() {
    setStatus("Checking bridge...", false);
    try {
      await pingKuroAria();
      setStatus("Bridge connected. Intercept can work.", true);
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Bridge not reachable";
      setStatus(
        `${msg}. Open KuroAria DL, Settings, Enable bridge server (port ${document.getElementById("port")?.value || DEFAULT_BRIDGE_PORT}).`,
        false,
      );
      return false;
    }
  }

  async function initPopup() {
    const portInput = document.getElementById("port");
    const intercept = document.getElementById("intercept");

    if (!portInput || !intercept) {
      setStatus("Popup failed to load. Reload the extension.", false);
      return;
    }

    const stored = await ext.storage.local.get([
      "bridgePort",
      "interceptDownloads",
    ]);

    portInput.value = String(stored.bridgePort ?? DEFAULT_BRIDGE_PORT);
    intercept.checked = stored.interceptDownloads === true;

    await checkBridge();

    portInput.addEventListener("change", async () => {
      const port = Number(portInput.value) || DEFAULT_BRIDGE_PORT;
      await ext.storage.local.set({ bridgePort: port });
      await checkBridge();
    });

    intercept.addEventListener("change", async () => {
      const value = intercept.checked;
      setStatus("Saving...", false);
      try {
        await ext.storage.local.set({ interceptDownloads: value });
        const verify = await ext.storage.local.get(["interceptDownloads"]);
        if (verify.interceptDownloads !== value) {
          throw new Error("Setting did not persist");
        }
        if (value) {
          const ok = await checkBridge();
          if (!ok) {
            intercept.checked = false;
            await ext.storage.local.set({ interceptDownloads: false });
            return;
          }
          setStatus(
            "Intercept on. Gofile: click Download once — we wait for the real size, then grab cookies.",
            true,
          );
        } else {
          setStatus("Intercept off", true);
        }
      } catch (e) {
        intercept.checked = !value;
        setStatus(e instanceof Error ? e.message : "Failed to save", false);
      }
    });

    document.getElementById("sendTab")?.addEventListener("click", async () => {
      setStatus("Sending...", false);
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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => void initPopup());
  } else {
    void initPopup();
  }
})();
