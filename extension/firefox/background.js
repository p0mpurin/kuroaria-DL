/* global KuroAriaBridge */
(function () {
  const ext = KuroAriaBridge.ext;

  function setupContextMenu() {
    ext.contextMenus.create(
      {
        id: "kuroaria-download-link",
        title: "Download with KuroAria DL",
        contexts: ["link"],
      },
      () => {
        void ext.runtime.lastError;
      },
    );
  }

  ext.runtime.onInstalled.addListener(setupContextMenu);
  setupContextMenu();

  ext.contextMenus.onClicked.addListener((info) => {
    if (info.menuItemId !== "kuroaria-download-link" || !info.linkUrl) return;
    KuroAriaBridge.sendToKuroAria(info.linkUrl).catch((e) =>
      console.warn("KuroAria DL:", e),
    );
  });
})();
