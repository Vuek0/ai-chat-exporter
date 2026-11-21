const CONTENT_FILES = [
  "src/common.js",
  "src/format.js",
  "src/extractors/chatgpt.js",
  "src/extractors/claude.js",
  "src/extractors/gemini.js",
  "src/extractors/google-ai.js",
  "src/content.js",
  "src/ui.js",
  "src/transfer.js",
];

const ACE = globalThis.__ACE__; // из src/format.js
const t = ACE.t;

// Тексты разметки: <… data-i18n="key">
document.documentElement.lang = chrome.i18n.getUILanguage();
for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
const $ = (id) => document.getElementById(id);
let buttons = ["btn-json", "btn-md", "btn-copy"].map($);
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
  setStatus(t("statusCollecting"));
  const r = await send({ type: "ACE_EXTRACT" });
  if (!r || !r.ok) throw new Error((r && r.error) || t("errNoResponse"));
  cached = r.data;
  return cached;
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
    const base = ACE.fileBase(chat);
    if (action === "json") await download(ACE.toJson(chat), base + ".json", "application/json");
    if (action === "md") await download(ACE.toMarkdown(chat), base + ".md", "text/markdown");
    if (action === "copy") await navigator.clipboard.writeText(ACE.toJson(chat));
    const warn = chat.warnings && chat.warnings.length ? `\n⚠ ${chat.warnings.join(" ")}` : "";
    const done = t(action === "copy" ? "copied" : "done");
    setStatus(t("resultLine", done, ACE.messagesWord(chat.message_count)) + warn, warn ? "" : "ok");
  } catch (e) {
    setStatus(t("errPrefix", e.message || e), "error");
  } finally {
    setBusy(false);
  }
}

// Перенос чата в другую нейронку
async function transfer(target) {
  setBusy(true);
  try {
    const chat = await getChat();
    const text = ACE.toTransferPrompt(chat);
    // Страховка: если вставить автоматически не выйдет, текст уже будет в буфере обмена
    try { await navigator.clipboard.writeText(text); } catch (_) {}
    const r = await chrome.runtime.sendMessage({
      type: "ACE_TRANSFER",
      url: target.url,
      text,
      source: chat.source_name,
      target: target.name,
    });
    if (!r || !r.ok) throw new Error((r && r.error) || t("errOpenTab"));
    window.close();
  } catch (e) {
    setStatus(t("errPrefix", e.message || e), "error");
    setBusy(false);
  }
}

function renderTargets(currentSite) {
  const box = $("targets");
  box.innerHTML = "";
  for (const target of ACE.TARGETS.filter((x) => x.name !== currentSite)) {
    const b = document.createElement("button");
    b.textContent = target.name;
    b.disabled = true;
    b.addEventListener("click", () => transfer(target));
    box.appendChild(b);
  }
  buttons = [...["btn-json", "btn-md", "btn-copy"].map($), ...box.querySelectorAll("button")];
}

$("btn-json").addEventListener("click", () => handle("json"));
$("btn-md").addEventListener("click", () => handle("md"));
$("btn-copy").addEventListener("click", () => handle("copy"));

// Переключатель кнопки на странице.
// chrome.storage недоступен, если расширение не перезагружено после добавления разрешения "storage" —
// тогда просто прячем переключатель, а не роняем весь popup.
if (chrome.storage && chrome.storage.local) {
  chrome.storage.local.get({ showPageButton: true }).then(({ showPageButton }) => {
    $("opt-button").checked = showPageButton;
  });
  $("opt-button").addEventListener("change", (e) => {
    chrome.storage.local.set({ showPageButton: e.target.checked });
  });
} else {
  $("opt-button").closest("label").hidden = true;
}

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab && tab.id;
  const host = tab && tab.url ? new URL(tab.url).hostname : "";
  const supported = /^(chatgpt\.com|chat\.openai\.com|claude\.ai|gemini\.google\.com|(www\.)?google\.[a-z.]+)$/.test(host);
  if (!supported) {
    setStatus(t("statusOpenChat"), "error");
    return;
  }
  try {
    const r = await ensureInjected();
    if (!r.site) {
      setStatus(t("statusGoogleNotAi"), "error");
      return;
    }
    $("site").textContent = r.site || host;
    renderTargets(r.site);
    setStatus(t("statusReady"));
    setBusy(false);
  } catch (e) {
    setStatus(t("statusCantConnect"), "error");
  }
})();
