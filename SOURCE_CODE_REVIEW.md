# Corresponding source and release build

This document describes how to rebuild the Chromium extension from the corresponding source published for each HiTranslator Browser Extension release.

## Requirements

- Node.js `>=22.22.0`
- Corepack
- The pnpm version declared in `package.json`
- macOS or Linux for the release ZIP helper

No production `.env` file, OAuth client, analytics key, or model API key is required.

## Build

```bash
corepack enable
pnpm install --frozen-lockfile
SKIP_FREE_API=true pnpm test
pnpm type-check
pnpm build
pnpm zip
```

The unpacked Chromium build is written to:

```text
dist/chrome-mv3
```

The generated binary and corresponding-source ZIPs are written under `dist/`. Their filenames contain the package version and target. The project documents a repeatable source build; byte-for-byte ZIP identity is not promised because archive timestamps can differ.

## Release correspondence

Every published binary version must have:

1. a Git tag containing the exact source used for the build;
2. the complete lockfile and build configuration;
3. `LICENSE`, `NOTICE`, and `UPSTREAM.md` in both the build output and source archive;
4. a release page linking the binary and the corresponding source tag.

The HiTranslator desktop application is built and distributed separately. It communicates with this extension through the documented Native Messaging request boundary and is not part of the browser-extension binary or corresponding source archive.
