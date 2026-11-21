// Массовый экспорт: все чаты аккаунта в один ZIP (ChatGPT, Claude).
// Работает на странице сервиса, потому что запросы к его API идут с cookies пользователя.
// В архиве: index.json (список чатов, ошибки), json/<чат>.json и markdown/<чат>.md.
(() => {
  const ACE = globalThis.__ACE__;
  if (ACE.bulkLoaded) return;
  ACE.bulkLoaded = true;
  const t = (...a) => ACE.t(...a);

  const DELAY_MS = 350; // пауза между чатами, чтобы не упереться в лимиты сервиса
  const RETRY_WAITS = [5, 15, 30]; // секунды ожидания при 429 / 5xx

  ACE.bulkRunning = null;
  const stateListeners = [];
  ACE.onBulkState = (fn) => stateListeners.push(fn);
  const emitState = () => stateListeners.forEach((fn) => fn(ACE.bulkRunning));

  ACE.bulkCancel = () => {
    if (ACE.bulkRunning) ACE.bulkRunning.cancelled = true;
  };

  const notify = (text, kind = "", ms = 0) => {
    if (ACE.notify) ACE.notify(text, kind, ms);
    else console.info("[AI Chat Exporter]", text);
  };

  async function withRetry(fn, state) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (e) {
        const retryable = e && (e.status === 429 || e.status >= 500);
        if (!retryable || attempt >= RETRY_WAITS.length || state.cancelled) throw e;
        const wait = RETRY_WAITS[attempt];
        for (let s = wait; s > 0 && !state.cancelled; s--) {
          notify(t("bulkWaitRate", s), "loading", 0);
          await ACE.sleep(1000);
        }
      }
    }
  }

  // Дата по местному времени: YYYY-MM-DD (ChatGPT отдаёт секунды, Claude — ISO-строку)
  const day = (v) => {
    const d = v ? new Date(typeof v === "number" ? v * 1000 : v) : null;
    if (!d || isNaN(d)) return "undated";
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  function uniqueStem(chat, item, used) {
    const stem = `${day(item.updated_at || chat.created_at)}_${ACE.safeName(chat.title).slice(0, 60)}_${String(item.id).slice(0, 8)}`;
    let name = stem;
    for (let i = 2; used.has(name.toLowerCase()); i++) name = `${stem}_${i}`;
    used.add(name.toLowerCase());
    return name;
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.style.display = "none";
    document.documentElement.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  ACE.bulkExport = async () => {
    if (ACE.bulkRunning) return;
    const ex = ACE.findExtractor && ACE.findExtractor();
    if (!ex || !ex.bulk) throw new Error(t("bulkNotSupported"));

    const state = { cancelled: false, done: 0, total: 0 };
    ACE.bulkRunning = state;
    emitState();
    try {
      notify(t("bulkListing"), "loading");
      const ctx = await ex.bulk.prepare();
      const list = await withRetry(() => ex.bulk.list(ctx), state);
      state.total = list.length;
      emitState();
      if (!list.length) throw new Error(t("bulkEmpty"));

      const files = [];
      const index = [];
      const used = new Set();

      for (const item of list) {
        if (state.cancelled) break;
        notify(t("bulkProgress", state.done + 1, list.length), "loading");
        const entry = { id: item.id, title: item.title || "", updated_at: item.updated_at || null };
        try {
          const r = await withRetry(() => ex.bulk.fetch(item.id, ctx), state);
          if (!r.messages || !r.messages.length) throw new Error(t("errNoMessages"));
          const chat = ACE.buildExport(ex, r, r.url);
          const stem = uniqueStem(chat, item, used);
          files.push(
            { name: `json/${stem}.json`, data: ACE.toJson(chat) },
            { name: `markdown/${stem}.md`, data: ACE.toMarkdown(chat) }
          );
          Object.assign(entry, {
            title: chat.title,
            url: chat.url,
            message_count: chat.message_count,
            json: `json/${stem}.json`,
            markdown: `markdown/${stem}.md`,
          });
        } catch (e) {
          entry.error = (e && e.message) || String(e);
        }
        index.push(entry);
        state.done++;
        emitState();
        if (!state.cancelled) await ACE.sleep(DELAY_MS);
      }

      const exported = index.filter((e) => !e.error).length;
      const failed = index.length - exported;
      if (!exported) throw new Error(state.cancelled ? t("bulkCancelledEmpty") : t("bulkAllFailed"));

      files.unshift({
        name: "index.json",
        data: JSON.stringify(
          {
            format: "ai-chat-export-bulk",
            version: 1,
            source: ex.id,
            source_name: ex.name,
            exported_at: new Date().toISOString(),
            found: list.length,
            exported,
            failed,
            cancelled: state.cancelled,
            conversations: index,
          },
          null,
          2
        ),
      });

      notify(t("bulkZipping"), "loading");
      const zip = await ACE.makeZip(files);
      saveBlob(zip, `${ex.id}_all-chats_${day(new Date())}.zip`);

      if (state.cancelled) notify(t("bulkCancelled", exported, list.length), "", 10000);
      else if (failed) notify(t("bulkDoneFailed", exported, failed), "", 12000);
      else notify(t("bulkDone", exported), "ok", 10000);
    } catch (e) {
      notify(t("errPrefix", (e && e.message) || e), "error", 10000);
    } finally {
      ACE.bulkRunning = null;
      emitState();
    }
  };
})();
