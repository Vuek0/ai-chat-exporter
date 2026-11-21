// Точка входа content script: выбирает экстрактор по сайту и отвечает popup'у.
(() => {
  const ACE = globalThis.__ACE__;
  if (ACE.listening) return;
  ACE.listening = true;

  const findExtractor = () => ACE.extractors.find((e) => e.match(location.hostname));

  async function run() {
    const ex = findExtractor();
    if (!ex) throw new Error("Этот сайт не поддерживается");
    const r = await ex.extract();
    if (!r.messages || !r.messages.length) {
      throw new Error("Сообщения не найдены. Откройте конкретный чат и попробуйте снова.");
    }
    const firstUser = r.messages.find((m) => m.role === "user");
    const fallbackTitle = firstUser ? firstUser.content.slice(0, 60).replace(/\s+/g, " ") : "chat";
    return {
      format: "ai-chat-export",
      version: 1,
      source: ex.id,
      source_name: ex.name,
      title: (r.title || "").trim() || fallbackTitle,
      url: location.href,
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

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "ACE_PING") {
      const ex = findExtractor();
      sendResponse({ ok: true, site: ex ? ex.name : null });
      return;
    }
    if (msg.type === "ACE_EXTRACT") {
      run().then(
        (data) => sendResponse({ ok: true, data }),
        (e) => sendResponse({ ok: false, error: e.message || String(e) })
      );
      return true; // асинхронный ответ
    }
  });
})();
