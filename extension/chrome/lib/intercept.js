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

    if (interceptedIds.has(item.id) || sendingUrls.has(url)) {
      await cancelBrowserDownload(item.id);
      return true;
    }

    sendingUrls.add(url);

    try {
      const referer = host.defaultReferer(url, item.referrer || null);
      const cookies = await host.cookiesHeaderForUrl(url, referer);
      await KuroAriaBridge.sendToKuroAria(
        url,
        item.filename || null,
        referer,
        cookies,
      );
      interceptedIds.add(item.id);
      await cancelBrowserDownload(item.id);
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
      if (!item?.url || host.isGofileMetadataUrl(item.url)) {
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
      if (!interceptEnabled || interceptedIds.has(downloadId) || attempts > 150) {
        stopWatch(downloadId);
        return;
      }
      void tryHandOffById(downloadId);
    }, 400);
    watchTimers.set(downloadId, timer);
  }

  function setupDownloadIntercept() {
    if (ext.downloads?.onDeterminingFilename) {
      ext.downloads.onDeterminingFilename.addListener((_item, suggest) => {
        try {
          suggest();
        } catch {
          /* ignore */
        }
      });
    }

    ext.downloads?.onCreated?.addListener((item) => {
      if (!interceptEnabled || !item.url?.startsWith("http")) return;
      if (host.isGofileMetadataUrl(item.url)) return;
      if (host.shouldWatchDownload(item)) {
        startWatch(item.id);
      }
      void tryHandOffById(item.id);
    });

    ext.downloads?.onChanged?.addListener((delta) => {
      if (!interceptEnabled || !delta.id || interceptedIds.has(delta.id)) {
        return;
      }
      if (
        delta.fileSize?.current !== undefined ||
        delta.totalBytes?.current !== undefined ||
        delta.bytesReceived?.current !== undefined ||
        delta.state?.current
      ) {
        void tryHandOffById(delta.id);
      }
    });
  }

  refreshInterceptFlag().then(() => {
    setupDownloadIntercept();
    ext.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.interceptDownloads) {
        interceptEnabled = changes.interceptDownloads.newValue === true;
      }
    });
  });
})();
