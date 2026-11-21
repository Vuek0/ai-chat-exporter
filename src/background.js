// Service worker: открывает вкладку целевого сервиса и хранит текст для переноса,
// пока страница в новой вкладке не заберёт его.
const TTL_MS = 3 * 60 * 1000;
const KEY = (tabId) => `transfer:${tabId}`;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;

  // Открыть сервис в новой вкладке и запомнить текст для неё
  if (msg.type === "ACE_TRANSFER") {
    (async () => {
      // Из popup sender.tab нет — тогда открываем рядом с активной вкладкой
      let opener = sender.tab;
      if (!opener) [opener] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tab = await chrome.tabs.create({
        url: msg.url,
        index: opener ? opener.index + 1 : undefined,
        openerTabId: opener ? opener.id : undefined,
      });
      await chrome.storage.session.set({
        [KEY(tab.id)]: { text: msg.text, source: msg.source, target: msg.target, created: Date.now() },
      });
      sendResponse({ ok: true });
    })().catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true;
  }

  // Страница в новой вкладке забирает свой текст (один раз)
  if (msg.type === "ACE_TAKE_TRANSFER") {
    (async () => {
      const tabId = sender.tab && sender.tab.id;
      if (tabId == null) return sendResponse(null);
      const key = KEY(tabId);
      const data = (await chrome.storage.session.get(key))[key];
      if (!data || Date.now() - data.created > TTL_MS) {
        if (data) await chrome.storage.session.remove(key);
        return sendResponse(null);
      }
      // Удаляем только после подтверждения вставки (ACE_TRANSFER_DONE), чтобы пережить редиректы страницы
      sendResponse(data);
    })();
    return true;
  }

  if (msg.type === "ACE_TRANSFER_DONE") {
    const tabId = sender.tab && sender.tab.id;
    if (tabId != null) chrome.storage.session.remove(KEY(tabId));
    return;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.remove(KEY(tabId));
});
