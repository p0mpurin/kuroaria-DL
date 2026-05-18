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
      /^https?:\/\/file-[^/]+\.gofile\.io\//.test(lower)
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

  /** Waiting on Firefox "Allow" / HTTP unsafe prompt (state = interrupted). */
  function isWaitingForUserAllow(item) {
    return item.state === "interrupted";
  }

  /**
   * User confirmed the download. HTTP keeps danger=insecure (never "accepted").
   * HTTPS risky files may use danger=accepted once allowed.
   */
  function userProceedingWithDownload(item) {
    const danger = item.danger;
    if (
      danger === "accepted" ||
      danger === "allowlisted" ||
      danger === "safe"
    ) {
      return true;
    }
    return item.state === "in_progress" || item.state === "complete";
  }

  function isHttpUrl(url) {
    return (url || "").toLowerCase().startsWith("http://");
  }

  function interceptReady(item) {
    const url = item.url || "";
    if (!url.startsWith("http")) {
      return false;
    }
    if (isGofileMetadataUrl(url)) {
      return false;
    }
    if (isWaitingForUserAllow(item)) {
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

    if (userProceedingWithDownload(item)) {
      if (isHttpUrl(url)) {
        return true;
      }
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
    if (isWaitingForUserAllow(item)) {
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
      const targets = new Set();
      targets.add(url);
      if (referer?.startsWith("http")) {
        targets.add(referer);
      }
      targets.add("https://gofile.io/");
      targets.add("https://www.gofile.io/");

      const seen = new Set();
      const pairs = [];

      for (const target of targets) {
        let list = [];
        try {
          list = await ext.cookies.getAll({ url: target });
        } catch {
          continue;
        }
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
          let list = [];
          try {
            list = await ext.cookies.getAll({ domain });
          } catch {
            continue;
          }
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
    isWaitingForUserAllow,
    interceptReady,
    shouldWatchDownload,
    cookiesHeaderForUrl,
    defaultReferer,
    MIN_GOFILE_BYTES,
  };
})();
