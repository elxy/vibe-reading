# Privacy Policy

_Last updated: 2026-06-24_

Vibe Reading is an open-source browser extension that translates web pages
using AI or translation providers that **you** configure. This policy explains
exactly what data the extension handles and where it goes.

## TL;DR

- Vibe Reading **does not have a backend**. It does not send any data to any
  server operated by the developers of Vibe Reading.
- Your **API keys, settings, prompts, and translation cache** are stored
  **locally** in your browser only.
- When you translate a page, the page text is sent **directly from your
  browser to the AI / translation provider you configured** (for example
  OpenAI, DeepSeek, or your own self-hosted endpoint). Your choice of provider
  controls where this data goes.
- No telemetry, no analytics, no tracking, no cookies, no user accounts.

## What data does the extension handle?

### 1. Data stored locally on your device

The following is stored in `chrome.storage` and/or IndexedDB in your browser,
and never leaves your device unless you export it manually:

- Extension settings (source/target languages, translation mode, UI prefs).
- AI / translation provider configuration, including **API keys** and
  endpoint URLs you enter.
- Custom prompts and translation styles you create.
- Per-page translation rules.
- A local cache of recent translations to avoid re-translating identical text.

Uninstalling the extension or clearing your browser data removes all of the
above.

### 2. Data sent to providers you configure

When you trigger a translation, Vibe Reading sends the following from your
browser **directly** to the provider you selected, using the API key you
provided:

- The text content of the page (or selected paragraph) being translated.
- Optional context derived from the page (e.g. page title, surrounding
  paragraphs) when "AI Smart Context" is enabled.
- The model name, prompt, and language pair you configured.

Vibe Reading does not proxy, intercept, log, or duplicate these requests.
The destination, retention, and processing of this data are governed by the
**privacy policy of the provider you choose** (OpenAI, DeepSeek, your
self-hosted endpoint, etc.). Please review that provider's policy before
sending sensitive content through it.

### 3. Data sent to the developers of Vibe Reading

**None.** Vibe Reading has no backend, no analytics SDK, no error-reporting
service, no update server beyond the browser's add-on store, and no telemetry
of any kind.

## Browser permissions and why they are needed

| Permission                  | Purpose                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `storage`                   | Save your settings, API keys, and translation cache locally in the browser.        |
| `tabs`                      | Identify the active tab so the popup can act on the page you are reading.          |
| `alarms`                    | Schedule periodic cleanup of the local translation cache.                          |
| `scripting`                 | Inject the translation content script into the page on demand.                     |
| `webNavigation`             | Detect single-page-app navigations so translation can re-apply after route change. |
| `host_permissions: *://*/*` | Required so the translation content script can run on any web page you visit.      |

The host permission is used **only** to inject the translation logic into the
page in front of you. The extension does not read or transmit page content
unless you actively trigger a translation.

## Cookies, tracking, and third parties

- Vibe Reading does **not** set or read any cookies.
- Vibe Reading does **not** include any third-party analytics, advertising,
  or tracking libraries.
- Vibe Reading does **not** create or require any user account.

## Children's privacy

Vibe Reading does not knowingly collect any data from anyone, including
children. Because the extension has no backend and no analytics, no personal
information is collected by us at all.

## Changes to this policy

If this policy changes, the updated version will be published in the project
repository with a new "Last updated" date. Significant changes will also be
noted in the release notes for the affected extension version.

## Contact

For privacy questions, bug reports, or feature requests, please open an issue
at:

<https://github.com/elxy/vibe-reading/issues>
