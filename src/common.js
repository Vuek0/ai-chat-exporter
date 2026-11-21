// Общие утилиты: реестр экстракторов и конвертер HTML -> Markdown.
(() => {
  const ACE = (globalThis.__ACE__ = globalThis.__ACE__ || {});
  ACE.extractors = ACE.extractors || [];

  ACE.register = (extractor) => {
    if (!ACE.extractors.some((e) => e.id === extractor.id)) ACE.extractors.push(extractor);
  };

  ACE.sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Склеивает подряд идущие сообщения одной роли (например, ответ ИИ, разбитый вызовами инструментов).
  ACE.mergeConsecutive = (messages) => {
    const out = [];
    for (const m of messages) {
      const prev = out[out.length - 1];
      if (prev && prev.role === m.role && m.role === "assistant") {
        prev.content = [prev.content, m.content].filter(Boolean).join("\n\n");
        if (m.attachments?.length) prev.attachments = [...(prev.attachments || []), ...m.attachments];
      } else {
        out.push({ ...m });
      }
    }
    return out;
  };

  // ---------- HTML -> Markdown ----------
  const SKIP_TAGS = new Set([
    "BUTTON", "SCRIPT", "STYLE", "SVG", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT",
    "MAT-ICON", "TEMPLATE", "CANVAS", "VIDEO", "AUDIO",
  ]);
  const SKIP_CLASSES = ["cdk-visually-hidden", "sr-only", "code-block-decoration"];

  function shouldSkip(el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.classList && SKIP_CLASSES.some((c) => el.classList.contains(c))) return true;
    return false;
  }

  function mathOf(el) {
    // Gemini: data-math, KaTeX: <annotation encoding="application/x-tex">
    const dm = el.getAttribute && el.getAttribute("data-math");
    if (dm) return dm;
    const ann = el.querySelector && el.querySelector('annotation[encoding="application/x-tex"]');
    return ann ? ann.textContent : null;
  }

  function children(node, ctx) {
    let s = "";
    for (const c of node.childNodes) s += convert(c, ctx);
    return s;
  }

  function indentContinuation(text, pad) {
    return text.split("\n").map((l, i) => (i === 0 || !l ? l : pad + l)).join("\n");
  }

  function convert(node, ctx) {
    if (node.nodeType === Node.TEXT_NODE) {
      return ctx.pre ? node.textContent : node.textContent.replace(/\s+/g, " ");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node;
    const tag = el.tagName;

    // Формулы
    if (el.classList.contains("katex-display") || el.classList.contains("math-block")) {
      const m = mathOf(el);
      if (m != null) return `\n\n$$\n${m.trim()}\n$$\n\n`;
    }
    if (el.classList.contains("katex") || el.classList.contains("math-inline")) {
      const m = mathOf(el);
      if (m != null) return `$${m.trim()}$`;
    }

    if (shouldSkip(el)) return "";

    // Заголовки, свёрстанные как <div role="heading" aria-level="N"> (Google AI Mode и др.)
    if (el.getAttribute("role") === "heading" && !/^H[1-6]$/.test(tag)) {
      const lvl = Math.min(6, Math.max(1, parseInt(el.getAttribute("aria-level") || "3", 10) || 3));
      const t = children(el, ctx).trim();
      return t ? `\n\n${"#".repeat(lvl)} ${t}\n\n` : "";
    }

    switch (tag) {
      case "BR":
        return "\n";
      case "HR":
        return "\n\n---\n\n";
      case "H1": case "H2": case "H3": case "H4": case "H5": case "H6": {
        const t = children(el, ctx).trim();
        return t ? `\n\n${"#".repeat(+tag[1])} ${t}\n\n` : "";
      }
      case "P":
        return `\n\n${children(el, ctx).trim()}\n\n`;
      case "STRONG": case "B": {
        const t = children(el, ctx);
        return t.trim() ? `**${t.trim()}**` : t;
      }
      case "EM": case "I": {
        const t = children(el, ctx);
        return t.trim() ? `*${t.trim()}*` : t;
      }
      case "DEL": case "S":
        return `~~${children(el, ctx).trim()}~~`;
      case "CODE":
        if (ctx.pre) return el.textContent;
        return "`" + el.textContent + "`";
      case "CODE-BLOCK": {
        // Gemini: <code-block> с заголовком-языком и <pre><code>
        const deco = el.querySelector(".code-block-decoration");
        const lang = deco ? (deco.textContent || "").trim().split(/\s+/)[0].toLowerCase() : "";
        const pre = el.querySelector("pre");
        if (!pre) return children(el, ctx);
        return codeFence(pre, lang);
      }
      case "PRE":
        return codeFence(el, "");
      case "A": {
        const t = children(el, ctx).trim();
        const href = el.getAttribute("href");
        if (!href || href.startsWith("javascript:") || !t) return t;
        const abs = el.href || href;
        return t === abs ? `<${abs}>` : `[${t}](${abs})`;
      }
      case "IMG": {
        const alt = el.getAttribute("alt") || "image";
        const src = el.getAttribute("src") || "";
        if (!src || src.startsWith("data:") || src.startsWith("blob:")) return `[${alt}]`;
        return `![${alt}](${el.src || src})`;
      }
      case "UL": case "OL": {
        const ordered = tag === "OL";
        let n = parseInt(el.getAttribute("start") || "1", 10) || 1;
        const items = [];
        // Пункты списка, включая обёрнутые в лишние div (так делает Google: ul > div > li)
        const lis = [...el.querySelectorAll("li")].filter((li) => li.parentElement.closest("ul, ol") === el);
        for (const li of lis) {
          const body = children(li, { ...ctx }).replace(/\n{3,}/g, "\n\n").trim();
          if (!body) continue; // пустые пункты (служебные/декоративные)
          const marker = ordered ? `${n++}. ` : "- ";
          items.push(marker + indentContinuation(body, " ".repeat(marker.length)));
        }
        return `\n\n${items.join("\n")}\n\n`;
      }
      case "BLOCKQUOTE": {
        const t = children(el, ctx).replace(/\n{3,}/g, "\n\n").trim();
        return `\n\n${t.split("\n").map((l) => "> " + l).join("\n")}\n\n`;
      }
      case "TABLE":
        return tableToMd(el, ctx);
      case "DIV": case "SECTION": case "ARTICLE": case "HEADER": case "FOOTER":
        return `\n${children(el, ctx)}\n`;
      default:
        return children(el, ctx);
    }
  }

  function codeFence(pre, lang) {
    const code = pre.querySelector("code") || pre;
    if (!lang) {
      const m = (code.className || "").match(/language-([\w+#.-]+)/);
      if (m) lang = m[1];
    }
    const text = code.textContent.replace(/\n+$/, "");
    const fence = text.includes("```") ? "````" : "```";
    return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`;
  }

  function tableToMd(table, ctx) {
    const rows = [...table.querySelectorAll("tr")].map((tr) =>
      [...tr.children]
        .filter((c) => c.tagName === "TD" || c.tagName === "TH")
        .map((c) => children(c, ctx).replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|").trim())
    );
    if (!rows.length) return "";
    const width = Math.max(...rows.map((r) => r.length));
    const pad = (r) => [...r, ...Array(width - r.length).fill("")];
    const lines = [
      `| ${pad(rows[0]).join(" | ")} |`,
      `| ${Array(width).fill("---").join(" | ")} |`,
      ...rows.slice(1).map((r) => `| ${pad(r).join(" | ")} |`),
    ];
    return `\n\n${lines.join("\n")}\n\n`;
  }

  function tidy(md) {
    // Чистим пробелы вне блоков кода
    let inFence = false;
    const lines = md.split("\n").map((line) => {
      if (/^\s*(```|````)/.test(line)) {
        inFence = !inFence;
        return line.trim();
      }
      if (inFence) return line;
      return line.replace(/[ \t]+$/, "").replace(/^ (?=\S)/, "");
    });
    return lines
      .join("\n")
      .replace(/\*\*\*\*/g, "") // склейка соседних **жирных** фрагментов
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  ACE.htmlToMarkdown = (root) => (root ? tidy(convert(root, { pre: false })) : "");
})();
