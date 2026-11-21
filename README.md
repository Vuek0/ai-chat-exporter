# AI Chat Exporter

A Chrome extension that exports the **full** chat history (every user and AI message, not a summary) from popular AI chat services, and lets you continue a conversation in another AI.

| Service | Site | How messages are collected |
|---------|------|----------------------------|
| ChatGPT | chatgpt.com, chat.openai.com | Internal chat API, falls back to reading the page |
| Claude | claude.ai | Internal chat API, falls back to reading the page |
| Gemini | gemini.google.com | Reads the page, auto-scrolling up to load the whole chat |
| Google AI Mode | google.com/search (AI Mode) | Reads the page (answer text only, without image carousels or buttons) |

Export formats: **JSON** (main), **Markdown**, or copy JSON to the clipboard.

The interface is available in **English** and **Russian** and follows your Chrome language (English is the default for all other languages). The transfer prompt and Markdown labels use the same language.

## Installation

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder (`ai-chat-exporter`).
4. Pin the extension icon to the toolbar.

After updating the code, click the reload button ⟳ on the extension card and refresh open chat tabs.

## Usage

1. Open a chat in ChatGPT, Claude, Gemini or Google AI Mode.
2. Click the **Export** button next to the message input, then **Download JSON**.
   The same actions are available in the extension popup (toolbar icon).
3. The file is saved to your Downloads folder as `chatgpt_<chat title>_2026-11-22.json`.

About the in-page button:

- It sits next to the chat input by default and follows it when the layout changes.
- You can drag it anywhere; the position is remembered per site. Double-click to snap it back to the input.
- The first time it appears, it pulses once and shows a short hint.
- You can hide it with the **Export button on chat pages** checkbox in the popup.

If a chat tab was open before the extension was installed, the popup injects the scripts automatically; if that fails, refresh the page (F5).

## Continue a chat in another AI

The **Export** menu (and the popup) has a **Continue in…** section with ChatGPT, Claude and Gemini (the current service is hidden).

1. The extension turns the whole chat into one prompt: a short intro ("continue this conversation, first summarize where we left off") followed by every message labeled by role.
2. It opens a new tab with the chosen service and pastes the prompt into the input field.
3. The message is **not sent automatically**, so you can add your own question and press Send.

The prompt is also copied to the clipboard, so if automatic pasting fails, just press Ctrl+V.
Very long chats may be attached as a file by ChatGPT or Claude instead of appearing as text in the input. That's expected and the context is still passed.

## JSON format

```json
{
  "format": "ai-chat-export",
  "version": 1,
  "source": "chatgpt",
  "source_name": "ChatGPT",
  "title": "Python function",
  "url": "https://chatgpt.com/c/...",
  "conversation_id": "...",
  "model": "gpt-5",
  "created_at": "2026-11-20T10:00:00.000Z",
  "exported_at": "2026-11-22T12:00:00.000Z",
  "extraction_method": "api",
  "warnings": [],
  "message_count": 2,
  "messages": [
    { "index": 0, "role": "user", "content": "Write an add function", "timestamp": "..." },
    { "index": 1, "role": "assistant", "content": "```python\ndef add(a, b):\n    return a + b\n```", "timestamp": "..." }
  ]
}
```

- `role` is always `user` or `assistant`.
- `content` is Markdown (code blocks, lists, tables and formulas are preserved).
- `timestamp`, `model` and `attachments` are included when the service provides them (usually with `api` extraction).
- `extraction_method` is `api` or `dom`; `warnings` explains why the page had to be read instead of the API.

## Notes

- Only the **currently visible branch** of the chat is exported (if you edited messages or regenerated answers, the selected version is used).
- Hidden model reasoning ("thinking") and internal tool calls are not included, only what is shown in the chat.
- Images are marked as `[image]`; file attachments keep their names.
- In Google AI Mode, source chips, image carousels and the sources panel are skipped; only the answer text is exported. The extension works on the AI Mode tab and on AI answers in search results, not on regular results.
- These services change their markup and internal APIs from time to time. If something breaks, the fix usually lives in a single file in `src/extractors/`.
- Everything runs locally in your browser. The extension sends your chats nowhere.

## Project structure

```
manifest.json            Manifest V3
icons/                   Extension icons (16, 32, 48, 128 px)
src/common.js            Extractor registry, HTML → Markdown converter
src/extractors/*.js      One extractor per service
src/format.js            JSON / Markdown / transfer prompt formats, file names
src/content.js           Builds the final export object, talks to the popup
src/ui.js                Floating in-page export button
src/transfer.js          Chat transfer: builds the prompt and pastes it into the input
src/background.js        Opens the target service tab and hands it the prompt
popup/                   Extension popup and file downloads
_locales/                UI translations (en, ru)
tests/                   Mock pages for testing the converter and the button
```

### Adding a translation

Copy `_locales/en/messages.json` to `_locales/<lang>/messages.json` and translate the `message` values. `{0}`, `{1}` are placeholders. For languages with several plural forms, add `count_one`, `count_few`, `count_many`, `count_other` as needed.

### Adding a new service

Create `src/extractors/<name>.js` that calls `__ACE__.register({ id, name, match(host), async extract() })`, where `extract` returns `{ title, messages: [{ role, content }] }`. Then add the file and domain to `manifest.json` and the domain check in `popup/popup.js`.

## License

MIT, see [LICENSE](LICENSE).
