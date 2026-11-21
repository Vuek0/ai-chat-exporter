// Claude: сначала внутренний API claude.ai, при ошибке — разбор DOM.
(() => {
  const ACE = globalThis.__ACE__;
  const ROOT_ID = "00000000-0000-4000-8000-000000000000";

  function conversationId() {
    const m = location.pathname.match(/\/chat\/([0-9a-f-]{36})/i);
    return m ? m[1] : null;
  }

  async function orgIds() {
    const fromCookie = document.cookie.match(/(?:^|;\s*)lastActiveOrg=([^;]+)/);
    const ids = fromCookie ? [decodeURIComponent(fromCookie[1])] : [];
    try {
      const orgs = await fetch("/api/organizations", { credentials: "include" }).then((r) => r.json());
      if (Array.isArray(orgs)) for (const o of orgs) if (o.uuid && !ids.includes(o.uuid)) ids.push(o.uuid);
    } catch (_) {}
    return ids;
  }

  function messageText(m) {
    if (Array.isArray(m.content) && m.content.length) {
      const t = m.content
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text)
        .join("\n\n");
      if (t.trim()) return t;
    }
    return m.text || "";
  }

  async function viaApi() {
    const id = conversationId();
    if (!id) throw new Error(ACE.t("errNoChatId"));

    let data = null;
    let lastErr = null;
    for (const org of await orgIds()) {
      const url = `/api/organizations/${org}/chat_conversations/${id}?tree=True&rendering_mode=messages&render_all_tools=true`;
      const res = await fetch(url, { credentials: "include" });
      if (res.ok) {
        data = await res.json();
        break;
      }
      lastErr = `HTTP ${res.status}`;
    }
    if (!data) throw new Error(ACE.t("errClaudeApi", lastErr || ACE.t("noOrgs")));

    let list = data.chat_messages || [];
    // tree=True отдаёт все ветки — берём ту, что ведёт к текущему листу.
    if (data.current_leaf_message_uuid) {
      const byId = new Map(list.map((m) => [m.uuid, m]));
      const chain = [];
      let cur = data.current_leaf_message_uuid;
      const seen = new Set();
      while (cur && cur !== ROOT_ID && byId.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        chain.push(byId.get(cur));
        cur = byId.get(cur).parent_message_uuid;
      }
      if (chain.length) list = chain.reverse();
    } else {
      list = [...list].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    }

    const messages = list
      .map((m) => {
        const msg = {
          role: m.sender === "human" ? "user" : "assistant",
          content: messageText(m).trim(),
          timestamp: m.created_at || null,
        };
        const att = [
          ...(m.attachments || []).map((a) => a.file_name),
          ...(m.files_v2 || m.files || []).map((f) => f.file_name),
        ].filter(Boolean);
        if (att.length) msg.attachments = att;
        return msg;
      })
      .filter((m) => m.content || (m.attachments && m.attachments.length));

    return {
      title: data.name || document.title,
      conversation_id: id,
      model: data.model || null,
      created_at: data.created_at || null,
      method: "api",
      messages,
    };
  }

  function viaDom() {
    const sel = '[data-testid="user-message"], .font-claude-response, .font-claude-message';
    const all = [...document.querySelectorAll(sel)];
    // Оставляем только верхнеуровневые совпадения (без вложенных)
    const top = all.filter((el) => !all.some((o) => o !== el && o.contains(el)));
    const messages = top
      .map((el) => ({
        role: el.matches('[data-testid="user-message"]') ? "user" : "assistant",
        content: ACE.htmlToMarkdown(el),
      }))
      .filter((m) => m.content);
    return {
      title: document.title.replace(/\s*-\s*Claude\s*$/, ""),
      conversation_id: conversationId(),
      method: "dom",
      messages: ACE.mergeConsecutive(messages),
    };
  }

  ACE.register({
    id: "claude",
    name: "Claude",
    match: (host) => host === "claude.ai",
    async extract() {
      try {
        const r = await viaApi();
        if (r.messages.length) return r;
        throw new Error(ACE.t("errApiEmpty"));
      } catch (e) {
        console.warn("[AI Chat Exporter] Claude API unavailable, reading the page:", e);
        const r = viaDom();
        r.warnings = [ACE.t("warnApiFallback", e.message)];
        return r;
      }
    },
  });
})();
