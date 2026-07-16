import type { Config } from "@/types/config/config"
import type { ProviderConfig } from "@/types/config/provider"
import type { BatchQueueConfig, RequestQueueConfig } from "@/types/config/translate"
import { BATCH_SEPARATOR_LINE_PATTERN } from "@/utils/constants/prompt"
import { db } from "@/utils/db/dexie/db"
import { Sha256Hex } from "@/utils/hash"
import { logger } from "@/utils/logger"
import { onMessage } from "@/utils/message"
import { BatchQueue } from "@/utils/request/batch-queue"
import { RequestQueue } from "@/utils/request/request-queue"
import { ensureInitializedConfig } from "./config"
import { requestHiTranslatorTranslationBatch } from "./hitranslator-native"

const FALLBACK_REQUEST_QUEUE_CONFIG: RequestQueueConfig = {
  rate: 8,
  capacity: 60,
}
const FALLBACK_BATCH_QUEUE_CONFIG: BatchQueueConfig = {
  maxCharactersPerBatch: 1000,
  maxItemsPerBatch: 4,
}

type NativeTranslationContext = {
  webTitle?: string | null
  webDescription?: string | null
  webContent?: string | null
  webSummary?: string | null
}

type NativeTranslationData = {
  text: string
  langConfig: Config["language"]
  providerConfig: ProviderConfig
  hash: string
  scheduleAt: number
  context?: NativeTranslationContext
}

function normalizeContextValue(value: string | null | undefined) {
  if (value === null || value === undefined) return value
  return value.trim() || null
}

export function parseBatchResult(result: string): string[] {
  return result
    .trim()
    .split(BATCH_SEPARATOR_LINE_PATTERN)
    .map((text) => text.trim())
}

/**
 * HiTranslator's desktop runtime accepts batches regardless of which legacy
 * provider placeholder produced the request in the page engine.
 */
export function shouldUseBatchQueue(_providerConfig: ProviderConfig): boolean {
  return true
}

async function createNativeTranslationQueues({
  requestQueueConfig,
  batchQueueConfig,
}: {
  requestQueueConfig: RequestQueueConfig
  batchQueueConfig: BatchQueueConfig
}) {
  const requestQueue = new RequestQueue({
    rate: requestQueueConfig.rate,
    capacity: requestQueueConfig.capacity,
    timeoutMs: 125_000,
    maxRetries: 0,
    baseRetryDelayMs: 1_000,
  })

  const batchQueue = new BatchQueue<NativeTranslationData, string>({
    maxCharactersPerBatch: batchQueueConfig.maxCharactersPerBatch,
    maxItemsPerBatch: batchQueueConfig.maxItemsPerBatch,
    batchDelay: 100,
    maxRetries: 1,
    enableFallbackToIndividual: true,
    getBatchKey: (data) =>
      Sha256Hex(
        `${data.langConfig.sourceCode}-${data.langConfig.targetCode}`,
        data.context ? JSON.stringify(data.context) : "",
      ),
    getCharacters: (data) => data.text.length,
    executeBatch: async (dataList) => {
      const first = dataList[0]
      const earliestScheduleAt = Math.min(...dataList.map((data) => data.scheduleAt))
      const requestHash = Sha256Hex(...dataList.map((data) => data.hash))
      return requestQueue.enqueue(
        () =>
          requestHiTranslatorTranslationBatch({
            texts: dataList.map((data) => data.text),
            sourceLanguage: first.langConfig.sourceCode,
            targetLanguage: first.langConfig.targetCode,
            context: first.context,
          }),
        earliestScheduleAt,
        requestHash,
      )
    },
    executeIndividual: async (data) => {
      const translations = await requestQueue.enqueue(
        () =>
          requestHiTranslatorTranslationBatch({
            texts: [data.text],
            sourceLanguage: data.langConfig.sourceCode,
            targetLanguage: data.langConfig.targetCode,
            context: data.context,
          }),
        data.scheduleAt,
        data.hash,
      )
      return translations[0] ?? ""
    },
    onError: (error, context) => {
      logger.error("HiTranslator desktop translation failed", {
        error: error.message,
        batchKey: context.batchKey,
        fallback: context.isFallback,
      })
    },
  })

  return { requestQueue, batchQueue }
}

async function translateWithLocalCache(
  data: NativeTranslationData,
  batchQueue: BatchQueue<NativeTranslationData, string>,
) {
  if (data.hash) {
    const cached = await db.translationCache.get(data.hash)
    if (cached) return cached.translation
  }

  const result = (await batchQueue.enqueue(data)).trim()
  if (result && data.hash) {
    await db.translationCache.put({
      key: data.hash,
      translation: result,
      createdAt: new Date(),
    })
  }
  return result
}

export async function setUpWebPageTranslationQueue() {
  const config = await ensureInitializedConfig()
  const requestQueueConfig = config?.translate.requestQueueConfig ?? FALLBACK_REQUEST_QUEUE_CONFIG
  const batchQueueConfig = config?.translate.batchQueueConfig ?? FALLBACK_BATCH_QUEUE_CONFIG
  const { requestQueue, batchQueue } = await createNativeTranslationQueues({
    requestQueueConfig,
    batchQueueConfig,
  })

  onMessage("enqueueTranslateRequest", async (message) => {
    const {
      text,
      langConfig,
      providerConfig,
      scheduleAt,
      hash,
      webTitle,
      webDescription,
      webContent,
      webSummary,
    } = message.data

    return translateWithLocalCache(
      {
        text,
        langConfig,
        providerConfig,
        scheduleAt,
        hash,
        context: {
          webTitle: normalizeContextValue(webTitle),
          webDescription: normalizeContextValue(webDescription),
          webContent: normalizeContextValue(webContent),
          webSummary: normalizeContextValue(webSummary),
        },
      },
      batchQueue,
    )
  })

  // The complete page excerpt is already passed to the desktop translation
  // prompt. A second cloud summary request would duplicate cost and data flow.
  onMessage("getOrGenerateWebPageSummary", async () => null)

  onMessage("setTranslateRequestQueueConfig", (message) => {
    requestQueue.setQueueOptions(message.data)
  })
  onMessage("setTranslateBatchQueueConfig", (message) => {
    batchQueue.setBatchConfig(message.data)
  })
}

export async function setUpSubtitlesTranslationQueue() {
  const config = await ensureInitializedConfig()
  const requestQueueConfig =
    config?.videoSubtitles.requestQueueConfig ?? FALLBACK_REQUEST_QUEUE_CONFIG
  const batchQueueConfig = config?.videoSubtitles.batchQueueConfig ?? FALLBACK_BATCH_QUEUE_CONFIG
  const { requestQueue, batchQueue } = await createNativeTranslationQueues({
    requestQueueConfig,
    batchQueueConfig,
  })

  onMessage("enqueueSubtitlesTranslateRequest", async (message) => {
    const {
      text,
      langConfig,
      providerConfig,
      scheduleAt,
      hash,
      webTitle,
      webDescription,
      summary,
    } = message.data

    return translateWithLocalCache(
      {
        text,
        langConfig,
        providerConfig,
        scheduleAt,
        hash,
        context: {
          webTitle: normalizeContextValue(webTitle),
          webDescription: normalizeContextValue(webDescription),
          webSummary: normalizeContextValue(summary),
        },
      },
      batchQueue,
    )
  })

  onMessage("getSubtitlesSummary", async () => null)

  onMessage("microsoftBatchTranslate", async (message) => {
    const { texts, fromLang, toLang } = message.data
    if (!Array.isArray(texts) || texts.length === 0) return []
    return requestHiTranslatorTranslationBatch({
      texts,
      sourceLanguage: fromLang || "auto",
      targetLanguage: toLang,
    })
  })

  onMessage("setSubtitlesRequestQueueConfig", (message) => {
    requestQueue.setQueueOptions(message.data)
  })
  onMessage("setSubtitlesBatchQueueConfig", (message) => {
    batchQueue.setBatchConfig(message.data)
  })
}
