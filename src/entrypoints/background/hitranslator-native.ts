import { browser, storage } from "#imports"
import { getLocalConfig, setLocalConfig } from "@/utils/config/storage"
import {
  DEFAULT_HITRANSLATOR_TRANSLATION_THEME,
  HITRANSLATOR_THEME_STORAGE_KEY,
  normalizeHiTranslatorTranslationTheme,
  type HiTranslatorTranslationTheme,
} from "@/utils/hitranslator-translation-theme"
import { logger } from "@/utils/logger"
import { onMessage, sendMessage } from "@/utils/message"
import { cleanupAllSummaryCache, cleanupAllTranslationCache } from "./db-cleanup"
import { applyHiTranslatorWebSettings, type HiTranslatorWebSettings } from "./hitranslator-settings"
import { sendHostMessageWithRecovery } from "./host-message-recovery"
import { getPageTranslationEnabled, setPageTranslationEnabled } from "./page-translation-state"

const NATIVE_HOST_NAME = "com.hitranslator.browser"
const REQUEST_TIMEOUT_MS = 120_000

type NativeResponse = {
  id?: string
  ok?: boolean
  result?: any
  error?: string
  type?: "event"
  event?: string
  data?: any
}

type PendingRequest = {
  resolve: (value: any) => void
  reject: (error: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

let nativePort: ReturnType<typeof browser.runtime.connectNative> | null = null
const pendingRequests = new Map<string, PendingRequest>()
const eventListeners = new Set<(event: string, data: any) => void>()
let currentTranslationTheme = DEFAULT_HITRANSLATOR_TRANSLATION_THEME

function createRequestId() {
  return `native_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

function rejectPendingRequests(message: string) {
  pendingRequests.forEach(({ reject, timeout }) => {
    clearTimeout(timeout)
    reject(new Error(message))
  })
  pendingRequests.clear()
}

function ensureNativePort() {
  if (nativePort) return nativePort

  const port = browser.runtime.connectNative(NATIVE_HOST_NAME)
  nativePort = port

  port.onMessage.addListener((message: NativeResponse) => {
    if (message?.type === "event" && message.event) {
      eventListeners.forEach((listener) => listener(message.event!, message.data))
      return
    }

    if (!message?.id) return
    const pending = pendingRequests.get(message.id)
    if (!pending) return

    clearTimeout(pending.timeout)
    pendingRequests.delete(message.id)
    if (message.ok) {
      pending.resolve(message.result)
    } else {
      pending.reject(new Error(message.error || "HiTranslator 请求失败"))
    }
  })

  port.onDisconnect.addListener(() => {
    const runtimeError = (browser.runtime as any).lastError?.message
    if (nativePort === port) nativePort = null
    rejectPendingRequests(runtimeError || "HiTranslator 原生连接已断开")
  })

  return port
}

export function requestHiTranslator<T = any>(
  method: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const id = createRequestId()
  const port = ensureNativePort()

  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pendingRequests.delete(id)
      reject(new Error("HiTranslator 请求超时"))
    }, REQUEST_TIMEOUT_MS)

    pendingRequests.set(id, { resolve, reject, timeout })
    try {
      port.postMessage({ id, method, params })
    } catch (error) {
      clearTimeout(timeout)
      pendingRequests.delete(id)
      reject(error)
    }
  })
}

export async function requestHiTranslatorTranslationBatch(params: {
  texts: string[]
  sourceLanguage: string
  targetLanguage: string
  context?: {
    webTitle?: string | null
    webDescription?: string | null
    webContent?: string | null
    webSummary?: string | null
  }
}): Promise<string[]> {
  const result = await requestHiTranslator<{ translations: string[] }>("translate-batch", params)
  if (!Array.isArray(result?.translations)) {
    throw new Error("HiTranslator 返回了无效的网页翻译结果")
  }
  return result.translations
}

export async function openHiTranslatorSelectionTranslation({
  selectionText,
  pageTitle = "",
  url = "",
}: {
  selectionText: string
  pageTitle?: string
  url?: string
}): Promise<{ opened: boolean }> {
  const text = selectionText.trim()
  if (!text) {
    throw new Error("未获取到选中文本")
  }

  return requestHiTranslator("open-selection-translation", {
    text,
    pageTitle,
    url,
  })
}

function onNativeEvent(listener: (event: string, data: any) => void) {
  eventListeners.add(listener)
  return () => eventListeners.delete(listener)
}

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (typeof tab?.id !== "number") {
    throw new Error("未找到当前网页")
  }
  return tab
}

async function publishTranslationThemeToOpenTabs(theme: HiTranslatorTranslationTheme) {
  const tabs = await browser.tabs.query({})
  await Promise.allSettled(
    tabs.flatMap((tab) =>
      typeof tab.id === "number"
        ? [sendMessage("refreshHiTranslatorTranslationTheme", theme, tab.id)]
        : [],
    ),
  )
}

async function applyDesktopTranslationTheme(
  theme: unknown,
  { publish = true }: { publish?: boolean } = {},
) {
  const nextTheme = normalizeHiTranslatorTranslationTheme(theme)
  const didChange = nextTheme.themePreset !== currentTranslationTheme.themePreset
  currentTranslationTheme = nextTheme
  await storage.setItem(HITRANSLATOR_THEME_STORAGE_KEY, currentTranslationTheme)
  if (publish && didChange) {
    await publishTranslationThemeToOpenTabs(currentTranslationTheme)
  }
  return currentTranslationTheme
}

async function applyDesktopSettings(
  settings: HiTranslatorWebSettings | undefined,
  { restartActivePage = true }: { restartActivePage?: boolean } = {},
) {
  if (!settings) return
  await applyHiTranslatorWebSettings(settings)

  await Promise.allSettled([
    sendMessage("setTranslateRequestQueueConfig", {
      rate: settings.requestRate,
      capacity: settings.requestCapacity,
    }),
    sendMessage("setTranslateBatchQueueConfig", {
      maxCharactersPerBatch: settings.maxCharactersPerBatch,
      maxItemsPerBatch: settings.maxItemsPerBatch,
    }),
  ])

  if (!restartActivePage) return
  const tab = await getActiveTab()
  if (await getPageTranslationEnabled(tab.id!)) {
    await sendHostMessageWithRecovery(tab.id!, () =>
      sendMessage("restartPageTranslation", undefined, tab.id),
    )
  }
  await sendPageState(tab.id!)
}

async function sendPageState(tabId: number, patch: Record<string, unknown> = {}) {
  const [tab, config, active] = await Promise.all([
    browser.tabs.get(tabId),
    getLocalConfig(),
    getPageTranslationEnabled(tabId),
  ])

  const state = await requestHiTranslator<{ theme?: HiTranslatorTranslationTheme }>("page-state", {
    tabId,
    pageTitle: tab.title || "",
    url: tab.url || "",
    active,
    mode: config?.translate.mode || "bilingual",
    sourceLanguage: config?.language.sourceCode || "auto",
    targetLanguage: config?.language.targetCode || "cmn",
    ...patch,
  })
  if (state?.theme) {
    await applyDesktopTranslationTheme(state.theme)
  }
  return state
}

async function setActiveTabTranslation(enabled: boolean) {
  const tab = await getActiveTab()
  if (!enabled) {
    await setPageTranslationEnabled(tab.id!, false)
  }
  await sendHostMessageWithRecovery(tab.id!, () =>
    sendMessage("askManagerToTogglePageTranslation", { enabled }, tab.id),
  )
  await sendPageState(tab.id!, { active: enabled })
}

async function restoreActiveTabOriginal() {
  const tab = await getActiveTab()
  await setPageTranslationEnabled(tab.id!, false)
  await sendHostMessageWithRecovery(tab.id!, () =>
    sendMessage("restorePageTranslation", undefined, tab.id),
  )
  await sendPageState(tab.id!, { active: false })
}

async function setTranslationMode(mode: "bilingual" | "translationOnly") {
  const tab = await getActiveTab()
  const config = await getLocalConfig()
  if (!config || config.translate.mode === mode) return

  await setLocalConfig({
    ...config,
    translate: {
      ...config.translate,
      mode,
    },
  })
  await sendHostMessageWithRecovery(tab.id!, () =>
    sendMessage("restartPageTranslation", undefined, tab.id),
  )
  await sendPageState(tab.id!, { mode })
}

async function openControllerForTab(tab: Awaited<ReturnType<typeof getActiveTab>>) {
  if (typeof tab.id !== "number") throw new Error("未找到当前网页")

  const [settings, theme] = await Promise.all([
    requestHiTranslator<HiTranslatorWebSettings>("get-settings"),
    requestHiTranslator<HiTranslatorTranslationTheme>("get-theme"),
  ])
  await Promise.all([
    applyDesktopSettings(settings, { restartActivePage: false }),
    applyDesktopTranslationTheme(theme),
  ])
  const config = await getLocalConfig()
  const active = await getPageTranslationEnabled(tab.id)
  await requestHiTranslator("open-controller", {
    tabId: tab.id,
    pageTitle: tab.title || "",
    url: tab.url || "",
    active,
    mode: config?.translate.mode || "bilingual",
    sourceLanguage: config?.language.sourceCode || "auto",
    targetLanguage: config?.language.targetCode || "cmn",
  })
  await browser.action.setBadgeText({ text: "", tabId: tab.id })
}

async function handleControllerCommand(data: any) {
  const command = data?.command
  if (command === "translate" || command === "retry") {
    await setActiveTabTranslation(true)
  } else if (command === "stop" || command === "restore") {
    await restoreActiveTabOriginal()
  } else if (command === "toggle") {
    const tab = await getActiveTab()
    await setActiveTabTranslation(!(await getPageTranslationEnabled(tab.id!)))
  } else if (command === "set-mode") {
    await setTranslationMode(data?.mode === "translationOnly" ? "translationOnly" : "bilingual")
  } else if (command === "open-controller") {
    await openControllerForTab(await getActiveTab())
  } else if (command === "clear-cache") {
    await cleanupAllTranslationCache()
    await cleanupAllSummaryCache()
  }
}

export async function reportPageTranslationStateToHiTranslator({
  tabId,
  active,
  url,
  error,
}: {
  tabId: number
  active: boolean
  url?: string
  error?: string
}) {
  try {
    await sendPageState(tabId, { active, url, error: error || "" })
  } catch {
    // Reporting is best effort; page translation must remain usable while the
    // desktop app or native host is restarting.
  }
}

export function setupHiTranslatorNativeBridge() {
  onMessage("getHiTranslatorTranslationTheme", () => currentTranslationTheme)
  onMessage("openHiTranslatorSelection", (message) =>
    openHiTranslatorSelectionTranslation(message.data),
  )

  // Establish the long-lived Native Messaging port during background startup so
  // the desktop menu can control the current tab even before the toolbar icon is clicked.
  void (async () => {
    const storedTheme = await storage.getItem<unknown>(HITRANSLATOR_THEME_STORAGE_KEY)
    if (storedTheme) {
      await applyDesktopTranslationTheme(storedTheme)
    }

    const result = await requestHiTranslator<{
      state?: {
        settings?: HiTranslatorWebSettings
        theme?: HiTranslatorTranslationTheme
      }
    }>("ping")
    await Promise.all([
      applyDesktopSettings(result.state?.settings, { restartActivePage: false }),
      applyDesktopTranslationTheme(result.state?.theme),
    ])
  })().catch((error) => {
    logger.info("HiTranslator native bridge is waiting for the desktop app", error)
  })

  browser.tabs.onActivated.addListener(({ tabId }) => {
    void sendPageState(tabId).catch(() => {
      // Native state synchronization is best effort while tabs or the app restart.
    })
  })

  browser.action.onClicked.addListener((tab) => {
    void (async () => {
      await openControllerForTab(tab)
    })().catch(async (error) => {
      logger.error("Failed to open HiTranslator webpage controller", error)
      if (typeof tab.id === "number") {
        await browser.action.setBadgeBackgroundColor({ color: "#d97706", tabId: tab.id })
        await browser.action.setBadgeText({ text: "!", tabId: tab.id })
        await browser.action.setTitle({
          title: `HiTranslator 未连接：${error.message || "请先启动桌面应用"}`,
          tabId: tab.id,
        })
      }
    })
  })

  onNativeEvent((event, data) => {
    if (event === "settings-changed") {
      void applyDesktopSettings(data?.settings).catch((error) => {
        logger.error("Failed to apply HiTranslator webpage settings", error)
      })
      return
    }
    if (event === "theme-changed") {
      void applyDesktopTranslationTheme(data?.theme).catch((error) => {
        logger.error("Failed to apply HiTranslator translation theme", error)
      })
      return
    }
    if (event !== "page-command") return
    void handleControllerCommand(data).catch(async (error) => {
      logger.error("HiTranslator webpage command failed", error)
      try {
        const tab = await getActiveTab()
        await sendPageState(tab.id!, { error: error.message || "网页操作失败" })
      } catch {
        // The browser may no longer have an active web tab.
      }
    })
  })
}
