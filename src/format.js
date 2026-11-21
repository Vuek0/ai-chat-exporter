// Переводы, форматы экспорта и имена файлов. Используется и на странице (кнопка), и в popup.
(() => {
  const ACE = (globalThis.__ACE__ = globalThis.__ACE__ || {});

  // ---------- Переводы ----------
  // Строки лежат в _locales/<lang>/messages.json. По умолчанию язык выбирает Chrome
  // по языку браузера (английский для всех остальных). Если в popup выбран язык вручную,
  // его строки лежат в chrome.storage.local (uiLang, uiMessages) и имеют приоритет.
  // Подстановки — {0}, {1}, …
  let override = null; // { lang, messages } или null = «Авто»
  const listeners = [];

  const chromeLang = () => {
    try {
      return chrome.i18n.getMessage("@@ui_locale").replace("_", "-") || "en";
    } catch (_) {
      return "en";
    }
  };
  let plural = new Intl.PluralRules("en");
  const updatePlural = () => {
    try {
      plural = new Intl.PluralRules(override ? override.lang : chromeLang());
    } catch (_) {
      plural = new Intl.PluralRules("en");
    }
  };
  updatePlural();

  function raw(key) {
    if (override) {
      const m = override.messages[key];
      if (m && m.message) return m.message;
    }
    try {
      return chrome.i18n.getMessage(key) || "";
    } catch (_) {
      return "";
    }
  }

  ACE.t = (key, ...args) =>
    (raw(key) || key).replace(/\{(\d+)\}/g, (_, i) => (args[i] !== undefined ? String(args[i]) : ""));

  ACE.uiLang = () => (override ? override.lang : chromeLang());
  ACE.onLangChange = (fn) => listeners.push(fn);

  function applyStored(v) {
    override = v.uiLang && v.uiLang !== "auto" && v.uiMessages ? { lang: v.uiLang, messages: v.uiMessages } : null;
    updatePlural();
  }

  // Готовность переводов: интерфейс строится после неё, чтобы сразу показать выбранный язык
  ACE.i18nReady = (async () => {
    try {
      applyStored(await chrome.storage.local.get({ uiLang: "auto", uiMessages: null }));
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !changes.uiLang) return;
        chrome.storage.local.get({ uiLang: "auto", uiMessages: null }).then((v) => {
          applyStored(v);
          listeners.forEach((fn) => fn());
        });
      });
    } catch (_) {}
  })();

  // «1 message / 5 messages», «1 сообщение / 3 сообщения / 5 сообщений»
  ACE.messagesWord = (n) => {
    const s = raw("count_" + plural.select(n));
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

  ACE.safeName = safeName;

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

  // ---------- HTML ----------
  // Небольшой рендерер Markdown → HTML для того Markdown, что выдают экстракторы:
  // заголовки, абзацы, списки (вложенные), код, цитаты, таблицы, формулы, ссылки.
  const esc = (s) =>
    String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const safeUrl = (u) => /^(https?:|mailto:)/i.test(u.replace(/&amp;/g, "&"));

  function inline(text) {
    // `код` не трогаем, остальное — экранируем и размечаем
    return text
      .split(/(`[^`\n]+`)/g)
      .map((part) => {
        if (/^`[^`]+`$/.test(part)) return `<code>${esc(part.slice(1, -1))}</code>`;
        return esc(part)
          .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, alt, u) => (safeUrl(u) ? `<img alt="${alt}" src="${u}">` : alt))
          .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, u) =>
            safeUrl(u) ? `<a href="${u}" target="_blank" rel="noopener noreferrer">${t}</a>` : t
          )
          .replace(/&lt;(https?:\/\/[^\s<>]+?)&gt;/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
          // $формула$ без пробелов у знаков — чтобы «$5 и $10» не стали формулой
          .replace(/\$(?=\S)([^$\n]+?)(?<=\S)\$(?!\d)/g, '<span class="math">$1</span>')
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1<em>$2</em>")
          .replace(/~~(.+?)~~/g, "<del>$1</del>");
      })
      .join("");
  }

  const LIST_RE = /^(\s*)([-*+]|\d+\.)\s+/;
  const FENCE_RE = /^\s*(`{3,})\s*([\w+#.-]*)\s*$/;

  function renderBlocks(lines) {
    const out = [];
    let i = 0;
    const isBlank = (l) => !l || !l.trim();
    while (i < lines.length) {
      const line = lines[i];
      if (isBlank(line)) { i++; continue; }

      // Блок кода
      const fence = line.match(FENCE_RE);
      if (fence) {
        const close = fence[1];
        const body = [];
        i++;
        while (i < lines.length && lines[i].trim() !== close) body.push(lines[i++]);
        i++;
        const lang = fence[2] ? ` data-lang="${esc(fence[2])}"` : "";
        out.push(`<pre${lang}><code>${esc(body.join("\n"))}</code></pre>`);
        continue;
      }

      // Формула блоком
      if (line.trim() === "$$") {
        const body = [];
        i++;
        while (i < lines.length && lines[i].trim() !== "$$") body.push(lines[i++]);
        i++;
        out.push(`<div class="math block">${esc(body.join("\n"))}</div>`);
        continue;
      }

      // Заголовок
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`);
        i++;
        continue;
      }

      // Разделитель
      if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        out.push("<hr>");
        i++;
        continue;
      }

      // Таблица
      if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
        const cells = (l) =>
          l.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((c) => inline(c.trim().replace(/\\\|/g, "|")));
        const head = cells(line);
        i += 2;
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(cells(lines[i++]));
        out.push(
          `<div class="table"><table><thead><tr>${head.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>` +
            rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("") +
            `</tbody></table></div>`
        );
        continue;
      }

      // Цитата
      if (/^\s*>/.test(line)) {
        const body = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ""));
        out.push(`<blockquote>${renderBlocks(body)}</blockquote>`);
        continue;
      }

      // Список (с вложенностью по отступам)
      const lm = line.match(LIST_RE);
      if (lm) {
        const indent = lm[1].length;
        const ordered = /\d/.test(lm[2]);
        const items = [];
        while (i < lines.length) {
          const l = lines[i];
          const m = l.match(LIST_RE);
          if (m && m[1].length === indent && /\d/.test(m[2]) === ordered) {
            items.push({ pad: m[0].length, lines: [l.slice(m[0].length)] });
            i++;
          } else if (!isBlank(l) && l.match(/^\s*/)[0].length > indent && items.length) {
            const cur = items[items.length - 1];
            items[items.length - 1].lines.push(l.replace(new RegExp(`^\\s{0,${cur.pad}}`), ""));
            i++;
          } else if (isBlank(l) && items.length) {
            // пустая строка внутри списка, если дальше продолжение
            let j = i + 1;
            while (j < lines.length && isBlank(lines[j])) j++;
            const next = lines[j];
            const nm = next && next.match(LIST_RE);
            const cont = next && (next.match(/^\s*/)[0].length > indent || (nm && nm[1].length === indent && /\d/.test(nm[2]) === ordered));
            if (!cont) break;
            items[items.length - 1].lines.push("");
            i++;
          } else break;
        }
        const start = ordered ? parseInt(lm[2], 10) : 1;
        const tag = ordered ? "ol" : "ul";
        const attr = ordered && start !== 1 ? ` start="${start}"` : "";
        out.push(
          `<${tag}${attr}>` +
            items
              .map((it) => {
                const html = renderBlocks(it.lines);
                // «тесный» пункт из одного абзаца — без <p>
                return `<li>${html.replace(/^<p>([\s\S]*?)<\/p>\n?(?=$|<(?:ul|ol)[ >])/, "$1")}</li>`;
              })
              .join("") +
            `</${tag}>`
        );
        continue;
      }

      // Абзац
      const para = [];
      while (
        i < lines.length &&
        !isBlank(lines[i]) &&
        !FENCE_RE.test(lines[i]) &&
        !/^(#{1,6})\s/.test(lines[i]) &&
        !LIST_RE.test(lines[i]) &&
        !/^\s*>/.test(lines[i]) &&
        lines[i].trim() !== "$$"
      ) {
        para.push(lines[i++]);
      }
      if (!para.length) { para.push(lines[i++]); }
      out.push(`<p>${para.map(inline).join("<br>")}</p>`);
    }
    return out.join("\n");
  }

  ACE.markdownToHtml = (md) => renderBlocks(String(md || "").replace(/\r\n?/g, "\n").split("\n"));

  ACE.toHtml = (chat) => {
    const lang = ACE.uiLang().split("-")[0];
    const fmtDate = (iso) => {
      try {
        return new Date(iso).toLocaleString(lang);
      } catch (_) {
        return iso;
      }
    };
    const meta = [
      `${esc(ACE.t("mdSource"))}: <a href="${esc(chat.url)}" target="_blank" rel="noopener noreferrer">${esc(chat.source_name)}</a>`,
      chat.model ? `${esc(ACE.t("mdModel"))}: ${esc(chat.model)}` : null,
      `${esc(ACE.t("mdExported"))}: ${esc(fmtDate(chat.exported_at))}`,
      esc(ACE.messagesWord(chat.message_count)),
    ].filter(Boolean);
    const messages = chat.messages
      .map((m) => {
        const att = m.attachments ? `<div class="att">📎 ${esc(m.attachments.join(", "))}</div>` : "";
        const time = m.timestamp ? `<time>${esc(fmtDate(m.timestamp))}</time>` : "";
        return `<article class="msg ${m.role}">
  <header><span class="who">${esc(roleName(chat, m))}</span>${time}</header>
  <div class="body">${ACE.markdownToHtml(m.content)}</div>${att}
</article>`;
      })
      .join("\n");

    return `<!doctype html>
<html lang="${esc(lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(chat.title)}</title>
<style>
:root {
  --bg: #fbfaf9; --fg: #1d1b1e; --muted: #6f6a70; --line: #e7e2e4;
  --card: #ffffff; --user: #f8e7f0; --code: #f3f0f2; --accent: #c2588f;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #161517; --fg: #efeaee; --muted: #a39ca3; --line: #302c31;
    --card: #1f1d20; --user: #3a2431; --code: #2a272b; --accent: #e58fbf; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg);
  font: 15px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif; }
.page { max-width: 820px; margin: 0 auto; padding: 32px 20px 64px; }
.top { border-bottom: 1px solid var(--line); padding-bottom: 16px; margin-bottom: 24px; }
.top h1 { font-size: 24px; line-height: 1.3; margin: 0 0 8px; }
.meta { color: var(--muted); font-size: 13px; display: flex; flex-wrap: wrap; gap: 4px 16px; }
.meta a { color: inherit; }
.print { float: right; font: inherit; font-size: 13px; padding: 6px 12px; border-radius: 999px;
  border: 0; cursor: pointer; color: #3b1830; background: linear-gradient(100deg, #e48bbd, #e2aab0 52%, #d3e2b2); }
.msg { margin: 0 0 18px; padding: 14px 18px; border-radius: 14px; background: var(--card);
  border: 1px solid var(--line); break-inside: avoid-page; }
.msg.user { background: var(--user); border-color: transparent; margin-left: 12%; }
.msg header { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 6px;
  font-size: 12px; color: var(--muted); }
.msg .who { font-weight: 600; color: var(--accent); }
.body > :first-child { margin-top: 0; } .body > :last-child { margin-bottom: 0; }
.body h1, .body h2, .body h3, .body h4 { line-height: 1.3; margin: 1.1em 0 .4em; }
.body h1 { font-size: 1.35em; } .body h2 { font-size: 1.2em; } .body h3, .body h4 { font-size: 1.05em; }
.body p { margin: .55em 0; }
.body ul, .body ol { margin: .5em 0; padding-left: 1.5em; }
.body li { margin: .2em 0; }
.body code { font: 13px/1.5 ui-monospace, "Cascadia Code", Consolas, monospace; background: var(--code);
  padding: .1em .35em; border-radius: 5px; }
.body pre { background: var(--code); padding: 12px 14px; border-radius: 10px; overflow-x: auto; position: relative; }
.body pre code { background: none; padding: 0; white-space: pre; }
.body pre[data-lang]::before { content: attr(data-lang); position: absolute; top: 4px; right: 10px;
  font-size: 11px; color: var(--muted); }
.body blockquote { margin: .6em 0; padding: .1em 0 .1em 14px; border-left: 3px solid var(--line); color: var(--muted); }
.body .table { overflow-x: auto; }
.body table { border-collapse: collapse; margin: .6em 0; font-size: 14px; }
.body th, .body td { border: 1px solid var(--line); padding: 6px 10px; text-align: left; vertical-align: top; }
.body th { background: var(--code); }
.body img { max-width: 100%; }
.body a { color: var(--accent); }
.math { font-family: "Cambria Math", "STIX Two Math", serif; }
.math.block { text-align: center; margin: .6em 0; white-space: pre-wrap; }
.att { margin-top: 8px; font-size: 13px; color: var(--muted); }
footer.credit { margin-top: 32px; font-size: 12px; color: var(--muted); text-align: center; }
footer.credit a { color: inherit; }
@media (max-width: 600px) { .msg.user { margin-left: 0; } }
@media print {
  body { background: #fff; color: #000; }
  .print { display: none; }
  .msg { border-color: #ddd; }
  .msg.user { background: #f6eef2; }
  .body pre { white-space: pre-wrap; }
  .body pre code { white-space: pre-wrap; }
}
</style>
</head>
<body>
<div class="page">
  <div class="top">
    <button class="print" onclick="window.print()">${esc(ACE.t("htmlSavePdf"))}</button>
    <h1>${esc(chat.title)}</h1>
    <div class="meta">${meta.map((m) => `<span>${m}</span>`).join("")}</div>
  </div>
${messages}
  <footer class="credit">${esc(ACE.t("htmlCredit"))} <a href="https://github.com/Vuek0/ai-chat-exporter" target="_blank" rel="noopener noreferrer">AI Chat Exporter</a></footer>
</div>
</body>
</html>
`;
  };
})();
