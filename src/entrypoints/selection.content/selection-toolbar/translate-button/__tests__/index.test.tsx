// @vitest-environment jsdom
import type { ReactElement } from "react"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { TranslateButton } from ".."

const mocks = vi.hoisted(() => ({
  selectionContent: "Selected text",
  sendMessage: vi.fn<(...args: any[]) => any>(),
  setToolbarVisible: vi.fn<(...args: any[]) => any>(),
  toastError: vi.fn<(...args: any[]) => any>(),
}))

vi.mock("#imports", () => ({
  i18n: {
    t: (key: string) => key,
  },
}))

vi.mock("jotai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("jotai")>()
  return {
    ...actual,
    useAtomValue: () => mocks.selectionContent,
    useSetAtom: () => mocks.setToolbarVisible,
  }
})

vi.mock("@/utils/message", () => ({
  sendMessage: mocks.sendMessage,
}))

vi.mock("sonner", () => ({
  toast: {
    error: mocks.toastError,
  },
}))

vi.mock("../../../components/selection-tooltip", () => ({
  SelectionToolbarTooltip: ({ render: renderElement }: { render: ReactElement }) => renderElement,
}))

describe("translateButton", () => {
  beforeEach(() => {
    mocks.sendMessage.mockReset().mockResolvedValue({ opened: true })
    mocks.setToolbarVisible.mockReset()
    mocks.toastError.mockReset()
    document.title = "Example page"
  })

  it("blurs the trigger and sends the selection to HiTranslator", async () => {
    render(<TranslateButton />)

    const trigger = screen.getByRole("button", { name: "action.translation" })
    const blurSpy = vi.spyOn(trigger, "blur")

    trigger.focus()
    expect(trigger).toHaveFocus()

    fireEvent.click(trigger)

    expect(blurSpy).toHaveBeenCalledOnce()
    await waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledWith("openHiTranslatorSelection", {
        selectionText: "Selected text",
        pageTitle: "Example page",
        url: window.location.href,
      })
    })
    expect(blurSpy.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.sendMessage.mock.invocationCallOrder[0],
    )
    expect(mocks.setToolbarVisible).toHaveBeenCalledWith(false)
    expect(document.activeElement).not.toBe(trigger)
  })

  it("keeps the toolbar available and reports a native bridge error", async () => {
    mocks.sendMessage.mockRejectedValueOnce(new Error("请先启动 HiTranslator"))
    render(<TranslateButton />)

    fireEvent.click(screen.getByRole("button", { name: "action.translation" }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalledWith("请先启动 HiTranslator")
    })
    expect(mocks.setToolbarVisible).not.toHaveBeenCalled()
  })
})
