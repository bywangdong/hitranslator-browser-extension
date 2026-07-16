import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import ViteYaml from "@modyfi/vite-plugin-yaml"
import { defineConfig } from "wxt"
import { z } from "zod"
import {
  createExtensionClientEnvSchema,
  isLocalPackagesEnabled,
  resolveExtensionEnv,
} from "./src/env/shared"

const WXT_API_KEY_PATTERN = /^WXT_.*API_KEY/
const ALLOWED_BUNDLED_API_KEYS = new Set<string>()
const HITRANSLATOR_DEV_EXTENSION_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnP1buHnMQESP/ySKletnyOVMeghMNZTtd24Ir4mSj7d9lpPMvICsC8q5+ik9th4GmiN2N3/8t4M13ye82FthwB0+OKhubYhXNbgz4/HlRkb0pN633xU++EqRYlzgduF/ZKVj+K5slCz/QQv2KIjkt18ckTIbK+0Qi5tVoamFOehtBbEIj9cNbh6vrwJQm1/iiDn3aW2J9GyHiopyyb9tiHPujczZmsZAEWMeO3Iyi+NjWWtQrstuURdRbjqbAxAv5wlmFbBwvj6WkAiesDyHILIfe3XFWHTPp4LSIqujJuhsIhU7xrgFJrO12rXmbwp+TtXgxdC7s7E6Akb8UQZ9yQIDAQAB"
const useLocalPackages = isLocalPackagesEnabled(process.env)
const shouldSkipEnvValidation = process.env.WXT_SKIP_ENV_VALIDATION === "true"
const EXCLUDED_RELEASE_ENTRYPOINTS = new Set([
  "guide",
  "input-injector",
  "options",
  "popup",
  "sidepanel",
  "translation-hub",
])

// See https://wxt.dev/api/config.html
export default defineConfig({
  srcDir: "src",
  outDir: "dist",
  imports: false,
  modules: ["@wxt-dev/module-react", "@wxt-dev/i18n/module"],
  manifestVersion: 3,
  // WXT top level alias - will be automatically synced to tsconfig.json paths and Vite alias
  alias: useLocalPackages
    ? {
        "@read-frog/definitions": path.resolve(
          __dirname,
          "../read-frog-monorepo/packages/definitions/src",
        ),
        "@read-frog/api-contract": path.resolve(
          __dirname,
          "../read-frog-monorepo/packages/api-contract/src",
        ),
      }
    : {},
  manifest: ({ browser }) => ({
    name: "HiTranslator Web Translator",
    description: "Translate webpages with the models configured in HiTranslator.",
    default_locale: "en",
    homepage_url: "https://github.com/iobee/hitranslator-browser-extension",
    ...((browser === "chrome" || browser === "edge") && {
      key: HITRANSLATOR_DEV_EXTENSION_KEY,
    }),
    action: {
      default_title: "HiTranslator 网页翻译",
    },
    permissions: [
      "storage",
      "tabs",
      "alarms",
      "contextMenus",
      "scripting",
      "webNavigation",
      "nativeMessaging",
      ...(browser !== "firefox" ? ["offscreen"] : []),
    ],
    host_permissions: [
      "*://*/*", // Required for scripting.executeScript in any frame
    ],
    // Allow images/SVGs referenced by content-script UI <img> tags to be loaded from
    // moz-extension:// URLs on regular pages. Firefox enforces this more strictly.
    web_accessible_resources: [
      {
        resources: ["assets/*.png", "assets/*.svg", "assets/*.webp"],
        matches: ["*://*/*", "file:///*"],
      },
    ],
    // Firefox-specific settings for MV3
    ...(browser === "firefox" && {
      // Override default CSP to exclude `upgrade-insecure-requests` (Firefox MV3 default),
      // which would upgrade custom provider HTTP URLs (e.g. LAN) to HTTPS.
      content_security_policy: {
        extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
      },
      browser_specific_settings: {
        gecko: {
          id: "{bd311a81-4530-4fcc-9178-74006155461b}",
          strict_min_version: "112.0",
          data_collection_permissions: {
            required: ["none"],
            optional: ["technicalAndInteraction"],
          },
        },
      },
    }),
  }),
  hooks: {
    "entrypoints:found": (_wxt, entrypoints) => {
      for (let index = entrypoints.length - 1; index >= 0; index -= 1) {
        if (EXCLUDED_RELEASE_ENTRYPOINTS.has(entrypoints[index].name)) {
          entrypoints.splice(index, 1)
        }
      }
    },
    "build:manifestGenerated": (_wxt, manifest) => {
      if (manifest.action) {
        delete manifest.action.default_popup
        manifest.action.default_title = "HiTranslator 网页翻译"
      }
      delete manifest.options_ui
      delete manifest.side_panel
      manifest.permissions = manifest.permissions?.filter(
        (permission) => permission !== "sidePanel",
      )
    },
    "build:done": (wxt, output) => {
      const releaseDocuments = ["LICENSE", "NOTICE", "UPSTREAM.md", "SOURCE_CODE_REVIEW.md"]
      for (const document of releaseDocuments) {
        fs.copyFileSync(path.join(__dirname, document), path.join(wxt.config.outDir, document))
        output.publicAssets.push({ type: "asset", fileName: document })
      }
    },
  },
  zip: {
    name: "HiTranslator-Web",
    artifactTemplate: "HiTranslator-Web-{{version}}-{{browser}}.zip",
    sourcesTemplate: "HiTranslator-Web-{{version}}-sources.zip",
    zipSources: true,
    includeSources: ["LICENSE", "NOTICE", "UPSTREAM.md", "SOURCE_CODE_REVIEW.md"],
    excludeSources: ["docs/**/*", "assets/**/*", "repos/**/*", "readmes/**/*"],
  },
  dev: {
    server: {
      // Prefer 3333 over WXT's default 3000 while still allowing WXT to pick
      // another open port when 3333 is already taken.
      port: 3333,
      strictPort: false,
    },
  },
  vite: (configEnv) => ({
    resolve: {
      // CodeMirror breaks with "Unrecognized extension value in extension set"
      // if the bundle contains more than one copy of these packages (#1782).
      dedupe: [
        "@codemirror/state",
        "@codemirror/view",
        "@codemirror/language",
        "@codemirror/lint",
        "@codemirror/autocomplete",
        "@codemirror/search",
        "@codemirror/commands",
        "@lezer/common",
      ],
    },
    plugins: [
      // Lets the runtime i18next facade (src/utils/i18n) `import` the `src/locales/*.yml`
      // files as JS objects so i18next can bundle them for runtime language switching.
      //
      // This does NOT replace `@wxt-dev/i18n/module` (still registered in `modules` above).
      // That module reads the same .yml files via its own fs-based mechanism — a separate
      // path from this Vite `import` — and is kept ONLY for two build-time jobs it still owns:
      //   1. Emitting `_locales/*/messages.json`, which the browser uses to localize the
      //      manifest `__MSG_extName__` / `__MSG_extDescription__` below. That is chosen by
      //      the browser UI language at load time and is NOT runtime-switchable (platform
      //      constraint), so it stays with @wxt-dev/i18n.
      //   2. Generating the `#i18n` key types (.wxt/i18n/structure.d.ts) that the facade
      //      reuses for autocomplete/type-checking at every `i18n.t('key')` call site.
      // Runtime UI string lookup itself no longer goes through @wxt-dev/i18n.
      ViteYaml(),
      ...(configEnv.mode === "production"
        ? [
            {
              name: "check-api-key-env",
              buildStart() {
                z.object(
                  createExtensionClientEnvSchema(
                    configEnv.mode === "production",
                    shouldSkipEnvValidation,
                  ),
                ).parse(resolveExtensionEnv(process.env))

                const apiKeyVars = Object.keys(process.env)
                  .filter((key) => WXT_API_KEY_PATTERN.test(key))
                  .filter((key) => !ALLOWED_BUNDLED_API_KEYS.has(key))

                if (apiKeyVars.length > 0) {
                  throw new Error(
                    `\n\nFound WXT_*_API_KEY environment variables that may be bundled:\n` +
                      `${apiKeyVars.map((k) => `   - ${k}`).join("\n")}\n\n` +
                      `Please unset these variables before building for production.\n`,
                  )
                }
              },
            },
          ]
        : []),
    ],
  }),
})
