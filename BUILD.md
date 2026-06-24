# Build Instructions (for AMO reviewers)

This document describes how to reproduce the submitted Firefox build from the
source archive.

## Environment

- **OS**: Any (verified on Linux x86_64)
- **Node.js**: >= 22.0.0 (tested with Node 22 LTS)
- **pnpm**: 10.33.4 (declared in `package.json` `packageManager`)

Install `pnpm` if not present:

```bash
npm install -g pnpm@10.33.4
```

## Build Steps

From the root of the extracted source archive:

```bash
# 1. Install exact dependencies from the lockfile.
pnpm install --frozen-lockfile

# 2. Build the Firefox MV3 extension.
pnpm build:firefox
```

## Output

The unpacked extension is written to:

```
.output/firefox-mv3/
```

To reproduce the exact zip that was submitted to AMO, run:

```bash
pnpm zip:firefox
```

This produces:

```
.output/vibe-reading-<version>-firefox.zip          # the extension package
.output/vibe-reading-<version>-sources.zip          # the source archive
```

The `*-firefox.zip` artifact is bit-for-bit equivalent to the package uploaded
for review when built with the same Node / pnpm versions on a clean checkout.

## Notes

- The build uses [WXT](https://wxt.dev/) (see `wxt.config.ts`).
- No network access is required at build time beyond the initial
  `pnpm install` to fetch dependencies from the npm registry.
- No private API keys, credentials, or environment variables are required to
  build. `.env.example` lists only optional local development switches.
- Source maps are included in the build output to aid review.
