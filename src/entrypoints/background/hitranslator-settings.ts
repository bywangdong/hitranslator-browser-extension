import type { Config } from "@/types/config/config"
import type { TranslationNodeStylePreset } from "@/types/config/translate"
import { getLocalConfig, setLocalConfig } from "@/utils/config/storage"

export type HiTranslatorWebSettings = {
  mode: "bilingual" | "translationOnly"
  targetLanguage: Config["language"]["targetCode"]
  range: Config["translate"]["page"]["range"]
  enableAIContentAware: boolean
  enableTargetLanguageSkip: boolean
  skipLanguages: Config["translate"]["page"]["skipLanguages"]
  autoTranslateLanguages: Config["translate"]["page"]["autoTranslateLanguages"]
  autoTranslatePatterns: string[]
  neverAutoTranslatePatterns: string[]
  minCharactersPerNode: number
  minWordsPerNode: number
  translationStyle: TranslationNodeStylePreset
  requestRate: number
  requestCapacity: number
  maxCharactersPerBatch: number
  maxItemsPerBatch: number
}

export function mergeHiTranslatorWebSettings(
  config: Config,
  settings: HiTranslatorWebSettings,
): Config {
  return {
    ...config,
    language: {
      ...config.language,
      targetCode: settings.targetLanguage,
    },
    translate: {
      ...config.translate,
      mode: settings.mode,
      enableAIContentAware: settings.enableAIContentAware,
      page: {
        ...config.translate.page,
        range: settings.range,
        enableTargetLanguageSkip: settings.enableTargetLanguageSkip,
        skipLanguages: settings.skipLanguages,
        autoTranslateLanguages: settings.autoTranslateLanguages,
        autoTranslatePatterns: settings.autoTranslatePatterns,
        neverAutoTranslatePatterns: settings.neverAutoTranslatePatterns,
        minCharactersPerNode: settings.minCharactersPerNode,
        minWordsPerNode: settings.minWordsPerNode,
      },
      translationNodeStyle: {
        preset: settings.translationStyle,
        isCustom: false,
        customCSS: null,
      },
      requestQueueConfig: {
        capacity: settings.requestCapacity,
        rate: settings.requestRate,
      },
      batchQueueConfig: {
        maxCharactersPerBatch: settings.maxCharactersPerBatch,
        maxItemsPerBatch: settings.maxItemsPerBatch,
      },
    },
  }
}

export async function applyHiTranslatorWebSettings(settings: HiTranslatorWebSettings) {
  const config = await getLocalConfig()
  if (!config) throw new Error("HiTranslator 网页翻译配置尚未初始化")

  const nextConfig = mergeHiTranslatorWebSettings(config, settings)
  await setLocalConfig(nextConfig)
  return nextConfig
}
