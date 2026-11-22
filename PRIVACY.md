# Privacy Policy — AI Chat Exporter

_Last updated: November 22, 2026_

AI Chat Exporter is a Chrome extension that saves your AI chats (ChatGPT, Claude, Gemini, Google AI Mode) as files on your computer and can open a chat in another AI service. This policy explains what the extension does with your data.

## Short version

- The extension **does not collect, send or sell any data**. It has no server, no analytics and no tracking.
- Your chats are read **only when you ask** (by clicking Export, Download, Copy or Continue in…) and go **only to your own computer**: a downloaded file, your clipboard, or a new tab of the AI service you picked.

## What the extension reads

When you start an export on a supported site, the extension reads the chat you have open:

- **ChatGPT and Claude:** it requests the chat from the site's own internal API, from inside the site's page, using the session you are already signed in with. The request goes only to that same site (chatgpt.com, chat.openai.com or claude.ai), exactly as the site itself does when you open the chat.
- **Gemini and Google AI Mode:** it reads the messages shown on the page.

For **Export all chats (ZIP)**, it requests the list of your chats and then each chat, the same way, from that same site.

Nothing is read in the background, and nothing is read on sites other than the ones listed above.

## Where the data goes

- **Downloads:** JSON, Markdown, HTML and ZIP files are created inside your browser and saved to your Downloads folder.
- **Clipboard:** "Copy JSON" and "Continue in…" put text on your clipboard.
- **Continue in…:** the chat text is kept for a few minutes in the browser's session storage (`chrome.storage.session`, in memory, cleared when the browser closes) so the new tab of the chosen AI service can paste it into the message box. It is deleted as soon as it is pasted, when the tab is closed, or after 3 minutes. The message is **not sent automatically**: you decide whether to send it to that service, and after that, that service's own privacy policy applies.

No chat content is ever sent to the developer or to any third party.

## What is stored

The extension stores only its settings in `chrome.storage.local` on your device:

- the interface language you picked;
- whether the in-page Export button is shown;
- whether the one-time hint was already shown.

If you drag the in-page Export button, its position is saved in that site's local storage in your browser (key `ace-button-pos-v2`), so the button stays where you put it.

These settings never leave your browser. The `chrome.storage` settings are removed when you uninstall the extension; the saved button position can be cleared with the site's data in Chrome settings.

## Permissions

| Permission | Why it is needed |
|---|---|
| Access to chatgpt.com, chat.openai.com, claude.ai, gemini.google.com, google.com/search | To show the Export button on those pages and read the open chat when you ask |
| `activeTab`, `scripting` | To connect the popup to a chat tab that was opened before the extension was installed |
| `downloads` | To save the exported files |
| `clipboardWrite` | For "Copy JSON" and as a backup for "Continue in…" |
| `storage` | To remember your settings and pass a chat to the new tab in "Continue in…" |

## Children

The extension is not directed at children and collects no data from anyone.

## Changes

If this policy changes, the new version will be published at this address with a new date.

## Contact

Questions: open an issue at <https://github.com/Vuek0/ai-chat-exporter/issues>.
