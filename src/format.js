// Переводы, форматы экспорта и имена файлов. Используется и на странице (кнопка), и в popup.
(() => {
  const ACE = (globalThis.__ACE__ = globalThis.__ACE__ || {});

  // ---------- Переводы ----------
  // Строки лежат в _locales/<lang>/messages.json; язык выбирает Chrome по языку браузера
  // (английский по умолчанию). Подстановки — {0}, {1}, …
  ACE.t = (key, ...args) => {
    let s = "";
    try {
      s = chrome.i18n.getMessage(key);
    } catch (_) {}
    if (!s) s = key;
    return s.replace(/\{(\d+)\}/g, (_, i) => (args[i] !== undefined ? String(args[i]) : ""));
  };

  // Язык интерфейса — тот, что выбрал Chrome для расширения
  const lang = (() => {
    try {
      return chrome.i18n.getMessage("@@ui_locale").replace("_", "-") || "en";
    } catch (_) {
      return "en";
    }
  })();
  const plural = (() => {
    try {
      return new Intl.PluralRules(lang);
    } catch (_) {
      return new Intl.PluralRules("en");
    }
  })();

  // «1 message / 5 messages», «1 сообщение / 3 сообщения / 5 сообщений»
  ACE.messagesWord = (n) => {
    const cat = plural.select(n);
    let s = "";
    try {
      s = chrome.i18n.getMessage("count_" + cat);
    } catch (_) {}
    return s ? s.replace("{0}", n) : ACE.t("count_other", n);
  };

  // ---------- Файлы ----------
  function safeName(s) {
    return (
      (s || "chat")
        .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80) || "chat"
    );
  }

  ACE.fileBase = (chat) => {
    const d = new Date(chat.exported_at);
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return `${chat.source}_${safeName(chat.title)}_${stamp}`;
  };

  // ---------- Перенос чата ----------
  // Сервисы, в которые можно перенести чат
  ACE.TARGETS = [
    { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/" },
    { id: "claude", name: "Claude", url: "https://claude.ai/new" },
    { id: "gemini", name: "Gemini", url: "https://gemini.google.com/app" },
  ];

  const roleName = (chat, m) =>
    m.role === "user" ? ACE.t("roleUser") : ACE.t("roleAssistant", chat.source_name);

  // Текст для переноса чата в другую нейронку: вводная + вся переписка по ролям.
  ACE.toTransferPrompt = (chat) => {
    const lines = chat.messages.map((m) => {
      const att = m.attachments ? `\n[${ACE.t("attachments", m.attachments.join(", "))}]` : "";
      return `### ${roleName(chat, m)}\n${m.content}${att}`;
    });
    return [
      ACE.t("promptIntro", chat.source_name, chat.title, ACE.messagesWord(chat.message_count)),
      ACE.t("promptContinue"),
      ACE.t("promptSummary"),
      "",
      ACE.t("promptStart"),
      "",
      lines.join("\n\n"),
      "",
      ACE.t("promptEnd"),
    ].join("\n");
  };

  // ---------- Экспорт ----------
  ACE.toJson = (chat) => JSON.stringify(chat, null, 2);

  ACE.toMarkdown = (chat) => {
    const head = [
      `# ${chat.title}`,
      "",
      `- ${ACE.t("mdSource")}: ${chat.source_name}`,
      `- URL: ${chat.url}`,
      chat.model ? `- ${ACE.t("mdModel")}: ${chat.model}` : null,
      `- ${ACE.t("mdExported")}: ${chat.exported_at}`,
      `- ${ACE.t("mdMessages")}: ${chat.message_count}`,
    ].filter((l) => l !== null);
    const body = chat.messages.map((m) => {
      const att = m.attachments ? `\n\n_${ACE.t("attachments", m.attachments.join(", "))}_` : "";
      return `## ${roleName(chat, m)}\n\n${m.content}${att}`;
    });
    return [head.join("\n"), ...body].join("\n\n---\n\n") + "\n";
  };
})();
