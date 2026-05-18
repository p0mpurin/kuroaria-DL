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

  async function tryHandOffById(downloadId) {
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
      if (attempts > 150) {
        console.warn("KuroAria DL: gave up waiting for gofile size", downloadId);
        stopWatch(downloadId);
        return;
      }
      void tryHandOffById(downloadId);
    }, 400);
    watchTimers.set(downloadId, timer);
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
    if (host.shouldWatchDownload(item)) {
      startWatch(item.id);
    }
    void tryHandOffById(item.id);
  }

  function onDownloadChanged(delta) {
    if (!interceptEnabled || !delta.id) {
      return;
    }
    if (interceptedIds.has(delta.id)) {
      return;
    }

    const sizeKnown =
      delta.fileSize?.current !== undefined ||
      delta.totalBytes?.current !== undefined;
    const progress =
      delta.bytesReceived?.current !== undefined ||
      delta.state?.current === "in_progress" ||
      delta.state?.current === "complete";

    if (sizeKnown || progress) {
      void tryHandOffById(delta.id);
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
      console.info("KuroAria DL: onDeterminingFilename (pass-through)");
    }

    if (ext.downloads?.onCreated) {
      ext.downloads.onCreated.addListener(onDownloadCreated);
      console.info("KuroAria DL: onCreated listener registered");
    }

    if (ext.downloads?.onChanged) {
      ext.downloads.onChanged.addListener(onDownloadChanged);
      console.info("KuroAria DL: onChanged listener registered");
    }
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
