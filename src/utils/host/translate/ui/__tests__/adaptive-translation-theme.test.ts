// @vitest-environment jsdom

import type { HiTranslatorThemePreset } from "@/utils/hitranslator-translation-theme"
import { afterEach, describe, expect, it } from "vitest"
import {
  applyHiTranslatorTranslationTheme,
  buildAdaptiveTranslationThemeTokens,
  getBaseAccent,
  getContrastRatio,
  mixColors,
  parseCssColor,
  refreshHiTranslatorTranslationTheme,
  type RgbColor,
} from "../adaptive-translation-theme"

const presets: HiTranslatorThemePreset[] = ["pearlRose", "cobaltMint", "quietTeal", "graphiteSky"]

const white: RgbColor = { r: 255, g: 255, b: 255 }
const dark: RgbColor = { r: 17, g: 24, b: 39 }
const black: RgbColor = { r: 0, g: 0, b: 0 }

function distance(first: RgbColor, second: RgbColor) {
  return Math.hypot(first.r - second.r, first.g - second.g, first.b - second.b)
}

describe("adaptive HiTranslator webpage translation theme", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it.each(presets)("keeps %s readable on light and dark page backgrounds", (themePreset) => {
    const baseAccent = getBaseAccent(themePreset)
    const lightTokens = buildAdaptiveTranslationThemeTokens(
      { themePreset, accent: "sky" },
      white,
      black,
    )
    const darkTokens = buildAdaptiveTranslationThemeTokens(
      { themePreset, accent: "sky" },
      dark,
      white,
    )

    expect(getContrastRatio(lightTokens.textAccent, white)).toBeGreaterThanOrEqual(4.5)
    expect(getContrastRatio(darkTokens.textAccent, dark)).toBeGreaterThanOrEqual(4.5)
    expect(distance(lightTokens.textAccent, baseAccent)).toBeLessThan(distance(black, baseAccent))
    expect(distance(darkTokens.textAccent, baseAccent)).toBeLessThan(distance(white, baseAccent))
  })

  it("supports computed rgb and rgba colors", () => {
    expect(parseCssColor("rgb(77, 141, 132)")).toEqual({ r: 77, g: 141, b: 132, a: 1 })
    expect(parseCssColor("rgba(77 141 132 / 50%)")).toEqual({
      r: 77,
      g: 141,
      b: 132,
      a: 0.5,
    })
    expect(mixColors(black, white, 0.5)).toEqual({ r: 128, g: 128, b: 128 })
  })

  it("updates existing translated nodes in place when the desktop preset changes", () => {
    const surface = document.createElement("article")
    surface.style.backgroundColor = "rgb(255, 255, 255)"
    surface.style.color = "rgb(30, 34, 42)"
    const translatedNode = document.createElement("span")
    translatedNode.textContent = "保留已有翻译"
    surface.appendChild(translatedNode)
    document.body.appendChild(surface)

    refreshHiTranslatorTranslationTheme({ themePreset: "quietTeal" })
    applyHiTranslatorTranslationTheme(translatedNode)
    const tealColor = translatedNode.style.getPropertyValue("--hitranslator-web-accent-text")

    refreshHiTranslatorTranslationTheme({ themePreset: "pearlRose" })

    expect(translatedNode.dataset.hitranslatorThemePreset).toBe("pearlRose")
    expect(translatedNode.style.getPropertyValue("--hitranslator-web-accent-text")).not.toBe(
      tealColor,
    )
    expect(translatedNode.style.getPropertyValue("--hitranslator-web-accent-line")).toContain(
      "rgba",
    )
    expect(translatedNode.style.getPropertyValue("--hitranslator-web-accent-soft")).toContain(
      "rgba",
    )
    expect(translatedNode.textContent).toBe("保留已有翻译")
  })
})
