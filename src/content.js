// Точка входа content script: выбирает экстрактор по сайту и отвечает popup'у.
(() => {
  const ACE = globalThis.__ACE__;
  if (ACE.listening) return;
  ACE.listening = true;

  const findExtractor = () => ACE.extractors.find((e) => e.match(location.hostname));
  ACE.findExtractor = findExtractor;
  ACE.run = () => run();

  async function run() {
    const ex = findExtractor();
    if (!ex) throw new Error(ACE.t("errUnsupported"));
    const r = await ex.extract();
    if (!r.messages || !r.messages.length) {
      throw new Error(ACE.t("errNoMessages"));
    }
    return buildExport(ex, r, location.href);
  }

  // Итоговый объект экспорта — общий для одного чата и для массового экспорта
  function buildExport(ex, r, url) {
    const firstUser = r.messages.find((m) => m.role === "user");
    const fallbackTitle = firstUser ? firstUser.content.slice(0, 60).replace(/\s+/g, " ") : "chat";
    return {
      format: "ai-chat-export",
      version: 1,
      source: ex.id,
      source_name: ex.name,
      title: (r.title || "").trim() || fallbackTitle,
      url: url || r.url || location.href,
      conversation_id: r.conversation_id || null,
      model: r.model || null,
      created_at: r.created_at || null,
      exported_at: new Date().toISOString(),
      extraction_method: r.method,
      warnings: r.warnings || [],
      message_count: r.messages.length,
      messages: r.messages.map((m, i) => {
        const out = { index: i, role: m.role, content: m.content };
        if (m.timestamp) out.timestamp = m.timestamp;
        if (m.model) out.model = m.model;
        if (m.attachments && m.attachments.length) out.attachments = m.attachments;
        return out;
      }),
    };
  }
  ACE.buildExport = buildExport;

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "ACE_PING") {
      const ex = findExtractor();
      sendResponse({
        ok: true,
        site: ex ? ex.name : null,
        bulk: !!(ex && ex.bulk),
        bulkState: ACE.bulkSnapshot ? ACE.bulkSnapshot() : null,
      });
      return;
    }
    if (msg.type === "ACE_BULK_CANCEL") {
      if (ACE.bulkCancel) ACE.bulkCancel();
      sendResponse({ ok: true });
      return;
    }
    // Массовый экспорт запускается на странице: popup может закрыться, а прогресс виден в уведомлении
    if (msg.type === "ACE_BULK_START") {
      if (!ACE.bulkExport) {
        sendResponse({ ok: false, error: ACE.t("errUnsupported") });
        return;
      }
      if (!ACE.bulkRunning) ACE.bulkExport().catch(() => {});
      sendResponse({ ok: true });
      return;
    }
    if (msg.type === "ACE_EXTRACT") {
      // Пока идёт сбор, пересылаем прогресс (Gemini: сколько подгружено) в popup
      const prev = ACE.extractProgress;
      ACE.extractProgress = (n) => {
        if (prev) prev(n);
        chrome.runtime.sendMessage({ type: "ACE_PROGRESS", n }).catch(() => {});
      };
      run()
        .then(
          (data) => sendResponse({ ok: true, data }),
          (e) => sendResponse({ ok: false, error: e.message || String(e) })
        )
        .finally(() => {
          ACE.extractProgress = prev;
        });
      return true; // асинхронный ответ
    }
  });
})();
