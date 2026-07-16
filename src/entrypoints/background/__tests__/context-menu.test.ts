import type { Config } from "@/types/config/config"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { browser, storage } from "#imports"
import { i18n } from "@/utils/i18n"

const sendMessageMock = vi.fn<(...args: any[]) => any>()
const openHiTranslatorSelectionTranslationMock = vi.fn<(...args: any[]) => any>()
const ensureInitializedConfigMock = vi.fn<(...args: any[]) => any>()
const contextMenuClickListeners: Array<(info: any, tab?: any) => Promise<void> | void> = []

vi.mock("@/utils/message", () => ({
  sendMessage: sendMessageMock,
}))

vi.mock("../config", () => ({
  ensureInitializedConfig: ensureInitializedConfigMock,
}))

vi.mock("../hitranslator-native", () => ({
  openHiTranslatorSelectionTranslation: openHiTranslatorSelectionTranslationMock,
}))

function createConfig(enabled: boolean): Config {
  return {
    contextMenu: {
      enabled,
    },
    selectionToolbar: {
      customActions: [],
    },
  } as unknown as Config
}

describe("background context menu", () => {
  beforeEach(() => {
    contextMenuClickListeners.length = 0
    vi.clearAllMocks()
    openHiTranslatorSelectionTranslationMock.mockResolvedValue({ opened: true })

    browser.contextMenus.create = vi.fn<(...args: any[]) => any>()
    browser.contextMenus.removeAll = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined)
    browser.contextMenus.update = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined)
    browser.contextMenus.onClicked.addListener = vi.fn<(...args: any[]) => any>((listener) => {
      contextMenuClickListeners.push(listener as (info: any, tab?: any) => Promise<void> | void)
    })

    browser.tabs.query = vi.fn<(...args: any[]) => any>().mockResolvedValue([{ id: 1 }])
    browser.tabs.onActivated.addListener = vi.fn<(...args: any[]) => any>()
    browser.tabs.onUpdated.addListener = vi.fn<(...args: any[]) => any>()
    browser.storage.session.onChanged.addListener = vi.fn<(...args: any[]) => any>()

    storage.watch = vi.fn<(...args: any[]) => any>()
    storage.getItem = vi.fn<(...args: any[]) => any>().mockResolvedValue({ enabled: true })
    storage.setItem = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined)

    i18n.t = vi.fn<(...args: any[]) => any>(
      (key: string) =>
        ({
          "contextMenu.translate": "Translate",
          "contextMenu.translateSelection": 'Translate "%s"',
          "contextMenu.readAloudSelection": 'Read aloud "%s"',
          "contextMenu.showOriginal": "Show Original",
        })[key] ?? key,
    ) as typeof i18n.t
  })

  it("creates page and selection menu items when the context menu is enabled", async () => {
    ensureInitializedConfigMock.mockResolvedValue(createConfig(true))

    const { initializeContextMenu, MENU_ID_SELECTION_TRANSLATE, MENU_ID_TRANSLATE } =
      await import("../context-menu")

    await initializeContextMenu()

    expect(browser.contextMenus.removeAll).toHaveBeenCalledOnce()
    expect(browser.contextMenus.create).toHaveBeenNthCalledWith(1, {
      id: MENU_ID_TRANSLATE,
      title: "Translate",
      contexts: ["page"],
    })
    expect(browser.contextMenus.create).toHaveBeenNthCalledWith(2, {
      id: MENU_ID_SELECTION_TRANSLATE,
      title: 'Translate "%s"',
      contexts: ["selection"],
    })
    expect(browser.contextMenus.create).toHaveBeenCalledTimes(2)
    expect(browser.contextMenus.update).toHaveBeenCalledWith(MENU_ID_TRANSLATE, {
      title: "Show Original",
    })
  })

  it("does not expose speak or custom actions in the selection menu", async () => {
    const config = createConfig(true)
    config.selectionToolbar.customActions = [
      { id: "dictionary", name: "Dictionary", enabled: true },
      { id: "disabled", name: "Disabled", enabled: false },
      { id: "rewrite", name: "Rewrite", enabled: true },
    ] as Config["selectionToolbar"]["customActions"]
    ensureInitializedConfigMock.mockResolvedValue(config)

    const { initializeContextMenu } = await import("../context-menu")

    await initializeContextMenu()

    expect(browser.contextMenus.create).toHaveBeenCalledTimes(2)
    expect(browser.contextMenus.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: "Dictionary" }),
    )
  })

  it("removes menu items without recreating them when the context menu is disabled", async () => {
    ensureInitializedConfigMock.mockResolvedValue(createConfig(false))

    const { initializeContextMenu } = await import("../context-menu")

    await initializeContextMenu()

    expect(browser.contextMenus.removeAll).toHaveBeenCalledOnce()
    expect(browser.contextMenus.create).not.toHaveBeenCalled()
    expect(browser.contextMenus.update).not.toHaveBeenCalled()
  })

  it("routes selection menu clicks directly to HiTranslator", async () => {
    const { MENU_ID_SELECTION_TRANSLATE, registerContextMenuListeners } =
      await import("../context-menu")

    registerContextMenuListeners()

    const clickHandler = contextMenuClickListeners[0]
    if (!clickHandler) {
      throw new Error("Context menu click listener was not registered")
    }

    await clickHandler(
      {
        menuItemId: MENU_ID_SELECTION_TRANSLATE,
        selectionText: "Selected text",
        frameId: 7,
      },
      {
        id: 5,
        title: "Example page",
        url: "https://example.com/article",
      },
    )

    expect(openHiTranslatorSelectionTranslationMock).toHaveBeenCalledWith({
      selectionText: "Selected text",
      pageTitle: "Example page",
      url: "https://example.com/article",
    })
  })
})
