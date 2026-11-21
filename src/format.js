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
