/* global KuroAriaBridge */
(function () {
  const ext = KuroAriaBridge.ext;
  const ALARM = "kuroaria-keepalive";

  function ensureAlarm() {
    if (!ext.alarms?.create) return;
    ext.alarms.create(ALARM, { periodInMinutes: 1 }).catch(() => {});
  }

  ext.runtime.onInstalled.addListener(ensureAlarm);
  ext.runtime.onStartup?.addListener?.(ensureAlarm);
  ensureAlarm();

  ext.alarms?.onAlarm?.addListener?.((alarm) => {
    if (alarm.name === ALARM) {
      console.debug("KuroAria DL: service worker keepalive");
    }
  });
})();
