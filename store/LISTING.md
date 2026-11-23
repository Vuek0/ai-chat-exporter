# Chrome Web Store — что куда вставлять

Все тексты ниже готовы к копированию. Порядок совпадает с вкладками в Developer Dashboard.

---

## 1. Package

Загрузи `store/dist/ai-chat-exporter-1.5.0.zip`. Его собирает `store/build-zip.ps1`.

---

## 2. Store listing

**Title:** берётся из manifest: `AI Chat Exporter`.

**Summary:** берётся из manifest (`extDescription`), 128 символов.

**Category:** `Tools` («Инструменты» в русском интерфейсе Dashboard).

**Language:** English. Русский добавь отдельно кнопкой «Add a language»: ниже есть русская версия описания.

### Description (English)

```
Save your AI chats in full: every message, not a summary.

AI Chat Exporter adds an Export button to ChatGPT, Claude, Gemini and Google AI Mode. One click saves the whole conversation to a file, or moves it to another AI so you can keep going there.

EXPORT A CHAT
• JSON: structured, with roles and timestamps, ready for scripts and archives
• Markdown: clean text for notes, Obsidian, Notion or GitHub
• HTML: a readable page with a "Save as PDF" button
• Copy JSON to the clipboard

EXPORT ALL CHATS AT ONCE
On ChatGPT and Claude, export every chat in your account into one ZIP (JSON + Markdown, one file per chat, plus an index). Progress is shown on the page, and you can stop at any time and still get a ZIP with what's done.

CONTINUE IN ANOTHER AI
Started in ChatGPT and want Claude's take? "Continue in…" opens the other service and pastes the whole conversation into the message box, with a short instruction to pick up where you left off. Nothing is sent until you press Send.

PRIVATE BY DESIGN
• No servers, no accounts, no analytics, no tracking
• Chats are read only when you click, and only go to your own computer
• Open source (MIT): github.com/Vuek0/ai-chat-exporter

WORKS WITH
ChatGPT (chatgpt.com), Claude (claude.ai), Gemini (gemini.google.com) and Google AI Mode (google.com). Interface in English and Russian.

AI Chat Exporter is an independent project and is not affiliated with OpenAI, Anthropic or Google.
```

### Description (Русский)

```
Сохраняйте чаты с ИИ полностью: каждое сообщение, а не пересказ.

AI Chat Exporter добавляет кнопку Export в ChatGPT, Claude, Gemini и Google AI Mode. Один клик сохраняет весь диалог в файл или переносит его в другую нейросеть, чтобы продолжить там.

ЭКСПОРТ ЧАТА
• JSON: структурированный, с ролями и временем, удобен для скриптов и архива
• Markdown: чистый текст для заметок, Obsidian, Notion или GitHub
• HTML: удобная для чтения страница с кнопкой «Сохранить как PDF»
• Копирование JSON в буфер обмена

ВСЕ ЧАТЫ СРАЗУ
В ChatGPT и Claude можно выгрузить все чаты аккаунта в один ZIP (JSON + Markdown, по файлу на чат, плюс список). Прогресс виден прямо на странице, экспорт можно остановить в любой момент и всё равно получить ZIP с уже готовыми чатами.

ПРОДОЛЖИТЬ В ДРУГОЙ НЕЙРОСЕТИ
Начали в ChatGPT и хотите мнение Claude? «Продолжить в…» открывает другой сервис и вставляет весь диалог в поле ввода с короткой инструкцией продолжить с того же места. Ничего не отправляется, пока вы сами не нажмёте «Отправить».

ПРИВАТНОСТЬ
• Без серверов, аккаунтов, аналитики и слежки
• Чат читается только по вашему клику и попадает только на ваш компьютер
• Открытый код (MIT): github.com/Vuek0/ai-chat-exporter

РАБОТАЕТ С
ChatGPT (chatgpt.com), Claude (claude.ai), Gemini (gemini.google.com) и Google AI Mode (google.com). Интерфейс на английском и русском.

AI Chat Exporter — независимый проект, не связан с OpenAI, Anthropic или Google.
```

### Graphic assets

| Поле | Файл |
|---|---|
| Store icon 128×128 | `icons/icon-128.png` |
| Screenshots 1280×800 (до 5) | `store/screenshots/01-…png` … `05-…png` |
| Small promo tile 440×280 | `store/promo/small-440x280.png` |
| Marquee promo tile 1400×560 (необязательно) | `store/promo/marquee-1400x560.png` |
| Promo video | ссылка на YouTube с промо-роликом (залей его как «Не в списке» или публично) |

**Official URL:** не нужно (это только для подтверждённых доменов).
**Homepage URL:** `https://github.com/Vuek0/ai-chat-exporter`
**Support URL:** `https://github.com/Vuek0/ai-chat-exporter/issues`

---

## 3. Privacy

### Single purpose description

```
Export the user's AI chat conversations (ChatGPT, Claude, Gemini, Google AI Mode) to files (JSON, Markdown, HTML, ZIP), and optionally move a conversation into another AI chat service to continue it there.
```

### Permission justification

**activeTab**
```
When the user opens the extension popup on a chat tab, activeTab lets the popup talk to that tab (read which chat is open and run the export the user clicked). It is only used after the user clicks the toolbar icon.
```

**scripting**
```
If a chat tab was already open before the extension was installed or updated, its content scripts are not there yet. The popup uses chrome.scripting.executeScript to inject the extension's own bundled files into that one tab, so the user doesn't have to reload the page. No remote code is injected.
```

**downloads**
```
Used to save the exported chat as a file (JSON, Markdown, HTML, or a ZIP of all chats) to the user's Downloads folder when they click Download.
```

**clipboardWrite**
```
Used for the "Copy JSON" action, and in "Continue in…" to also put the conversation on the clipboard as a fallback in case automatic pasting into the other AI's input fails.
```

**storage**
```
chrome.storage.local keeps the user's settings (interface language, whether the in-page Export button is shown, whether the one-time hint was shown). chrome.storage.session briefly keeps the conversation text for "Continue in…" until the newly opened tab of the chosen AI service pastes it; it is deleted right after, when the tab closes, or after 3 minutes.
```

**Host permissions (content scripts on chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, www.google.com/search)**
```
The extension adds its Export button to these AI chat sites and, when the user clicks it, reads the open conversation. On ChatGPT and Claude the conversation is requested from the site's own API from within the page, using the user's existing session; on Gemini and Google AI Mode it is read from the page. On google.com the script only activates in AI Mode results. These are exactly the services the extension supports; it does not run on any other site.
```

### Remote code

`No, I am not using remote code.`

### Data usage

Ничего не отмечай: расширение ничего не собирает. По правилам Chrome Web Store «сбор» означает передачу данных с устройства пользователя, а у нас всё остаётся на компьютере.

Поставь все три галочки внизу:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:**
```
https://github.com/Vuek0/ai-chat-exporter/blob/main/PRIVACY.md
```
(ссылка заработает после того, как ты запушишь `PRIVACY.md`)

---

## 4. Distribution

- **Payments:** Free of charge
- **Visibility:** Public
- **Regions:** All regions

---

## 5. Перед отправкой

- [ ] `PRIVACY.md` запушен, ссылка открывается без входа в GitHub
- [ ] zip собран из текущего кода (`store/build-zip.ps1`), версия в имени совпадает с `manifest.json`
- [ ] промо-ролик загружен на YouTube, ссылка вставлена
- [ ] у аккаунта разработчика подтверждён e-mail (без этого не даст опубликовать)
