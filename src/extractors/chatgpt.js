// ChatGPT: сначала внутренний API (полное дерево чата), при ошибке — разбор DOM.
(() => {
  const ACE = globalThis.__ACE__;

  function conversationId() {
    const m = location.pathname.match(/\/c\/([0-9a-z-]{16,})/i);
    return m ? m[1] : null;
  }

  // Убираем служебные маркеры цитат вида citeturn0search0
  const cleanText = (s) => s.replace(/[\s\S]*?/g, "").replace(/[-]/g, "");

  function partsToText(parts) {
    return (parts || [])
      .map((p) => {
        if (typeof p === "string") return p;
        if (p && p.content_type === "image_asset_pointer") return "[image]";
        if (p && typeof p.text === "string") return p.text;
        return "";
      })
      .filter((s) => s && s.trim())
      .join("\n\n");
  }

  async function getToken() {
    const session = await fetch("/api/auth/session", { credentials: "include" }).then((r) => r.json());
    const token = session && session.accessToken;
    if (!token) throw new Error(ACE.t("errNoToken"));
    return token;
  }

  async function api(path, token) {
    const res = await fetch(path, { credentials: "include", headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw ACE.httpError(res.status);
    return res.json();
  }

  async function viaApi() {
    const id = conversationId();
    if (!id) throw new Error(ACE.t("errNoChatId"));
    return fetchConversation(id, await getToken());
  }

  // Список всех чатов: общий список (страницы по 100) + чаты проектов на всякий случай, без дублей
  async function listConversations(token) {
    const byId = new Map();
    for (let offset = 0; offset < 20000; offset += 100) {
      const j = await api(`/backend-api/conversations?offset=${offset}&limit=100&order=updated`, token);
      const items = j.items || [];
      for (const it of items) byId.set(it.id, { id: it.id, title: it.title, updated_at: it.update_time });
      if (items.length < 100) break;
    }
    try {
      const side = await api("/backend-api/gizmos/snorlax/sidebar?conversations_per_gizmo=0", token);
      for (const g of side.items || []) {
        const gid = g.gizmo && (g.gizmo.gizmo ? g.gizmo.gizmo.id : g.gizmo.id);
        if (!gid) continue;
        let cursor = 0;
        for (let k = 0; k < 50; k++) {
          const pj = await api(`/backend-api/gizmos/${gid}/conversations?cursor=${cursor}`, token);
          for (const it of pj.items || []) {
            if (!byId.has(it.id)) byId.set(it.id, { id: it.id, title: it.title, updated_at: it.update_time });
          }
          if (!pj.cursor) break;
          cursor = pj.cursor;
        }
      }
    } catch (e) {
      console.warn("[AI Chat Exporter] ChatGPT projects list unavailable:", e);
    }
    return [...byId.values()];
  }

  async function fetchConversation(id, token) {
    const data = await api(`/backend-api/conversation/${id}`, token);

    // Идём от текущей ветки к корню — получаем именно ту ветку, что видна на экране.
    const chain = [];
    let nodeId = data.current_node;
    const seen = new Set();
    while (nodeId && data.mapping[nodeId] && !seen.has(nodeId)) {
      seen.add(nodeId);
      chain.push(data.mapping[nodeId]);
      nodeId = data.mapping[nodeId].parent;
    }
    chain.reverse();

    const messages = chain
      .map((n) => n.message)
      .filter(Boolean)
      .filter((m) => {
        const role = m.author && m.author.role;
        if (role !== "user" && role !== "assistant") return false;
        if (m.metadata && m.metadata.is_visually_hidden_from_conversation) return false;
        if (role === "assistant" && m.recipient && m.recipient !== "all") return false;
        const ct = m.content && m.content.content_type;
        return ct === "text" || ct === "multimodal_text";
      })
      .map((m) => {
        const msg = {
          role: m.author.role,
          content: cleanText(partsToText(m.content.parts)).trim(),
          timestamp: m.create_time ? new Date(m.create_time * 1000).toISOString() : null,
        };
        if (m.metadata && m.metadata.model_slug) msg.model = m.metadata.model_slug;
        const att = m.metadata && m.metadata.attachments;
        if (att && att.length) msg.attachments = att.map((a) => a.name || a.id);
        return msg;
      })
      .filter((m) => m.content || (m.attachments && m.attachments.length));

    return {
      title: data.title || "",
      conversation_id: id,
      url: `${location.origin}/c/${id}`,
      model: data.default_model_slug || null,
      created_at: data.create_time ? new Date(data.create_time * 1000).toISOString() : null,
      method: "api",
      messages: ACE.mergeConsecutive(messages),
    };
  }

  function viaDom() {
    const nodes = document.querySelectorAll("[data-message-author-role]");
    const messages = [];
    for (const el of nodes) {
      const role = el.getAttribute("data-message-author-role");
      if (role !== "user" && role !== "assistant") continue;
      let content;
      if (role === "user") {
        const t = el.querySelector(".whitespace-pre-wrap") || el;
        content = (t.textContent || "").trim();
      } else {
        content = ACE.htmlToMarkdown(el.querySelector(".markdown") || el);
      }
      if (content) messages.push({ role, content });
    }
    return {
      title: document.title,
      conversation_id: conversationId(),
      method: "dom",
      messages: ACE.mergeConsecutive(messages),
    };
  }

  ACE.register({
    id: "chatgpt",
    name: "ChatGPT",
    match: (host) => host === "chatgpt.com" || host.endsWith(".chatgpt.com") || host === "chat.openai.com",
    // Массовый экспорт: контекст (токен) получаем один раз на весь проход
    bulk: {
      prepare: getToken,
      list: (token) => listConversations(token),
      fetch: (id, token) => fetchConversation(id, token),
    },
    async extract() {
      // Не в чате (главная страница, новый чат) — экспортировать нечего, без лишних предупреждений
      if (!conversationId()) throw new Error(ACE.t("errNoMessages"));
      try {
        const r = await viaApi();
        if (r.messages.length) return r;
        throw new Error(ACE.t("errApiEmpty"));
      } catch (e) {
        console.warn("[AI Chat Exporter] ChatGPT API unavailable, reading the page:", e);
        const r = viaDom();
        r.warnings = [ACE.t("warnApiFallback", e.message)];
        return r;
      }
    },
  });
})();
