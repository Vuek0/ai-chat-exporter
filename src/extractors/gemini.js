// Gemini: разбор DOM. Старые сообщения подгружаются при прокрутке вверх — докручиваем до начала.
(() => {
  const ACE = globalThis.__ACE__;
  const TURN_SEL = "user-query, model-response";

  function conversationId() {
    const m = location.pathname.match(/\/app\/([0-9a-z_-]+)/i);
    return m ? m[1] : null;
  }

  async function loadFullHistory(onProgress) {
    const scroller =
      document.querySelector("infinite-scroller") ||
      document.querySelector('[data-test-id="chat-history-container"]') ||
      document.querySelector("#chat-history");
    if (!scroller) return;
    let prev = -1;
    let stable = 0;
    for (let i = 0; i < 200 && stable < 4; i++) {
      scroller.scrollTop = 0;
      scroller.dispatchEvent(new Event("scroll"));
      await ACE.sleep(600);
      const count = document.querySelectorAll(TURN_SEL).length;
      if (onProgress) onProgress(count);
      if (count === prev) stable++;
      else {
        stable = 0;
        prev = count;
      }
    }
  }

  function userText(el) {
    const lines = el.querySelectorAll(".query-text-line, .query-text p");
    if (lines.length) return [...lines].map((l) => l.textContent.replace(/\s+$/, "")).join("\n").trim();
    const q = el.querySelector(".query-text") || el;
    return ACE.htmlToMarkdown(q);
  }

  function modelText(el) {
    const body =
      el.querySelector("message-content .markdown") ||
      el.querySelector(".markdown") ||
      el.querySelector("message-content");
    return body ? ACE.htmlToMarkdown(body) : "";
  }

  function title() {
    const sel = document.querySelector(
      '.conversation.selected .conversation-title, [data-test-id="conversation"].selected .conversation-title'
    );
    if (sel && sel.textContent.trim()) return sel.textContent.trim();
    const t = document.title.replace(/\s*[-|]\s*Gemini\s*$/i, "").trim();
    return t && t.toLowerCase() !== "gemini" ? t : null;
  }

  ACE.register({
    id: "gemini",
    name: "Gemini",
    match: (host) => host === "gemini.google.com",
    async extract() {
      await loadFullHistory();
      const messages = [];
      for (const el of document.querySelectorAll(TURN_SEL)) {
        const isUser = el.tagName === "USER-QUERY";
        const content = isUser ? userText(el) : modelText(el);
        if (content) messages.push({ role: isUser ? "user" : "assistant", content });
      }
      return {
        title: title(),
        conversation_id: conversationId(),
        method: "dom",
        messages: ACE.mergeConsecutive(messages),
      };
    },
  });
})();
