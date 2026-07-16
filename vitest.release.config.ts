import { defineConfig, mergeConfig } from "vitest/config"
import baseConfig from "./vitest.config"

// These suites cover upstream surfaces that are intentionally not registered in
// the HiTranslator public build. They remain in the corresponding source archive
// for provenance and future reference, but are not release gates.
const RETIRED_SCOPE_TESTS = [
  "src/entrypoints/background/__tests__/analytics.test.ts",
  "src/entrypoints/background/__tests__/background-stream.test.ts",
  "src/entrypoints/background/__tests__/llm-generate-text.test.ts",
  "src/entrypoints/background/__tests__/notebase-pending-save.test.ts",
  "src/entrypoints/background/__tests__/side-panel.test.ts",
  "src/entrypoints/options/**",
  "src/entrypoints/popup/**",
  "src/entrypoints/selection.content/selection-toolbar/__tests__/custom-action-prompt.test.ts",
  "src/entrypoints/selection.content/selection-toolbar/__tests__/request-rerun.test.tsx",
  "src/entrypoints/selection.content/selection-toolbar/custom-action-button/__tests__/**",
  "src/types/config/__tests__/config-provider-enabled.test.ts",
  "src/utils/config/__tests__/feature-providers.test.ts",
  "src/utils/guide/**",
  "src/utils/subtitles/processor/__tests__/translator.test.ts",
]

export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      exclude: RETIRED_SCOPE_TESTS,
    },
  }),
)
