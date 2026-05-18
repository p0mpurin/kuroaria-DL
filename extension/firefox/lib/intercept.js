/* global KuroAriaBridge */
(function () {
  const ext = KuroAriaBridge.ext;
  const host = KuroAriaBridge.hostDownload;

  let interceptEnabled = false;
  const interceptedIds = new Set();
  const sendingUrls = new Set();
  const watchTimers = new Map();

  async function refreshInterceptFlag() {
    const data = await ext.storage.local.get(["interceptDownloads"]);
    interceptEnabled = data.interceptDownloads === true;
    console.info("KuroAria DL intercept:", interceptEnabled ? "ON" : "OFF");
  }

  function pruneSets() {
    if (interceptedIds.size > 200) {
      interceptedIds.clear();
    }
    if (sendingUrls.size > 50) {
      sendingUrls.clear();
    }
  }

  function stopWatch(downloadId) {
    const timer = watchTimers.get(downloadId);
    if (timer) {
      clearInterval(timer);
      watchTimers.delete(downloadId);
    }
  }

  async function cancelBrowserDownload(downloadId) {
    stopWatch(downloadId);
    try {
      await ext.downloads.cancel(downloadId);
    } catch (e) {
      console.warn("KuroAria DL cancel:", e);
    }
    if (ext.downloads.erase) {
      try {
        await ext.downloads.erase({ id: downloadId });
      } catch {
        /* ignore */
      }
    }
  }

  async function handOffToKuroAria(item) {
    const url = item.url || "";
    if (!host.interceptReady(item)) {
      return false;
    }

    if (interceptedIds.has(item.id)) {
      await cancelBrowserDownload(item.id);
      return true;
    }

    if (sendingUrls.has(url)) {
      await cancelBrowserDownload(item.id);
      return true;
    }

    sendingUrls.add(url);
    pruneSets();

    try {
      const referer = host.defaultReferer(url, item.referrer || null);
      const cookies = await host.cookiesHeaderForUrl(url, referer);

      if (host.isGofileHost(url) && !cookies) {
        console.warn(
          "KuroAria DL: no gofile cookies — log in at gofile.io in Firefox first",
        );
      }

      console.info("KuroAria DL sending to bridge:", url.slice(0, 80));
      await KuroAriaBridge.sendToKuroAria(
        url,
        item.filename || null,
        referer,
        cookies,
      );
      interceptedIds.add(item.id);
      await cancelBrowserDownload(item.id);
      console.info("KuroAria DL intercepted OK");
      return true;
    } catch (err) {
      console.warn("KuroAria DL intercept failed:", err);
      sendingUrls.delete(url);
      return false;
    } finally {
      sendingUrls.delete(url);
    }
  }

  async function tryHandOffById(downloadId, reason) {
    if (!interceptEnabled || interceptedIds.has(downloadId)) {
      return;
    }
    try {
      const [item] = await ext.downloads.search({ id: downloadId });
      if (!item?.url) {
        return;
      }
      if (host.isGofileMetadataUrl(item.url)) {
        stopWatch(downloadId);
        return;
      }
      if (host.interceptReady(item)) {
        stopWatch(downloadId);
        console.info("KuroAria DL handoff:", reason || "ready", item.filename);
        await handOffToKuroAria(item);
      }
    } catch (e) {
      console.warn("KuroAria DL tryHandOff:", e);
    }
  }

  function startWatch(downloadId) {
    if (watchTimers.has(downloadId) || interceptedIds.has(downloadId)) {
      return;
    }
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      if (!interceptEnabled || interceptedIds.has(downloadId)) {
        stopWatch(downloadId);
        return;
      }
      if (attempts > 200) {
        console.warn("KuroAria DL: gave up waiting for download", downloadId);
        stopWatch(downloadId);
        return;
      }
      void tryHandOffById(downloadId, "poll");
    }, 300);
    watchTimers.set(downloadId, timer);
  }

  function reasonLabel(danger, state) {
    return [danger, state].filter(Boolean).join("/");
  }

  function onDownloadCreated(item) {
    if (!interceptEnabled || !item?.id) {
      return;
    }
    const url = item.url || "";
    if (!url.startsWith("http")) {
      return;
    }
    if (host.isGofileMetadataUrl(url)) {
      return;
    }

    if (host.isWaitingForUserAllow(item)) {
      console.info(
        "KuroAria DL: waiting for Allow (HTTP unsafe / risky) —",
        item.filename,
        item.danger || "",
      );
      startWatch(item.id);
      return;
    }

    if (host.shouldWatchDownload(item)) {
      startWatch(item.id);
    }
    void tryHandOffById(item.id, "created");
  }

  function onDownloadChanged(delta) {
    if (!interceptEnabled || !delta.id) {
      return;
    }
    if (interceptedIds.has(delta.id)) {
      return;
    }

    const danger = delta.danger?.current;
    const state = delta.state?.current;
    const paused = delta.paused?.current;

    if (
      danger === "accepted" ||
      danger === "insecure" ||
      state === "in_progress"
    ) {
      console.info(
        "KuroAria DL: download proceeding —",
        reasonLabel(danger, state),
        delta.id,
      );
      startWatch(delta.id);
      void tryHandOffById(delta.id, "proceeding");
    }

    if (danger === "safe") {
      void tryHandOffById(delta.id, "danger-safe");
    }

    if (state === "in_progress" && paused === false) {
      void tryHandOffById(delta.id, "in-progress");
    }

    if (state === "complete") {
      void tryHandOffById(delta.id, "complete");
    }

    if (
      danger &&
      danger !== "safe" &&
      danger !== "accepted" &&
      danger !== "allowlisted"
    ) {
      startWatch(delta.id);
    }

    if (
      delta.fileSize?.current !== undefined ||
      delta.totalBytes?.current !== undefined ||
      delta.bytesReceived?.current !== undefined
    ) {
      void tryHandOffById(delta.id, "size");
    }
  }

  function setupDownloadIntercept() {
    if (ext.downloads?.onDeterminingFilename) {
      ext.downloads.onDeterminingFilename.addListener((_item, suggest) => {
        try {
          suggest();
        } catch (e) {
          console.warn("KuroAria DL suggest():", e);
        }
      });
    }

    if (ext.downloads?.onCreated) {
      ext.downloads.onCreated.addListener(onDownloadCreated);
    }

    if (ext.downloads?.onChanged) {
      ext.downloads.onChanged.addListener(onDownloadChanged);
    }

    console.info("KuroAria DL: intercept listeners ready (incl. risky downloads)");
  }

  async function bootstrap() {
    await refreshInterceptFlag();
    setupDownloadIntercept();

    ext.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !changes.interceptDownloads) {
        return;
      }
      interceptEnabled = changes.interceptDownloads.newValue === true;
      console.info("KuroAria DL intercept:", interceptEnabled ? "ON" : "OFF");
      if (!interceptEnabled) {
        for (const id of watchTimers.keys()) {
          stopWatch(id);
        }
      }
    });
  }

  void bootstrap();
})();
