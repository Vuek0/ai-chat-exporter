const CONTENT_FILES = [
  "src/common.js",
  "src/format.js",
  "src/extractors/chatgpt.js",
  "src/extractors/claude.js",
  "src/extractors/gemini.js",
  "src/extractors/google-ai.js",
  "src/content.js",
  "src/zip.js",
  "src/bulk.js",
  "src/ui.js",
  "src/transfer.js",
];

const ACE = globalThis.__ACE__; // из src/format.js
const t = ACE.t;
const $ = (id) => document.getElementById(id);

// Тексты разметки: <… data-i18n="key">; ждём выбранный вручную язык, если он есть
function applyTexts() {
  document.documentElement.lang = ACE.uiLang();
  for (const el of document.querySelectorAll("[data-i18n]")) el.textContent = t(el.dataset.i18n);
}
applyTexts();
$("version").textContent = "v" + chrome.runtime.getManifest().version;

// Выбор языка: «Авто» — как в Chrome, иначе строки выбранного языка кладём в storage,
// откуда их берут и popup, и кнопка на страницах.
const langButtons = [...$("opt-lang").querySelectorAll("button[data-value]")];

function showLang(value) {
  const i = Math.max(0, langButtons.findIndex((b) => b.dataset.value === value));
  $("opt-lang").style.setProperty("--i", i);
  langButtons.forEach((b, j) => {
    b.setAttribute("aria-checked", String(j === i));
    b.tabIndex = j === i ? 0 : -1; // в группе радио-кнопок Tab попадает только на выбранную
  });
}

async function chooseLang(value) {
  showLang(value);
  if (value === "auto") {
    await chrome.storage.local.set({ uiLang: "auto", uiMessages: null });
  } else {
    const messages = await fetch(chrome.runtime.getURL(`_locales/${value}/messages.json`)).then((r) => r.json());
    await chrome.storage.local.set({ uiLang: value, uiMessages: messages });
  }
  setTimeout(() => location.reload(), 260); // даём «таблетке» доехать, потом перерисовываем на новом языке
}

if (chrome.storage && chrome.storage.local) {
  chrome.storage.local.get({ uiLang: "auto" }).then((v) => showLang(v.uiLang));
  $("lang-row").title = t("langAuto");
  langButtons.forEach((b, j) => {
    b.addEventListener("click", () => {
      if (b.getAttribute("aria-checked") !== "true") chooseLang(b.dataset.value);
    });
    // Стрелки влево/вправо — как в обычной группе радио-кнопок
    b.addEventListener("keydown", (e) => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      const next = langButtons[(j + d + langButtons.length) % langButtons.length];
      next.focus();
      chooseLang(next.dataset.value);
    });
  });
} else {
  $("lang-row").hidden = true;
}

const ACTION_IDS = ["btn-json", "btn-md", "btn-html", "btn-copy"];
let buttons = ACTION_IDS.map($);
let tabId = null;
let cached = null;
let currentSite = null;
let busyNow = false;

function setStatus(text, kind = "") {
  const s = $("status");
  s.textContent = text;
  s.className = "status " + kind;
}
// Во время работы все кнопки неактивны, а нажатая показывает крутилку
function setBusy(busy, active) {
  busyNow = busy;
  for (const b of [...buttons, $("btn-bulk")]) {
    b.disabled = busy;
    b.classList.toggle("working", busy && b === active);
  }
}

// ---------- Массовый экспорт: состояние приходит со страницы ----------
let bulkState = null; // { done, total, cancelled } или null

const bulkProgressText = (st) =>
  st.cancelled ? t("bulkStopping") : st.total ? t("bulkProgress", Math.min(st.done + 1, st.total), st.total) : t("bulkListing");

// Пока идёт экспорт: остальные кнопки неактивны, а «Экспорт всех чатов» превращается в «Остановить»
function renderBulk(st) {
  bulkState = st;
  const btn = $("btn-bulk");
  const running = !!st;
  for (const b of buttons) b.disabled = running;
  btn.disabled = running && st.cancelled;
  btn.classList.toggle("working", running);
  btn.textContent = !running ? t("bulkExport") : st.cancelled ? t("bulkStopping") : t("bulkCancel");
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg) return;
  // Сообщения только от вкладки, для которой открыт popup
  if (sender && sender.tab && tabId != null && sender.tab.id !== tabId) return;
  // Gemini: сколько сообщений уже подгружено
  if (msg.type === "ACE_PROGRESS" && busyNow && msg.n) {
    setStatus(t("progressLoadingHistory", msg.n), "loading");
  }
  if (msg.type === "ACE_BULK_STATE") renderBulk(msg.state);
  // Промежуточные шаги приходят с kind "loading", итог — с "ok"/"error"/"" (без полоски)
  if (msg.type === "ACE_BULK_NOTE") setStatus(msg.text, msg.kind || "");
});

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
  setStatus(t(currentSite === "Gemini" ? "statusCollecting" : "progressCollecting"), "loading");
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

async function handle(action, btn) {
  setBusy(true, btn);
  try {
    const chat = await getChat();
    const base = ACE.fileBase(chat);
    const warn = chat.warnings && chat.warnings.length ? `\n⚠ ${chat.warnings.join(" ")}` : "";
    const count = ACE.messagesWord(chat.message_count);
    if (action === "copy") {
      await navigator.clipboard.writeText(ACE.toJson(chat));
      setStatus(t("resultLine", t("copied"), count) + warn, warn ? "" : "ok");
    } else {
      const fmt = {
        json: ["JSON", ".json", "application/json", ACE.toJson],
        md: ["Markdown", ".md", "text/markdown", ACE.toMarkdown],
        html: ["HTML", ".html", "text/html", ACE.toHtml],
      }[action];
      setStatus(t("progressPreparing", fmt[0]), "loading");
      await download(fmt[3](chat), base + fmt[1], fmt[2]);
      setStatus(t("downloadedFile", base + fmt[1], count) + warn, warn ? "" : "ok");
    }
  } catch (e) {
    setStatus(t("errPrefix", e.message || e), "error");
  } finally {
    setBusy(false);
  }
}

// Перенос чата в другую нейронку
async function transfer(target, btn) {
  setBusy(true, btn);
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
    b.addEventListener("click", () => transfer(target, b));
    box.appendChild(b);
  }
  buttons = [...ACTION_IDS.map($), ...box.querySelectorAll("button")];
}

$("btn-json").addEventListener("click", (e) => handle("json", e.currentTarget));
$("btn-md").addEventListener("click", (e) => handle("md", e.currentTarget));
$("btn-html").addEventListener("click", (e) => handle("html", e.currentTarget));

// Массовый экспорт идёт на странице сервиса; popup запускает, показывает прогресс и умеет остановить.
// Окно можно закрыть — экспорт продолжится, а при следующем открытии прогресс снова будет виден.
$("btn-bulk").addEventListener("click", async () => {
  try {
    if (bulkState) {
      renderBulk({ ...bulkState, cancelled: true });
      setStatus(t("bulkStopping"), "loading");
      await send({ type: "ACE_BULK_CANCEL" });
      return;
    }
    renderBulk({ done: 0, total: 0, cancelled: false });
    setStatus(t("bulkListing"), "loading");
    const r = await send({ type: "ACE_BULK_START" });
    if (!r || !r.ok) throw new Error((r && r.error) || t("errNoResponse"));
  } catch (e) {
    renderBulk(null);
    setStatus(t("errPrefix", e.message || e), "error");
  }
});
$("btn-copy").addEventListener("click", (e) => handle("copy", e.currentTarget));

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
  await ACE.i18nReady;
  applyTexts();
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
    currentSite = r.site;
    renderTargets(r.site);
    $("bulk").hidden = !r.bulk;
    setStatus(t("statusReady"));
    setBusy(false);
    // Экспорт уже идёт (запущен раньше) — показываем прогресс и кнопку «Остановить»
    if (r.bulkState) {
      renderBulk(r.bulkState);
      setStatus(bulkProgressText(r.bulkState), "loading");
    }
  } catch (e) {
    setStatus(t("statusCantConnect"), "error");
  }
})();
