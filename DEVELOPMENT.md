# Development notes

## Standalone extension

```bash
corepack enable
pnpm install --frozen-lockfile
SKIP_FREE_API=true pnpm test
pnpm type-check
pnpm build
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `dist/chrome-mv3`.

Start HiTranslator before clicking the toolbar icon. Translation requests use the desktop app's configured model; model credentials never enter the extension.

## Release test boundary

`pnpm test` uses `vitest.release.config.ts`. It excludes tests for entrypoints that the public manifest deliberately does not register: upstream account and analytics flows, popup/options/side-panel UI, Notebase and guide flows, direct browser LLM execution, and custom actions that are not part of version 0.1.0.

Those source files and their tests remain in the corresponding source archive for provenance and future cleanup. `pnpm test:legacy` runs the unfiltered upstream-oriented suite and is not a release gate.

## Desktop integration

The desktop **Settings → Web Translation** screen controls display mode, target language, page range, context awareness, site rules, translated-node style, and request limits. Its Native Messaging installer currently targets macOS and registers the host for detected Chromium-family browsers.
