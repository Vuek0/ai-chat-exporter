// Форматы экспорта и имена файлов. Используется и на странице (кнопка), и в popup.
(() => {
  const ACE = (globalThis.__ACE__ = globalThis.__ACE__ || {});

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

  // «1 сообщение», «3 сообщения», «5 сообщений»
  ACE.messagesWord = (n) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return `${n} сообщение`;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} сообщения`;
    return `${n} сообщений`;
  };

  // Сервисы, в которые можно перенести чат
  ACE.TARGETS = [
    { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/" },
    { id: "claude", name: "Claude", url: "https://claude.ai/new" },
    { id: "gemini", name: "Gemini", url: "https://gemini.google.com/app" },
  ];

  // Текст для переноса чата в другую нейронку: вводная + вся переписка по ролям.
  ACE.toTransferPrompt = (chat) => {
    const lines = chat.messages.map((m) => {
      const who = m.role === "user" ? "Пользователь" : `Ассистент (${chat.source_name})`;
      const att = m.attachments ? `\n[Вложения: ${m.attachments.join(", ")}]` : "";
      return `### ${who}\n${m.content}${att}`;
    });
    return [
      `Ниже — моя переписка с ${chat.source_name} на тему «${chat.title}» (${ACE.messagesWord(chat.message_count)}).`,
      `Я хочу продолжить этот разговор с тобой. Внимательно учти весь контекст: что я спрашивал, что уже было предложено и на чём мы остановились.`,
      `Сначала коротко (3–5 пунктов) перескажи, о чём шла речь и на чём мы остановились, а потом жди мой следующий вопрос.`,
      ``,
      `=== НАЧАЛО ПЕРЕПИСКИ ===`,
      ``,
      lines.join("\n\n"),
      ``,
      `=== КОНЕЦ ПЕРЕПИСКИ ===`,
    ].join("\n");
  };

  ACE.toJson = (chat) => JSON.stringify(chat, null, 2);

  ACE.toMarkdown = (chat) => {
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
  };
})();
