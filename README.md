# Vibe Reading

Vibe Reading is a browser extension for reading, translating, and learning from
web pages with local configuration and user-provided AI or translation providers.

This fork focuses on one core workflow: translate full web pages reliably without
depending on a project-hosted backend. Features that need a network service,
such as AI translation, use the provider endpoints and API keys configured by the
user.

## Features

- Full-page translation with bilingual and translation-only display modes.
- Paragraph and page-title translation for content-heavy pages.
- LLM-based language detection for auto-translate and skip-language rules.
- Context-aware AI translation using page content and summaries.
- Configurable AI and translation providers, including local or self-hosted
  provider endpoints.
- Custom prompts, translation styles, page rules, and batch/rate controls.
- Local import/export for configuration portability.
- No Notebase, hosted account, hosted storage, telemetry dashboard, or project
  backend dependency.

## Differences From Upstream

Vibe Reading is intentionally smaller than the upstream Read Frog project. The
following upstream capabilities are not included in this fork:

| Upstream capability                                         | Vibe Reading status | Reason                                                                         |
| ----------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| Notebase hosted storage and backend-backed project features | Removed             | The extension is designed to work without a project-hosted backend.            |
| Custom AI Actions                                           | Removed             | Keeps the product focused on page translation instead of general AI workflows. |
| Video Subtitles                                             | Removed             | Outside the core full-page translation workflow.                               |
| Input Translation                                           | Removed             | Avoids injecting translation behavior into user input fields.                  |
| Overlay Tools                                               | Removed             | Reduces page UI surface and content-script complexity.                         |
| Text to Speech                                              | Removed             | Keeps the extension focused on reading and translation, not audio playback.    |
| translation-hub                                             | Removed             | Avoids bundled upstream hub integrations.                                      |
| Config Backup                                               | Removed             | Local import/export remains available; hosted backup is not included.          |
| Beta Experience                                             | Removed             | Removes experimental feature gates from the fork.                              |
| Extension Activation Mode                                   | Removed             | Page translation is controlled directly by translation actions and page rules. |
| Statistics                                                  | Removed             | Avoids local analytics dashboards and charting dependencies.                   |
| Language Detection mode setting                             | Removed             | Language detection always uses the configured LLM path.                        |

## Development

```bash
pnpm install
SKIP_FREE_API=true pnpm test
pnpm type-check
pnpm build
```

`src/utils/host/translate/api/__tests__/free-api.test.ts` depends on live
external translation services. Set `SKIP_FREE_API=true` for local validation.

## License And Attribution

Vibe Reading is a modified fork of
[Read Frog](https://github.com/mengxi-ream/read-frog). Thanks to the Read Frog
authors and contributors for the original GPL-licensed work.

This project is distributed under the GNU General Public License version 3. See
[LICENSE](./LICENSE) for the full license text. As a modified version, Vibe
Reading preserves the GPLv3 terms, keeps the source available under the same
license, and marks the work as changed so issues in this fork are not attributed
to the upstream project.
