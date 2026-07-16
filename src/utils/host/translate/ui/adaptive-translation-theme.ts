import type {
  HiTranslatorThemePreset,
  HiTranslatorTranslationTheme,
} from "@/utils/hitranslator-translation-theme"
import {
  DEFAULT_HITRANSLATOR_TRANSLATION_THEME,
  HITRANSLATOR_THEME_ACCENT_HEX,
  normalizeHiTranslatorTranslationTheme,
} from "@/utils/hitranslator-translation-theme"

export type RgbColor = {
  r: number
  g: number
  b: number
}

type RgbaColor = RgbColor & { a: number }

export type AdaptiveTranslationThemeTokens = {
  baseAccent: RgbColor
  textAccent: RgbColor
  background: RgbColor
  text: string
  line: string
  soft: string
}

const MIN_TEXT_CONTRAST = 4.5
const INITIAL_NEUTRAL_MIX = 0.12
const MIX_STEP = 0.02
const LIGHT_CANVAS: RgbColor = { r: 255, g: 255, b: 255 }
const DARK_CANVAS: RgbColor = { r: 17, g: 24, b: 39 }
const BLACK: RgbColor = { r: 0, g: 0, b: 0 }
const WHITE: RgbColor = { r: 255, g: 255, b: 255 }

const translatedNodes = new Set<HTMLElement>()
let currentTheme = DEFAULT_HITRANSLATOR_TRANSLATION_THEME

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)))
}

function clampAlpha(value: number): number {
  return Math.max(0, Math.min(1, value))
}

export function parseHexColor(value: string): RgbColor | null {
  const normalized = value.trim().replace(/^#/, "")
  if (!/^[\da-f]{6}$/i.test(normalized)) return null

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

function parseColorChannel(value: string): number | null {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return null
  return value.endsWith("%") ? clampChannel((parsed / 100) * 255) : clampChannel(parsed)
}

function parseAlpha(value: string | undefined): number {
  if (!value) return 1
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed)) return 1
  return value.endsWith("%") ? clampAlpha(parsed / 100) : clampAlpha(parsed)
}

export function parseCssColor(value: string | null | undefined): RgbaColor | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (normalized === "transparent") return { r: 0, g: 0, b: 0, a: 0 }

  const hex = parseHexColor(normalized)
  if (hex) return { ...hex, a: 1 }

  const match = normalized.match(/^rgba?\((.+)\)$/)
  if (!match) return null

  const parts = match[1]
    .replace("/", " ")
    .split(/[\s,]+/)
    .filter(Boolean)
  if (parts.length < 3) return null

  const [r, g, b] = parts.slice(0, 3).map(parseColorChannel)
  if (r === null || g === null || b === null) return null

  return { r, g, b, a: parseAlpha(parts[3]) }
}

function linearizeSrgb(channel: number): number {
  const normalized = channel / 255
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

export function getRelativeLuminance(color: RgbColor): number {
  return (
    0.2126 * linearizeSrgb(color.r) +
    0.7152 * linearizeSrgb(color.g) +
    0.0722 * linearizeSrgb(color.b)
  )
}

export function getContrastRatio(first: RgbColor, second: RgbColor): number {
  const lighter = Math.max(getRelativeLuminance(first), getRelativeLuminance(second))
  const darker = Math.min(getRelativeLuminance(first), getRelativeLuminance(second))
  return (lighter + 0.05) / (darker + 0.05)
}

export function mixColors(first: RgbColor, second: RgbColor, secondWeight: number): RgbColor {
  const weight = Math.max(0, Math.min(1, secondWeight))
  return {
    r: clampChannel(first.r * (1 - weight) + second.r * weight),
    g: clampChannel(first.g * (1 - weight) + second.g * weight),
    b: clampChannel(first.b * (1 - weight) + second.b * weight),
  }
}

function compositeColor(foreground: RgbaColor, background: RgbColor): RgbColor {
  return {
    r: clampChannel(foreground.r * foreground.a + background.r * (1 - foreground.a)),
    g: clampChannel(foreground.g * foreground.a + background.g * (1 - foreground.a)),
    b: clampChannel(foreground.b * foreground.a + background.b * (1 - foreground.a)),
  }
}

function getStyle(element: Element): CSSStyleDeclaration | null {
  try {
    return element.ownerDocument.defaultView?.getComputedStyle(element) ?? null
  } catch {
    return null
  }
}

function getParentElementAcrossShadowRoot(element: Element): HTMLElement | null {
  if (element.parentElement) return element.parentElement

  const root = element.getRootNode()
  if (typeof ShadowRoot !== "undefined" && root instanceof ShadowRoot) {
    return root.host instanceof HTMLElement ? root.host : null
  }
  return null
}

function inferCanvasColor(element: HTMLElement): RgbColor {
  const style = getStyle(element)
  const inheritedText = parseCssColor(style?.color)
  const colorScheme = style?.colorScheme || ""

  if (colorScheme.split(/\s+/).includes("dark")) return DARK_CANVAS
  if (inheritedText && getRelativeLuminance(inheritedText) > 0.55) return DARK_CANVAS
  return LIGHT_CANVAS
}

export function resolveEffectiveBackground(translatedNode: HTMLElement): RgbColor {
  const start = translatedNode.parentElement ?? translatedNode
  const layers: RgbaColor[] = []
  let current: HTMLElement | null = start

  while (current) {
    const background = parseCssColor(getStyle(current)?.backgroundColor)
    if (background && background.a > 0) {
      layers.push(background)
      if (background.a >= 0.995) break
    }
    current = getParentElementAcrossShadowRoot(current)
  }

  let resolved = inferCanvasColor(start)
  for (let index = layers.length - 1; index >= 0; index -= 1) {
    resolved = compositeColor(layers[index], resolved)
  }
  return resolved
}

function resolveReadableAnchor(translatedNode: HTMLElement, background: RgbColor): RgbColor {
  const inheritedFrom = translatedNode.parentElement ?? translatedNode
  const inheritedText = parseCssColor(getStyle(inheritedFrom)?.color)
  if (
    inheritedText &&
    Math.max(inheritedText.r, inheritedText.g, inheritedText.b) -
      Math.min(inheritedText.r, inheritedText.g, inheritedText.b) <=
      48 &&
    getContrastRatio(inheritedText, background) >= MIN_TEXT_CONTRAST
  ) {
    return inheritedText
  }

  return getContrastRatio(BLACK, background) >= getContrastRatio(WHITE, background) ? BLACK : WHITE
}

export function getBaseAccent(themePreset: HiTranslatorThemePreset): RgbColor {
  return parseHexColor(HITRANSLATOR_THEME_ACCENT_HEX[themePreset]) ?? { r: 93, g: 146, b: 190 }
}

export function adaptAccentForBackground(
  baseAccent: RgbColor,
  background: RgbColor,
  readableAnchor?: RgbColor,
): RgbColor {
  const anchor =
    readableAnchor && getContrastRatio(readableAnchor, background) >= MIN_TEXT_CONTRAST
      ? readableAnchor
      : getContrastRatio(BLACK, background) >= getContrastRatio(WHITE, background)
        ? BLACK
        : WHITE

  for (let weight = INITIAL_NEUTRAL_MIX; weight <= 1; weight += MIX_STEP) {
    const candidate = mixColors(baseAccent, anchor, weight)
    if (getContrastRatio(candidate, background) >= MIN_TEXT_CONTRAST) return candidate
  }
  return anchor
}

function toRgbCss(color: RgbColor): string {
  return `rgb(${color.r}, ${color.g}, ${color.b})`
}

function toRgbaCss(color: RgbColor, alpha: number): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
}

export function buildAdaptiveTranslationThemeTokens(
  theme: HiTranslatorTranslationTheme,
  background: RgbColor,
  readableAnchor?: RgbColor,
): AdaptiveTranslationThemeTokens {
  const normalizedTheme = normalizeHiTranslatorTranslationTheme(theme)
  const baseAccent = getBaseAccent(normalizedTheme.themePreset)
  const textAccent = adaptAccentForBackground(baseAccent, background, readableAnchor)

  return {
    baseAccent,
    textAccent,
    background,
    text: toRgbCss(textAccent),
    line: toRgbaCss(textAccent, 0.72),
    soft: toRgbaCss(baseAccent, 0.14),
  }
}

export function applyHiTranslatorTranslationTheme(translatedNode: HTMLElement): void {
  translatedNodes.add(translatedNode)

  const background = resolveEffectiveBackground(translatedNode)
  const readableAnchor = resolveReadableAnchor(translatedNode, background)
  const tokens = buildAdaptiveTranslationThemeTokens(currentTheme, background, readableAnchor)

  translatedNode.dataset.hitranslatorThemePreset = currentTheme.themePreset
  translatedNode.style.setProperty("--hitranslator-web-accent-text", tokens.text)
  translatedNode.style.setProperty("--hitranslator-web-accent-line", tokens.line)
  translatedNode.style.setProperty("--hitranslator-web-accent-soft", tokens.soft)
}

export function refreshHiTranslatorTranslationTheme(theme?: unknown): void {
  if (theme !== undefined) {
    currentTheme = normalizeHiTranslatorTranslationTheme(theme)
  }

  translatedNodes.forEach((translatedNode) => {
    if (!translatedNode.isConnected) {
      translatedNodes.delete(translatedNode)
      return
    }
    applyHiTranslatorTranslationTheme(translatedNode)
  })
}
