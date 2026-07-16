import { afterEach, describe, expect, it, vi } from "vitest"

describe("dEFAULT_CONFIG", () => {
  const originalCrypto = globalThis.crypto

  afterEach(() => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: originalCrypto,
    })
    vi.resetModules()
  })

  it("initializes without generating upstream custom-action identifiers", async () => {
    const getRandomValues = vi.fn<(...args: any[]) => any>((array: Uint8Array<ArrayBuffer>) =>
      originalCrypto.getRandomValues(array),
    )

    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: {
        getRandomValues,
      },
    })
    vi.resetModules()

    const { DEFAULT_CONFIG } = await import("../config")
    expect(DEFAULT_CONFIG.selectionToolbar.customActions).toEqual([])
    expect(getRandomValues).not.toHaveBeenCalled()
  })

  it("seeds only the desktop translation bridge placeholder", async () => {
    const { DEFAULT_CONFIG } = await import("../config")
    const { configSchema } = await import("@/types/config/config")

    const parseResult = configSchema.safeParse(DEFAULT_CONFIG)
    if (!parseResult.success) {
      console.error(parseResult.error.issues)
    }

    expect(parseResult.success).toBe(true)
    expect(DEFAULT_CONFIG.providersConfig.map((provider) => provider.id)).toEqual([
      "hitranslator-desktop",
    ])
    expect(DEFAULT_CONFIG.translate.providerId).toBe("hitranslator-desktop")
    expect(DEFAULT_CONFIG.selectionToolbar.features.translate.providerId).toBe(
      "hitranslator-desktop",
    )
    expect(DEFAULT_CONFIG.inputTranslation.providerId).toBe("hitranslator-desktop")
    expect(DEFAULT_CONFIG.inputTranslation.enabled).toBe(false)
    expect(DEFAULT_CONFIG.videoSubtitles.providerId).toBe("hitranslator-desktop")
  })
})
