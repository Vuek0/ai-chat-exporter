// Плавающая кнопка экспорта на странице чата.
// Живёт в Shadow DOM, чтобы стили сайта и расширения не пересекались.
(() => {
  const ACE = globalThis.__ACE__;
  if (ACE.uiLoaded) return;
  ACE.uiLoaded = true;

  const POS_KEY = "ace-button-pos-v2";
  const FALLBACK_POS = { right: 40, bottom: 128 }; // если поле ввода не нашлось
  const GAP = 16; // отступ от поля ввода
  const EDGE = 12; // минимальный отступ от краёв окна
  let host = null;
  let enabled = true;
  let relayout = null; // пересчёт позиции, задаётся в build()

  // Поле ввода чата: самый нижний видимый textarea/contenteditable,
  // затем поднимаемся до «рамки» композера — самого широкого предка, который
  // содержит само поле, невысокий (≤ 320px) и не шире 1000px.
  // Проверено на ChatGPT, Claude, Gemini и Google AI Mode.
  function findComposer() {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const maxW = Math.min(vw * 0.92, 1000);
    const edits = [...document.querySelectorAll('textarea, [contenteditable="true"], [contenteditable="plaintext-only"]')]
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 120 && r.height > 0 && r.bottom > vh * 0.5 && r.top < vh);
    if (!edits.length) return null;
    edits.sort((a, b) => b.r.bottom - a.r.bottom);
    const e = edits[0].r;
    let el = edits[0].el;
    let best = el;
    let bestW = e.width;
    for (let i = 0; i < 14 && el.parentElement && el.parentElement !== document.body; i++) {
      el = el.parentElement;
      const r = el.getBoundingClientRect();
      if (r.height > 320 || r.width > maxW) break;
      // Обёртки нулевого размера (display: contents) и смещённые слои пропускаем
      const contains = r.left <= e.left + 4 && r.right >= e.right - 4 && r.top <= e.top + 4 && r.bottom >= e.bottom - 4;
      if (!contains) continue;
      if (r.width >= bestW) {
        best = el;
        bestW = r.width;
      }
    }
    return best.getBoundingClientRect();
  }

  const CSS = `
    :host { all: initial; }
    .wrap {
      --bg: #ffffff; --fg: #1d1d1f; --muted: #6e6e73; --line: #e3e3e6;
      /* Палитра иконки: розовый → пыльная роза → шалфей; текст — тёмная слива */
      --accent: #d46fa6;
      --brand: linear-gradient(100deg, #e48bbd 0%, #e2aab0 52%, #d3e2b2 100%);
      --brand-hover: linear-gradient(100deg, #de78b2 0%, #dc9aa3 52%, #c6d99f 100%);
      --on-accent: #3b1830;
      --err: #c62828; --ok: #2e7d32;
      --shadow: 0 8px 28px rgba(0,0,0,.16), 0 2px 6px rgba(0,0,0,.10);
      position: fixed; z-index: 2147483646;
      font: 13px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
      color: var(--fg);
    }
    @media (prefers-color-scheme: dark) {
      .wrap {
        --bg: #26262a; --fg: #f2f2f2; --muted: #a0a0a8; --line: #3a3a3f;
        --accent: #e58fbf;
        --err: #ff6b6b; --ok: #66bb6a;
        --shadow: 0 8px 28px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.4);
      }
    }

    .fab {
      display: inline-flex; align-items: center; gap: 7px;
      height: 38px; padding: 0 16px 0 12px; border-radius: 999px;
      border: 0; background: var(--brand); color: var(--on-accent);
      font: 600 13px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
      letter-spacing: .1px; white-space: nowrap;
      box-shadow: var(--shadow); cursor: pointer;
      touch-action: none; user-select: none;
      transition: background-color .15s, transform .12s, box-shadow .15s;
    }
    .fab:hover { background: var(--brand-hover); }
    .fab:active { transform: scale(.97); }
    .fab:focus-visible { outline: 2px solid var(--fg); outline-offset: 2px; }
    .fab.dragging { cursor: grabbing; transform: scale(1.03); }
    .fab svg { width: 17px; height: 17px; flex: none; }
    .fab.busy svg { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Меню и уведомление открываются в ту сторону, где есть место */
    .pop { position: absolute; display: none; }
    .wrap.up .pop   { bottom: calc(100% + 8px); }
    .wrap.down .pop { top: calc(100% + 8px); }
    .wrap.right .pop { right: 0; }
    .wrap.left .pop  { left: 0; }

    .menu {
      background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
      box-shadow: var(--shadow); padding: 4px; min-width: 200px;
    }
    .menu.open { display: block; }
    .menu .title { padding: 7px 10px 5px; color: var(--muted); font-size: 11px; }
    .menu button {
      display: block; width: 100%; text-align: left;
      font: inherit; color: var(--fg); background: transparent;
      border: 0; border-radius: 8px; padding: 8px 10px; cursor: pointer;
    }
    .menu button:hover { background: color-mix(in srgb, var(--accent) 14%, transparent); }
    .menu button:disabled { opacity: .45; cursor: default; }
    .menu .title.sep { border-top: 1px solid var(--line); margin-top: 4px; padding-top: 9px; }
    .menu .targets button::after { content: "↗"; float: right; color: var(--muted); }
    .menu .hint { padding: 6px 10px 6px; color: var(--muted); font-size: 11px; border-top: 1px solid var(--line); margin-top: 4px; }

    .toast {
      width: max-content; max-width: 280px; background: var(--bg); border: 1px solid var(--line);
      border-radius: 10px; box-shadow: var(--shadow); padding: 9px 12px;
      white-space: pre-line;
    }
    .toast.show { display: block; }

    /* Появление кнопки */
    .wrap { animation: ace-in .4s cubic-bezier(.2,.8,.2,1) both; }
    @keyframes ace-in { from { opacity: 0; transform: translateY(12px) scale(.96); } }

    /* Пульсирующее кольцо при первом знакомстве */
    .ring {
      position: absolute; inset: 0; border-radius: 999px; pointer-events: none;
    }
    .ring.on { animation: ace-pulse 1.6s ease-out 4; }
    @keyframes ace-pulse {
      0%   { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 60%, transparent); }
      100% { box-shadow: 0 0 0 16px color-mix(in srgb, var(--accent) 0%, transparent); }
    }

    /* Подсказка-знакомство */
    .intro {
      width: 240px; background: var(--bg); border: 1px solid var(--line);
      border-radius: 12px; box-shadow: var(--shadow); padding: 12px 14px;
    }
    .intro.show { display: block; animation: ace-in .35s cubic-bezier(.2,.8,.2,1) both; }
    .intro b { display: block; font-size: 13px; margin-bottom: 4px; }
    .intro p { margin: 0 0 10px; color: var(--muted); }
    .intro button {
      font: 600 12px/1 system-ui, -apple-system, "Segoe UI", sans-serif;
      background: var(--brand); color: var(--on-accent); border: 0;
      border-radius: 999px; padding: 7px 14px; cursor: pointer;
    }
    .intro button:hover { background: var(--brand-hover); }

    @media (prefers-reduced-motion: reduce) {
      .wrap, .intro.show, .ring.on, .fab.busy svg { animation: none; }
    }
    .toast.ok { color: var(--ok); }
    .toast.error { color: var(--err); }
  `;

  const ICON_DOWNLOAD =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>';
  const ICON_SPIN =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.56"/></svg>';

  // Сохранённая вручную позиция или null — тогда кнопка стоит у поля ввода.
  function loadPos() {
    try {
      const p = JSON.parse(localStorage.getItem(POS_KEY));
      if (p && Number.isFinite(p.right) && Number.isFinite(p.bottom)) return p;
    } catch (_) {}
    return null;
  }

  // Позиция по умолчанию: справа от поля ввода, по центру его высоты;
  // если справа нет места — над полем у его правого края.
  function autoPos(w, h) {
    const r = findComposer();
    if (!r) return { ...FALLBACK_POS };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (vw - r.right >= w + GAP + EDGE) {
      return { right: vw - r.right - GAP - w, bottom: vh - r.bottom + (r.height - h) / 2 };
    }
    return { right: vw - r.right, bottom: vh - r.top + 10 };
  }

  // Подсказка при первом появлении — один раз за всё время
  const INTRO_KEY = "introSeen";
  async function introSeen() {
    try {
      const v = await chrome.storage.local.get({ [INTRO_KEY]: false });
      return v[INTRO_KEY];
    } catch (_) {
      try { return localStorage.getItem("ace-" + INTRO_KEY) === "1"; } catch (__) { return true; }
    }
  }
  function markIntroSeen() {
    try { chrome.storage.local.set({ [INTRO_KEY]: true }); } catch (_) {}
    try { localStorage.setItem("ace-" + INTRO_KEY, "1"); } catch (_) {}
  }

  function build() {
    host = document.createElement("ace-export-button");
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>${CSS}</style>
      <div class="wrap up right">
        <div class="pop toast" role="status"></div>
        <div class="pop menu" role="menu">
          <div class="title">Экспорт чата</div>
          <button data-act="json" role="menuitem">Скачать JSON</button>
          <button data-act="md" role="menuitem">Скачать Markdown</button>
          <button data-act="copy" role="menuitem">Скопировать JSON</button>
          <div class="title sep">Продолжить в…</div>
          <div class="targets"></div>
          <div class="hint">Кнопку можно перетащить · двойной клик — вернуть к полю ввода</div>
        </div>
        <div class="pop intro" role="dialog" aria-label="AI Chat Exporter">
          <b>Экспорт этого чата</b>
          <p>Скачайте всю переписку в JSON или Markdown одним нажатием.</p>
          <button class="intro-ok">Понятно</button>
        </div>
        <span class="ring" aria-hidden="true"></span>
        <button class="fab" title="Экспорт чата (AI Chat Exporter)" aria-haspopup="menu" aria-expanded="false">
          <span class="icon">${ICON_DOWNLOAD}</span><span class="label">Экспорт</span>
        </button>
      </div>`;

    const wrap = root.querySelector(".wrap");
    const fab = root.querySelector(".fab");
    const icon = root.querySelector(".icon");
    const label = root.querySelector(".label");
    const menu = root.querySelector(".menu");
    const toast = root.querySelector(".toast");
    let toastTimer = null;

    // Пункты «Продолжить в…» — все сервисы, кроме текущего
    const here = ACE.findExtractor && ACE.findExtractor();
    root.querySelector(".targets").innerHTML = (ACE.TARGETS || [])
      .filter((t) => !here || t.id !== here.id)
      .map((t) => `<button data-target="${t.id}" role="menuitem">${t.name}</button>`)
      .join("");

    // ---------- Позиция и перетаскивание ----------
    // Пока пользователь не двигал кнопку — она «приклеена» к полю ввода (auto).
    // После перетаскивания храним отступ от правого/нижнего края окна.
    let pos = loadPos();
    let auto = !pos;

    function applyPos() {
      const w = fab.offsetWidth || 110;
      const h = fab.offsetHeight || 38;
      if (auto) pos = autoPos(w, h);
      pos.right = Math.max(EDGE, Math.min(window.innerWidth - w - EDGE, pos.right));
      pos.bottom = Math.max(EDGE, Math.min(window.innerHeight - h - EDGE, pos.bottom));
      wrap.style.right = pos.right + "px";
      wrap.style.bottom = pos.bottom + "px";
      // Куда раскрывать меню: вверх, если кнопка в нижней половине экрана; вбок — к центру.
      const centerY = window.innerHeight - pos.bottom - h / 2;
      const centerX = window.innerWidth - pos.right - w / 2;
      wrap.classList.toggle("up", centerY > window.innerHeight / 2);
      wrap.classList.toggle("down", centerY <= window.innerHeight / 2);
      wrap.classList.toggle("right", centerX > window.innerWidth / 2);
      wrap.classList.toggle("left", centerX <= window.innerWidth / 2);
    }
    window.addEventListener("resize", applyPos);
    relayout = applyPos;

    let drag = null;
    fab.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, right: pos.right, bottom: pos.bottom, moved: false };
      fab.setPointerCapture(e.pointerId);
    });
    fab.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) > 5) {
        drag.moved = true;
        auto = false;
        fab.classList.add("dragging");
        setOpen(false);
        hideIntro();
      }
      if (drag.moved) {
        pos.right = drag.right - dx;
        pos.bottom = drag.bottom - dy;
        applyPos();
      }
    });
    const endDrag = () => {
      if (!drag) return;
      if (drag.moved) {
        fab.classList.remove("dragging");
        try { localStorage.setItem(POS_KEY, JSON.stringify(pos)); } catch (_) {}
      } else {
        setOpen(!menu.classList.contains("open"));
      }
      drag = null;
    };
    fab.addEventListener("pointerup", endDrag);
    fab.addEventListener("pointercancel", () => {
      if (drag) fab.classList.remove("dragging");
      drag = null;
    });
    // Двойной клик — вернуть кнопку к полю ввода
    fab.addEventListener("dblclick", () => {
      auto = true;
      try { localStorage.removeItem(POS_KEY); } catch (_) {}
      applyPos();
      setOpen(false);
    });
    // Клавиатура: Enter/Space открывают меню
    fab.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setOpen(!menu.classList.contains("open"));
      }
    });

    // ---------- Меню ----------
    function setOpen(open) {
      menu.classList.toggle("open", open);
      fab.setAttribute("aria-expanded", String(open));
      if (open) {
        toast.className = "pop toast";
        hideIntro();
      }
    }

    // ---------- Знакомство с кнопкой ----------
    const intro = root.querySelector(".intro");
    const ring = root.querySelector(".ring");
    let introTimer = null;
    function hideIntro() {
      if (!intro.classList.contains("show")) return;
      intro.classList.remove("show");
      ring.classList.remove("on");
      clearTimeout(introTimer);
      markIntroSeen();
    }
    root.querySelector(".intro-ok").addEventListener("click", hideIntro);
    introSeen().then((seen) => {
      if (seen) return;
      setTimeout(() => {
        if (!host.isConnected || host.style.display === "none") return;
        intro.classList.add("show");
        ring.classList.add("on");
        introTimer = setTimeout(hideIntro, 15000);
      }, 900);
    });
    document.addEventListener("pointerdown", (e) => {
      if (!e.composedPath().includes(host)) setOpen(false);
    }, true);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") setOpen(false);
    });

    function showToast(text, kind = "", ms = 4000) {
      toast.textContent = text;
      toast.className = `pop toast show ${kind}`;
      clearTimeout(toastTimer);
      if (ms) toastTimer = setTimeout(() => (toast.className = "pop toast"), ms);
    }

    function setBusy(busy) {
      fab.classList.toggle("busy", busy);
      icon.innerHTML = busy ? ICON_SPIN : ICON_DOWNLOAD;
      label.textContent = busy ? "Собираю…" : "Экспорт";
      menu.querySelectorAll("button").forEach((b) => (b.disabled = busy));
      applyPos();
    }

    ACE.notify = showToast;

    menu.addEventListener("click", async (e) => {
      const tbtn = e.target.closest("button[data-target]");
      if (tbtn) {
        setOpen(false);
        setBusy(true);
        try {
          const r = await ACE.transferTo(tbtn.dataset.target);
          const long = r.length > 60000 ? "\nЧат длинный — сервис может прикрепить его файлом." : "";
          showToast(`Открыл ${r.target.name}: ${ACE.messagesWord(r.chat.message_count)} будут вставлены в поле ввода.${long}`, "ok", 6000);
        } catch (err) {
          showToast("Ошибка: " + (err.message || err), "error", 6000);
        } finally {
          setBusy(false);
        }
        return;
      }
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      setOpen(false);
      setBusy(true);
      try {
        const chat = await ACE.run();
        const base = ACE.fileBase(chat);
        if (act === "json") saveFile(ACE.toJson(chat), base + ".json", "application/json");
        if (act === "md") saveFile(ACE.toMarkdown(chat), base + ".md", "text/markdown");
        if (act === "copy") await copyText(ACE.toJson(chat));
        const warn = chat.warnings && chat.warnings.length ? `\n⚠ ${chat.warnings.join(" ")}` : "";
        showToast(`${act === "copy" ? "Скопировано" : "Готово"}: ${ACE.messagesWord(chat.message_count)}.${warn}`, warn ? "" : "ok");
      } catch (err) {
        showToast("Ошибка: " + (err.message || err), "error", 6000);
      } finally {
        setBusy(false);
      }
    });

    document.documentElement.appendChild(host);
    applyPos();
  }

  function saveFile(text, filename, mime) {
    const url = URL.createObjectURL(new Blob([text], { type: mime + ";charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  ACE.copyText = (text) => copyText(text);
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      // Если сбор занял долго, браузер мог «забыть» клик — копируем старым способом.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;left:-9999px;top:0";
      document.documentElement.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (!ok) throw new Error("Браузер не дал скопировать. Используйте «Скачать JSON».");
    }
  }

  // Показываем кнопку только там, где есть подходящий экстрактор
  // (например, в Google — только в «Режиме ИИ»). Сайты — SPA, поэтому проверяем периодически.
  function sync() {
    const show = enabled && !!ACE.findExtractor && !!ACE.findExtractor();
    if (show && !host) build();
    if (host) {
      if (!host.isConnected) document.documentElement.appendChild(host);
      host.style.display = show ? "" : "none";
      // Поле ввода могло сдвинуться (свернули боковую панель, сменили чат) — подстраиваемся.
      if (show && relayout) relayout();
    }
  }

  try {
    chrome.storage.local.get({ showPageButton: true }).then((v) => {
      enabled = v.showPageButton;
      sync();
    });
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.showPageButton) {
        enabled = changes.showPageButton.newValue;
        sync();
      }
    });
  } catch (_) {
    sync();
  }
  setInterval(sync, 1500);
})();
