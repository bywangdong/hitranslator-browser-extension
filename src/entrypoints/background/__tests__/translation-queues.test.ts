import type { ProviderConfig } from "@/types/config/provider"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"

const onMessageMock = vi.fn<(...args: any[]) => any>()
const ensureInitializedConfigMock = vi.fn<(...args: any[]) => any>()
const translationCacheGetMock = vi.fn<(...args: any[]) => any>()
const translationCachePutMock = vi.fn<(...args: any[]) => any>()
const requestHiTranslatorTranslationBatchMock = vi.fn<(...args: any[]) => any>()

vi.mock("@/utils/message", () => ({ onMessage: onMessageMock }))
vi.mock("../config", () => ({ ensureInitializedConfig: ensureInitializedConfigMock }))
vi.mock("../hitranslator-native", () => ({
  requestHiTranslatorTranslationBatch: requestHiTranslatorTranslationBatchMock,
}))
vi.mock("@/utils/db/dexie/db", () => ({
  db: {
    translationCache: {
      get: translationCacheGetMock,
      put: translationCachePutMock,
    },
  },
}))

function getRegisteredMessageHandler(name: string) {
  const registration = onMessageMock.mock.calls.find((call) => call[0] === name)
  if (!registration) throw new Error(`Message handler not registered: ${name}`)
  return registration[1] as (message: { data: Record<string, any> }) => Promise<any>
}

const providerPlaceholder: ProviderConfig = {
  id: "microsoft-translate-default",
  name: "Desktop model",
  provider: "microsoft-translate",
  enabled: true,
}

describe("HiTranslator native translation queues", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    ensureInitializedConfigMock.mockResolvedValue({
      ...DEFAULT_CONFIG,
      translate: {
        ...DEFAULT_CONFIG.translate,
        requestQueueConfig: { rate: 100, capacity: 100 },
        batchQueueConfig: { maxCharactersPerBatch: 1000, maxItemsPerBatch: 1 },
      },
      videoSubtitles: {
        ...DEFAULT_CONFIG.videoSubtitles,
        requestQueueConfig: { rate: 100, capacity: 100 },
        batchQueueConfig: { maxCharactersPerBatch: 1000, maxItemsPerBatch: 1 },
      },
    })
    translationCacheGetMock.mockResolvedValue(undefined)
    translationCachePutMock.mockResolvedValue(undefined)
    requestHiTranslatorTranslationBatchMock.mockResolvedValue(["桌面译文"])
  })

  it("batches every legacy provider placeholder through the desktop runtime", async () => {
    const { shouldUseBatchQueue } = await import("../translation-queues")
    expect(shouldUseBatchQueue(providerPlaceholder)).toBe(true)
    expect(
      shouldUseBatchQueue({
        id: "openai-default",
        name: "OpenAI",
        provider: "openai",
        enabled: true,
        apiKey: "unused",
        model: { model: "gpt-4o-mini", isCustomModel: false, customModel: null },
      }),
    ).toBe(true)
  })

  it("routes webpage text and context through Native Messaging", async () => {
    const { setUpWebPageTranslationQueue } = await import("../translation-queues")
    await setUpWebPageTranslationQueue()

    const handler = getRegisteredMessageHandler("enqueueTranslateRequest")
    await expect(
      handler({
        data: {
          text: "hello",
          langConfig: DEFAULT_CONFIG.language,
          providerConfig: providerPlaceholder,
          scheduleAt: Date.now(),
          hash: "web-hash",
          webTitle: " Page title ",
          webDescription: " Page description ",
          webContent: " Page body ",
          webSummary: " Ready summary ",
        },
      }),
    ).resolves.toBe("桌面译文")

    expect(requestHiTranslatorTranslationBatchMock).toHaveBeenCalledWith({
      texts: ["hello"],
      sourceLanguage: DEFAULT_CONFIG.language.sourceCode,
      targetLanguage: DEFAULT_CONFIG.language.targetCode,
      context: {
        webTitle: "Page title",
        webDescription: "Page description",
        webContent: "Page body",
        webSummary: "Ready summary",
      },
    })
    expect(translationCachePutMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: "web-hash", translation: "桌面译文" }),
    )
  })

  it("uses a local cached webpage translation without contacting the desktop", async () => {
    translationCacheGetMock.mockResolvedValueOnce({
      key: "web-hash",
      translation: "缓存译文",
    })
    const { setUpWebPageTranslationQueue } = await import("../translation-queues")
    await setUpWebPageTranslationQueue()
    const handler = getRegisteredMessageHandler("enqueueTranslateRequest")

    await expect(
      handler({
        data: {
          text: "hello",
          langConfig: DEFAULT_CONFIG.language,
          providerConfig: providerPlaceholder,
          scheduleAt: Date.now(),
          hash: "web-hash",
        },
      }),
    ).resolves.toBe("缓存译文")
    expect(requestHiTranslatorTranslationBatchMock).not.toHaveBeenCalled()
  })

  it("does not make a second cloud request for a webpage summary", async () => {
    const { setUpWebPageTranslationQueue } = await import("../translation-queues")
    await setUpWebPageTranslationQueue()
    const handler = getRegisteredMessageHandler("getOrGenerateWebPageSummary")
    await expect(handler({ data: {} })).resolves.toBeNull()
  })

  it("routes subtitle text and video context through Native Messaging", async () => {
    const { setUpSubtitlesTranslationQueue } = await import("../translation-queues")
    await setUpSubtitlesTranslationQueue()
    const handler = getRegisteredMessageHandler("enqueueSubtitlesTranslateRequest")

    await expect(
      handler({
        data: {
          text: "subtitle",
          langConfig: DEFAULT_CONFIG.language,
          providerConfig: providerPlaceholder,
          scheduleAt: Date.now(),
          hash: "subtitle-hash",
          webTitle: "Video title",
          webDescription: "Video description",
          summary: "Video summary",
        },
      }),
    ).resolves.toBe("桌面译文")

    expect(requestHiTranslatorTranslationBatchMock).toHaveBeenCalledWith({
      texts: ["subtitle"],
      sourceLanguage: DEFAULT_CONFIG.language.sourceCode,
      targetLanguage: DEFAULT_CONFIG.language.targetCode,
      context: {
        webTitle: "Video title",
        webDescription: "Video description",
        webSummary: "Video summary",
      },
    })
  })

  it("routes subtitle warmup batches through the desktop instead of Microsoft", async () => {
    requestHiTranslatorTranslationBatchMock.mockResolvedValueOnce(["一", "二"])
    const { setUpSubtitlesTranslationQueue } = await import("../translation-queues")
    await setUpSubtitlesTranslationQueue()
    const handler = getRegisteredMessageHandler("microsoftBatchTranslate")

    await expect(
      handler({ data: { texts: ["one", "two"], fromLang: "eng", toLang: "cmn" } }),
    ).resolves.toEqual(["一", "二"])
    expect(requestHiTranslatorTranslationBatchMock).toHaveBeenCalledWith({
      texts: ["one", "two"],
      sourceLanguage: "eng",
      targetLanguage: "cmn",
    })
  })

  it("does not generate a separate subtitle summary", async () => {
    const { setUpSubtitlesTranslationQueue } = await import("../translation-queues")
    await setUpSubtitlesTranslationQueue()
    const handler = getRegisteredMessageHandler("getSubtitlesSummary")
    await expect(handler({ data: {} })).resolves.toBeNull()
  })
})
