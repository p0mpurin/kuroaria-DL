/* global KuroAriaBridge */
(function () {
  const ext = KuroAriaBridge.ext;

  const MIN_GOFILE_BYTES = 256 * 1024;

  function isGofileHost(url) {
    const lower = (url || "").toLowerCase();
    return lower.includes("gofile.io") || lower.includes("gofile.com");
  }

  function isGofileCdnDownloadUrl(url) {
    const lower = (url || "").toLowerCase();
    if (!isGofileHost(lower)) {
      return false;
    }
    return (
      lower.includes("/download/") ||
      /^https:\/\/file-[^/]+\.gofile\.io\//.test(lower)
    );
  }

  function isGofileMetadataUrl(url) {
    const lower = (url || "").toLowerCase();
    if (lower.includes("api.gofile.io")) {
      return !lower.includes("/download/");
    }
    if (!isGofileHost(lower)) {
      return false;
    }
    if (isGofileCdnDownloadUrl(lower)) {
      return false;
    }
    return (
      lower.includes("/contents/") ||
      (lower.includes("/d/") && !lower.includes("/download/"))
    );
  }

  function downloadSizeBytes(item) {
    if (typeof item.fileSize === "number" && item.fileSize >= 0) {
      return item.fileSize;
    }
    if (typeof item.totalBytes === "number" && item.totalBytes >= 0) {
      return item.totalBytes;
    }
    return -1;
  }

  function bytesReceived(item) {
    return typeof item.bytesReceived === "number" ? item.bytesReceived : 0;
  }

  function isRiskyPending(item) {
    const danger = item.danger;
    if (!danger || danger === "safe" || danger === "accepted") {
      return false;
    }
    return true;
  }

  function userAcceptedRisk(item) {
    return item.danger === "accepted";
  }

  function interceptReady(item) {
    const url = item.url || "";
    if (!url.startsWith("http")) {
      return false;
    }
    if (isGofileMetadataUrl(url)) {
      return false;
    }
    if (isRiskyPending(item)) {
      return false;
    }
    if (!isGofileHost(url)) {
      return true;
    }
    if (!isGofileCdnDownloadUrl(url)) {
      return false;
    }

    const total = downloadSizeBytes(item);
    const received = bytesReceived(item);

    if (userAcceptedRisk(item)) {
      if (total > 0 && total < MIN_GOFILE_BYTES) {
        return false;
      }
      if (received > 0 && received < MIN_GOFILE_BYTES) {
        return false;
      }
      return true;
    }

    if (total >= MIN_GOFILE_BYTES || received >= MIN_GOFILE_BYTES) {
      return true;
    }
    if (total > 0 && total < MIN_GOFILE_BYTES) {
      return false;
    }
    if (received > 0 && received < MIN_GOFILE_BYTES) {
      return false;
    }
    return false;
  }

  function shouldWatchDownload(item) {
    const url = item.url || "";
    if (!url.startsWith("http") || isGofileMetadataUrl(url)) {
      return false;
    }
    if (isRiskyPending(item)) {
      return true;
    }
    if (!isGofileHost(url)) {
      return false;
    }
    return isGofileCdnDownloadUrl(url) && !interceptReady(item);
  }

  async function cookiesHeaderForUrl(url, referer) {
    if (!ext.cookies?.getAll) {
      return null;
    }
    try {
      const targets = new Set([url, "https://gofile.io/"]);
      if (referer?.startsWith("http")) {
        targets.add(referer);
      }

      const seen = new Set();
      const pairs = [];

      for (const target of targets) {
        const list = await ext.cookies.getAll({ url: target });
        for (const cookie of list) {
          const pair = `${cookie.name}=${cookie.value}`;
          if (!seen.has(pair)) {
            seen.add(pair);
            pairs.push(pair);
          }
        }
      }

      if (isGofileHost(url)) {
        for (const domain of ["gofile.io", ".gofile.io"]) {
          const list = await ext.cookies.getAll({ domain });
          for (const cookie of list) {
            const pair = `${cookie.name}=${cookie.value}`;
            if (!seen.has(pair)) {
              seen.add(pair);
              pairs.push(pair);
            }
          }
        }
      }

      return pairs.length ? pairs.join("; ") : null;
    } catch (e) {
      console.warn("KuroAria DL cookies:", e);
      return null;
    }
  }

  function defaultReferer(url, referer) {
    if (referer?.startsWith("http")) {
      return referer;
    }
    if (isGofileHost(url)) {
      return "https://gofile.io/";
    }
    return referer || null;
  }

  KuroAriaBridge.hostDownload = {
    isGofileHost,
    isGofileCdnDownloadUrl,
    isGofileMetadataUrl,
    isRiskyPending,
    interceptReady,
    shouldWatchDownload,
    cookiesHeaderForUrl,
    defaultReferer,
    MIN_GOFILE_BYTES,
  };
})();
