import { beforeEach, describe, expect, it, vi } from "vitest"
import { browser } from "#imports"
import {
  HOST_MESSAGE_RECOVERY_ERROR,
  isMissingMessageReceiverError,
  sendHostMessageWithRecovery,
} from "../host-message-recovery"

const executeScriptMock = vi.fn<(...args: any[]) => any>()
const waitImmediately = vi.fn<(delayMs: number) => Promise<void>>().mockResolvedValue(undefined)

describe("sendHostMessageWithRecovery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    browser.scripting.executeScript = executeScriptMock
    executeScriptMock.mockResolvedValue(undefined)
  })

  it("keeps the normal message path free of reinjection", async () => {
    const send = vi.fn<() => Promise<string>>().mockResolvedValue("restored")

    await expect(
      sendHostMessageWithRecovery(42, send, {
        retryDelaysMs: [0],
        wait: waitImmediately,
      }),
    ).resolves.toBe("restored")

    expect(executeScriptMock).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("reinjects the host content script and retries a missing receiver", async () => {
    const send = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(
        new Error("Could not establish connection. Receiving end does not exist."),
      )
      .mockResolvedValue("restored")

    await expect(
      sendHostMessageWithRecovery(42, send, {
        retryDelaysMs: [0],
        wait: waitImmediately,
      }),
    ).resolves.toBe("restored")

    expect(executeScriptMock).toHaveBeenCalledTimes(2)
    expect(executeScriptMock).toHaveBeenNthCalledWith(1, {
      target: { tabId: 42 },
      func: expect.any(Function),
    })
    expect(executeScriptMock).toHaveBeenNthCalledWith(2, {
      target: { tabId: 42 },
      files: ["/content-scripts/host.js"],
    })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("replaces repeated missing-receiver failures with a localized recovery message", async () => {
    const send = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error("Could not establish connection. Receiving end does not exist."))

    await expect(
      sendHostMessageWithRecovery(42, send, {
        retryDelaysMs: [0, 0],
        wait: waitImmediately,
      }),
    ).rejects.toThrow(HOST_MESSAGE_RECOVERY_ERROR)

    expect(send).toHaveBeenCalledTimes(3)
  })

  it("does not hide unrelated content-script failures", async () => {
    const originalError = new Error("translation failed")
    const send = vi.fn<() => Promise<void>>().mockRejectedValue(originalError)

    await expect(sendHostMessageWithRecovery(42, send)).rejects.toBe(originalError)
    expect(executeScriptMock).not.toHaveBeenCalled()
  })

  it("localizes pages where Chrome blocks reinjection", async () => {
    const send = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(
        new Error("Could not establish connection. Receiving end does not exist."),
      )
    executeScriptMock.mockRejectedValue(new Error("Cannot access a chrome:// URL"))

    await expect(
      sendHostMessageWithRecovery(42, send, {
        retryDelaysMs: [0],
        wait: waitImmediately,
      }),
    ).rejects.toThrow(HOST_MESSAGE_RECOVERY_ERROR)

    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe("isMissingMessageReceiverError", () => {
  it("matches only Chrome's missing receiving-end error", () => {
    expect(
      isMissingMessageReceiverError(
        new Error("Could not establish connection. Receiving end does not exist."),
      ),
    ).toBe(true)
    expect(isMissingMessageReceiverError(new Error("Extension context invalidated."))).toBe(false)
  })
})
