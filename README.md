# Vibe Reading

Vibe Reading is a browser extension for reading, translating, and learning from
web pages with local configuration and user-provided AI or translation providers.

The extension does not depend on a project-hosted backend. Features that need a
network service, such as AI translation, use the provider endpoints and API keys
configured by the user.

## Features

- Page translation with bilingual and translation-only modes.
- Selection translation, explanation, and text-to-speech.
- Context-aware AI translation using page content.
- YouTube subtitle translation.
- Custom AI actions and prompt configuration.
- Import/export of local configuration.

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
