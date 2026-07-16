export const HITRANSLATOR_THEME_PRESETS = [
  "pearlRose",
  "cobaltMint",
  "quietTeal",
  "graphiteSky",
] as const

export type HiTranslatorThemePreset = (typeof HITRANSLATOR_THEME_PRESETS)[number]
export type HiTranslatorThemeAccent = "rose" | "cobalt" | "teal" | "sky"

export type HiTranslatorTranslationTheme = {
  themePreset: HiTranslatorThemePreset
  accent: HiTranslatorThemeAccent
}

export const HITRANSLATOR_THEME_STORAGE_KEY = "local:hitranslator-translation-theme"

export const HITRANSLATOR_THEME_PRESET_ACCENTS: Record<
  HiTranslatorThemePreset,
  HiTranslatorThemeAccent
> = {
  pearlRose: "rose",
  cobaltMint: "cobalt",
  quietTeal: "teal",
  graphiteSky: "sky",
}

export const HITRANSLATOR_THEME_ACCENT_HEX: Record<HiTranslatorThemePreset, string> = {
  pearlRose: "#b96a7b",
  cobaltMint: "#5278b8",
  quietTeal: "#4d8d84",
  graphiteSky: "#5d92be",
}

export const DEFAULT_HITRANSLATOR_TRANSLATION_THEME: HiTranslatorTranslationTheme = {
  themePreset: "graphiteSky",
  accent: "sky",
}

export function normalizeHiTranslatorTranslationTheme(
  value: unknown,
): HiTranslatorTranslationTheme {
  const themePreset =
    typeof value === "object" &&
    value !== null &&
    "themePreset" in value &&
    HITRANSLATOR_THEME_PRESETS.includes(
      (value as { themePreset?: HiTranslatorThemePreset }).themePreset as HiTranslatorThemePreset,
    )
      ? (value as { themePreset: HiTranslatorThemePreset }).themePreset
      : DEFAULT_HITRANSLATOR_TRANSLATION_THEME.themePreset

  return {
    themePreset,
    accent: HITRANSLATOR_THEME_PRESET_ACCENTS[themePreset],
  }
}
