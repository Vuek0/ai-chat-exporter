const CONTENT_FILES = [
  "src/common.js",
  "src/extractors/chatgpt.js",
  "src/extractors/claude.js",
  "src/extractors/gemini.js",
  "src/extractors/google-ai.js",
  "src/content.js",
];

const $ = (id) => document.getElementById(id);
const buttons = ["btn-json", "btn-md", "btn-copy"].map($);
let tabId = null;
let cached = null;

function setStatus(text, kind = "") {
  const s = $("status");
  s.textContent = text;
  s.className = "status " + kind;
}
const setBusy = (busy) => buttons.forEach((b) => (b.disabled = busy));

async function send(msg) {
  return chrome.tabs.sendMessage(tabId, msg);
}

// Если вкладка открыта до установки расширения — content script ещё не внедрён.
async function ensureInjected() {
  try {
    return await send({ type: "ACE_PING" });
  } catch (_) {
    await chrome.scripting.executeScript({ target: { tabId }, files: CONTENT_FILES });
    return await send({ type: "ACE_PING" });
  }
}

async function getChat() {
  if (cached) return cached;
  setStatus("Собираю сообщения… (для длинных чатов Gemini это может занять время)");
  const r = await send({ type: "ACE_EXTRACT" });
  if (!r || !r.ok) throw new Error((r && r.error) || "Нет ответа от страницы");
  cached = r.data;
  return cached;
}

function safeName(s) {
  return (s || "chat").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "chat";
}
function fileBase(chat) {
  const d = new Date(chat.exported_at);
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `${chat.source}_${safeName(chat.title)}_${stamp}`;
}

function toMarkdown(chat) {
  const head = [
    `# ${chat.title}`,
    "",
    `- Источник: ${chat.source_name}`,
    `- URL: ${chat.url}`,
    chat.model ? `- Модель: ${chat.model}` : null,
    `- Экспортировано: ${chat.exported_at}`,
    `- Сообщений: ${chat.message_count}`,
  ].filter((l) => l !== null);
  const body = chat.messages.map((m) => {
    const who = m.role === "user" ? "User" : `Assistant (${chat.source_name})`;
    const att = m.attachments ? `\n\n_Вложения: ${m.attachments.join(", ")}_` : "";
    return `## ${who}\n\n${m.content}${att}`;
  });
  return [head.join("\n"), ...body].join("\n\n---\n\n") + "\n";
}

async function download(text, filename, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  try {
    await chrome.downloads.download({ url, filename, saveAs: false });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}

async function handle(action) {
  setBusy(true);
  try {
    const chat = await getChat();
    const json = JSON.stringify(chat, null, 2);
    if (action === "json") await download(json, fileBase(chat) + ".json", "application/json");
    if (action === "md") await download(toMarkdown(chat), fileBase(chat) + ".md", "text/markdown");
    if (action === "copy") await navigator.clipboard.writeText(json);
    const warn = chat.warnings && chat.warnings.length ? `\n⚠ ${chat.warnings.join(" ")}` : "";
    const done = action === "copy" ? "Скопировано" : "Готово";
    setStatus(`${done}: ${chat.message_count} сообщений.${warn}`, warn ? "" : "ok");
  } catch (e) {
    setStatus("Ошибка: " + (e.message || e), "error");
  } finally {
    setBusy(false);
  }
}

$("btn-json").addEventListener("click", () => handle("json"));
$("btn-md").addEventListener("click", () => handle("md"));
$("btn-copy").addEventListener("click", () => handle("copy"));

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab && tab.id;
  const host = tab && tab.url ? new URL(tab.url).hostname : "";
  const supported = /^(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|(www\.)?google\.[a-z.]+)$/.test(host);
  if (!supported) {
    setStatus("Откройте чат в ChatGPT, Claude, Gemini или Google AI Mode.", "error");
    return;
  }
  try {
    const r = await ensureInjected();
    if (!r.site) {
      setStatus("Это обычный поиск Google. Откройте вкладку «Режим ИИ».", "error");
      return;
    }
    $("site").textContent = r.site || host;
    setStatus("Откройте нужный чат и нажмите кнопку.");
    setBusy(false);
  } catch (e) {
    setStatus("Не удалось подключиться к странице. Обновите вкладку (F5).", "error");
  }
})();
