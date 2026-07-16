# Release process

HiTranslator Browser Extension releases are built from a public tag whose version matches `package.json`.

## Local verification

```bash
corepack enable
pnpm install --frozen-lockfile
SKIP_FREE_API=true pnpm test
pnpm type-check
pnpm zip
shasum -a 256 dist/HiTranslator-Web-*.zip
```

Verify the unpacked `dist/chrome-mv3` build in a Chromium browser connected to a running HiTranslator desktop app.

## Publish

1. Update `package.json`, `CHANGELOG.md`, and the changeset.
2. Commit the exact release source.
3. Create and push tag `v<package-version>`.
4. The release workflow validates the tag, reruns tests and type checking, builds the binary and corresponding-source archives, creates `SHA256SUMS.txt`, and publishes all three files to GitHub Releases.

Do not publish a binary without its matching source tag and source archive.
