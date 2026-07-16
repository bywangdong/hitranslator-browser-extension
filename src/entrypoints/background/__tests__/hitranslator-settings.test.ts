import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import {
  type HiTranslatorWebSettings,
  mergeHiTranslatorWebSettings,
} from "../hitranslator-settings"

const desktopSettings: HiTranslatorWebSettings = {
  mode: "translationOnly",
  targetLanguage: "jpn",
  range: "main",
  enableAIContentAware: true,
  enableTargetLanguageSkip: false,
  skipLanguages: ["eng"],
  autoTranslateLanguages: ["fra"],
  autoTranslatePatterns: ["wikipedia.org"],
  neverAutoTranslatePatterns: ["internal.example.com"],
  minCharactersPerNode: 8,
  minWordsPerNode: 2,
  translationStyle: "blockquote",
  requestRate: 4,
  requestCapacity: 20,
  maxCharactersPerBatch: 1800,
  maxItemsPerBatch: 6,
}

describe("HiTranslator webpage settings adapter", () => {
  it("maps desktop preferences onto Read Frog's existing config fields", () => {
    const config = structuredClone(DEFAULT_CONFIG)
    const next = mergeHiTranslatorWebSettings(config, desktopSettings)

    expect(next.language.targetCode).toBe("jpn")
    expect(next.translate.mode).toBe("translationOnly")
    expect(next.translate.page.range).toBe("main")
    expect(next.translate.enableAIContentAware).toBe(true)
    expect(next.translate.page.enableTargetLanguageSkip).toBe(false)
    expect(next.translate.page.autoTranslatePatterns).toEqual(["wikipedia.org"])
    expect(next.translate.page.neverAutoTranslatePatterns).toEqual(["internal.example.com"])
    expect(next.translate.translationNodeStyle).toEqual({
      preset: "blockquote",
      isCustom: false,
      customCSS: null,
    })
    expect(next.translate.requestQueueConfig).toEqual({ rate: 4, capacity: 20 })
    expect(next.translate.batchQueueConfig).toEqual({
      maxCharactersPerBatch: 1800,
      maxItemsPerBatch: 6,
    })
  })

  it("preserves unrelated Read Frog features", () => {
    const config = structuredClone(DEFAULT_CONFIG)
    const next = mergeHiTranslatorWebSettings(config, desktopSettings)

    expect(next.selectionToolbar).toEqual(config.selectionToolbar)
    expect(next.videoSubtitles).toEqual(config.videoSubtitles)
    expect(next.translate.node).toEqual(config.translate.node)
  })
})
