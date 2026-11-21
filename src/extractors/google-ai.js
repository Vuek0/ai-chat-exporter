// Google AI Mode (google.com/search?udm=50): разбор DOM.
// Классы у Google обфусцированы, поэтому опираемся на стабильные data-атрибуты и роли.
(() => {
  const ACE = globalThis.__ACE__;
  const TURN_SEL = '[data-scope-id="turn"]';

  const isAiMode = () =>
    new URLSearchParams(location.search).get("udm") === "50" || !!document.querySelector(TURN_SEL);

  // Вопрос пользователя: видимый «пузырь» (role=heading, aria-level=2) по порядку,
  // запасной вариант — скрытый h3 «...исходный запрос: "<вопрос>"» внутри хода.
  function userQueries(turns) {
    const bubbles = [...document.querySelectorAll('span[role="heading"][aria-level="2"]')]
      .filter((el) => !el.closest(TURN_SEL))
      .map((el) => el.textContent.trim())
      .filter(Boolean);
    return turns.map((turn, i) => {
      const h3 = turn.querySelector("h3");
      const m = h3 && h3.textContent.match(/["«“](.*)["»”]\s*$/s);
      if (m && m[1].trim()) return m[1].trim();
      return bubbles.length === turns.length ? bubbles[i] : "";
    });
  }

  function cleanAnswer(turn) {
    const col = turn.querySelector('[data-container-id="main-col"]') || turn.querySelector('[data-subtree="aimc"]');
    if (!col) return null;
    const clone = col.cloneNode(true);

    // Убираем всё, что на странице не видно: подсказки кнопок «Копировать / Хороший ответ»,
    // форму отзыва, уведомления. Копия строится в том же порядке, поэтому индексы совпадают.
    const liveEls = col.querySelectorAll("*");
    const cloneEls = clone.querySelectorAll("*");
    const hidden = [];
    for (let i = 0; i < liveEls.length; i++) {
      const s = getComputedStyle(liveEls[i]);
      if (s.display === "none" || s.visibility === "hidden") hidden.push(cloneEls[i]);
    }
    hidden.forEach((el) => el.remove());

    // Карусели картинок/источников, значки источников, кнопки, служебные заголовки
    clone
      .querySelectorAll('[role="list"]:not(ul):not(ol), [aria-hidden="true"], [role="button"], h3, [role="status"], [aria-live]')
      .forEach((el) => el.remove());
    return clone;
  }

  ACE.register({
    id: "google-ai",
    name: "Google AI Mode",
    match: (host) => /(^|\.)google\.[a-z.]+$/.test(host) && isAiMode(),
    async extract() {
      const turns = [...document.querySelectorAll(TURN_SEL)];
      const queries = userQueries(turns);
      const messages = [];
      turns.forEach((turn, i) => {
        if (queries[i]) messages.push({ role: "user", content: queries[i] });
        const body = cleanAnswer(turn);
        const content = body ? ACE.htmlToMarkdown(body) : "";
        if (content) messages.push({ role: "assistant", content });
      });
      return {
        title: (queries[0] || document.title.replace(/\s*-\s*[^-]*Google\s*$/i, "")).slice(0, 100),
        conversation_id: new URLSearchParams(location.search).get("mtid"),
        method: "dom",
        messages: ACE.mergeConsecutive(messages),
      };
    },
  });
})();
