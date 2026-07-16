import type { Config } from "@/types/config/config"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"

const getLocalConfigMock = vi.fn<(...args: any[]) => any>()
const sendMessageMock = vi.fn<(...args: any[]) => any>()

vi.mock("@/utils/config/storage", () => ({
  getLocalConfig: getLocalConfigMock,
}))

vi.mock("@/utils/message", () => ({
  sendMessage: sendMessageMock,
}))

function buildConfig(enableAIContentAware = true): Config {
  return {
    ...DEFAULT_CONFIG,
    translate: {
      ...DEFAULT_CONFIG.translate,
      enableAIContentAware,
    },
  }
}

describe("HiTranslator subtitle bridge", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    getLocalConfigMock.mockResolvedValue(buildConfig())
    sendMessageMock.mockImplementation(async (type: string, data: { text?: string }) => {
      if (type === "enqueueSubtitlesTranslateRequest") {
        return `translated:${data.text}`
      }
      return null
    })
  })

  it("routes subtitle fragments through the desktop placeholder with page context", async () => {
    const { translateSubtitles } = await import("../translator")
    const result = await translateSubtitles(
      [
        { text: "hello", start: 0, end: 1_000 },
        { text: "world", start: 1_000, end: 2_000 },
      ],
      {
        videoTitle: "Video title",
        videoDescription: "Video description",
        subtitlesTextContent: "hello world",
        summary: "Video summary",
      },
    )

    expect(result.map((fragment) => fragment.translation)).toEqual([
      "translated:hello",
      "translated:world",
    ])
    expect(sendMessageMock).toHaveBeenCalledWith(
      "enqueueSubtitlesTranslateRequest",
      expect.objectContaining({
        providerConfig: expect.objectContaining({ id: "hitranslator-desktop" }),
        webTitle: "Video title",
        webDescription: "Video description",
        summary: "Video summary",
      }),
    )
  })

  it("uses the actual subtitle summary in the cache hash", async () => {
    const { translateSubtitles } = await import("../translator")
    const baseContext = {
      videoTitle: "Video title",
      subtitlesTextContent: "hello world",
    }

    await translateSubtitles([{ text: "hello", start: 0, end: 1_000 }], {
      ...baseContext,
      summary: "summary-a",
    })
    await translateSubtitles([{ text: "hello", start: 0, end: 1_000 }], {
      ...baseContext,
      summary: "summary-b",
    })

    const firstHash = sendMessageMock.mock.calls[0][1].hash
    const secondHash = sendMessageMock.mock.calls[1][1].hash
    expect(firstHash).not.toBe(secondHash)
  })

  it("does not make a separate cloud request for a subtitle summary", async () => {
    const { fetchSubtitlesSummary } = await import("../translator")
    const result = await fetchSubtitlesSummary({
      videoTitle: "Video title",
      subtitlesTextContent: "hello world",
    })

    expect(result).toBeNull()
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it("omits the summary when content awareness is disabled", async () => {
    const { translateSubtitles } = await import("../translator")
    await translateSubtitles(
      [{ text: "hello", start: 0, end: 1_000 }],
      {
        videoTitle: "Video title",
        videoDescription: "Video description",
        subtitlesTextContent: "hello world",
        summary: "unused summary",
      },
      buildConfig(false),
    )

    expect(sendMessageMock).toHaveBeenCalledWith(
      "enqueueSubtitlesTranslateRequest",
      expect.objectContaining({
        webTitle: "Video title",
        webDescription: "Video description",
        summary: undefined,
      }),
    )
  })

  it("uses an explicit config snapshot without rereading extension storage", async () => {
    const { translateSubtitles } = await import("../translator")
    const config = buildConfig()
    await translateSubtitles(
      [{ text: "hello", start: 0, end: 1_000 }],
      { videoTitle: "Video title", subtitlesTextContent: "hello world" },
      config,
    )

    expect(getLocalConfigMock).not.toHaveBeenCalled()
    expect(sendMessageMock).toHaveBeenCalledWith(
      "enqueueSubtitlesTranslateRequest",
      expect.objectContaining({ langConfig: config.language }),
    )
  })

  it("surfaces a failure when every desktop subtitle request fails", async () => {
    const { translateSubtitles } = await import("../translator")
    sendMessageMock.mockRejectedValue(new Error("Desktop unavailable"))

    await expect(
      translateSubtitles([{ text: "hello", start: 0, end: 1_000 }], {
        videoTitle: "Video title",
        subtitlesTextContent: "hello world",
      }),
    ).rejects.toThrow("Desktop unavailable")
  })
})
