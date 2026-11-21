// Перенос чата в другую нейронку.
// Исходная вкладка: собирает текст и просит background открыть целевой сервис.
// Целевая вкладка: забирает текст у background и вставляет его в поле ввода (без отправки).
(() => {
  const ACE = globalThis.__ACE__;
  if (ACE.transferLoaded) return;
  ACE.transferLoaded = true;

  // Поле ввода: проверено на ChatGPT (ProseMirror), Claude (tiptap/ProseMirror), Gemini (Quill)
  const INPUT_SELECTORS = [
    "#prompt-textarea",
    'div.ProseMirror[contenteditable="true"]',
    "rich-textarea .ql-editor",
    '.ql-editor[contenteditable="true"]',
    "textarea",
    '[contenteditable="true"]',
  ];

  function findInput() {
    const visible = (e) => {
      const r = e.getBoundingClientRect();
      return r.width > 50 && r.height > 0;
    };
    for (const sel of INPUT_SELECTORS) {
      const els = [...document.querySelectorAll(sel)].filter(visible);
      if (els.length) {
        return els.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0];
      }
    }
    return null;
  }

  async function waitFor(fn, timeout = 20000, step = 300) {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await ACE.sleep(step);
    }
    return null;
  }

  // Вставка как из буфера обмена: так редакторы сами разбирают переносы строк,
  // а слишком длинный текст ChatGPT/Claude прикрепляют файлом.
  async function insertText(el, text) {
    el.focus();
    if (el.tagName === "TEXTAREA") {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, text);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return el.value.length > 0;
    }
    const dt = new DataTransfer();
    dt.setData("text/plain", text);
    const ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    await ACE.sleep(500);
    if (ev.defaultPrevented || el.textContent.trim()) return true; // редактор обработал вставку
    document.execCommand("insertText", false, text);
    await ACE.sleep(300);
    return !!el.textContent.trim();
  }

  async function notify(text, kind, ms) {
    const fn = await waitFor(() => ACE.notify, 5000, 200);
    if (fn) fn(text, kind, ms);
    else console.info("[AI Chat Exporter]", text);
  }

  // ---------- Исходная вкладка ----------
  ACE.transferTo = async (targetId) => {
    const target = ACE.TARGETS.find((t) => t.id === targetId);
    if (!target) throw new Error("Неизвестный сервис");
    const chat = await ACE.run();
    const text = ACE.toTransferPrompt(chat);
    // Страховка: если вставить автоматически не выйдет, текст уже будет в буфере обмена
    let copied = false;
    try {
      if (ACE.copyText) await ACE.copyText(text);
      else await navigator.clipboard.writeText(text);
      copied = true;
    } catch (_) {}
    const r = await chrome.runtime.sendMessage({
      type: "ACE_TRANSFER",
      url: target.url,
      text,
      source: chat.source_name,
      target: target.name,
    });
    if (!r || !r.ok) throw new Error((r && r.error) || "Не удалось открыть вкладку");
    return { chat, target, copied, length: text.length };
  };

  // ---------- Целевая вкладка ----------
  async function receive() {
    let data = null;
    try {
      data = await chrome.runtime.sendMessage({ type: "ACE_TAKE_TRANSFER" });
    } catch (_) {
      return;
    }
    if (!data) return;

    const el = await waitFor(findInput);
    if (!el) {
      notify("Не нашёл поле ввода. Текст чата в буфере обмена — вставьте его через Ctrl+V.", "error", 10000);
      return;
    }
    await ACE.sleep(600); // даём редактору инициализироваться
    let ok = false;
    try {
      ok = await insertText(findInput() || el, data.text);
    } catch (_) {}
    chrome.runtime.sendMessage({ type: "ACE_TRANSFER_DONE" }).catch(() => {});
    if (ok) {
      notify(`Чат из ${data.source} вставлен. Проверьте текст и отправьте сообщение.`, "ok", 8000);
    } else {
      notify("Не удалось вставить автоматически. Текст чата в буфере обмена — нажмите Ctrl+V.", "error", 10000);
    }
  }

  receive();
})();
