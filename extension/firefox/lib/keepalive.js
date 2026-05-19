/* global KuroAriaBridge */
/**
 * Firefox MV3 backgrounds suspend when idle. A lightweight alarm keeps the
 * extension warm so download intercept listeners stay registered.
 * (Temporary debugging add-ons still show "Background script: Stopped" in
 * about:debugging until an event fires — that label is normal.)
 */
(function () {
  const ext = KuroAriaBridge.ext;
  const ALARM = "kuroaria-keepalive";

  function ensureAlarm() {
    if (!ext.alarms?.create) return;
    ext.alarms.create(ALARM, { periodInMinutes: 1 }).catch(() => {});
  }

  ext.runtime.onInstalled.addListener(ensureAlarm);
  ext.runtime.onStartup.addListener(ensureAlarm);
  ensureAlarm();

  if (ext.alarms?.onAlarm) {
    ext.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === ALARM) {
        console.debug("KuroAria DL: background keepalive");
      }
    });
  }
})();
