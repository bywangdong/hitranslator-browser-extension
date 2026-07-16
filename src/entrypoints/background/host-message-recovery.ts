import { browser } from "#imports"

const HOST_CONTENT_SCRIPT_FILE = "/content-scripts/host.js" as const
const DEFAULT_RETRY_DELAYS_MS = [0, 80, 180] as const

export const HOST_MESSAGE_RECOVERY_ERROR = "当前网页尚未连接到插件，请刷新网页后重试"

type HostMessageRecoveryOptions = {
  retryDelaysMs?: readonly number[]
  wait?: (delayMs: number) => Promise<void>
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return typeof error === "string" ? error : ""
}

export function isMissingMessageReceiverError(error: unknown): boolean {
  const message = getErrorMessage(error)
  return (
    /Could not establish connection/i.test(message) && /Receiving end does not exist/i.test(message)
  )
}

function waitFor(delayMs: number): Promise<void> {
  if (delayMs <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

function resetHostContentInjectionMarker(): void {
  ;(
    globalThis as typeof globalThis & { __HITRANSLATOR_HOST_INJECTED__?: boolean }
  ).__HITRANSLATOR_HOST_INJECTED__ = false
}

export async function sendHostMessageWithRecovery<T>(
  tabId: number,
  send: () => Promise<T>,
  { retryDelaysMs = DEFAULT_RETRY_DELAYS_MS, wait = waitFor }: HostMessageRecoveryOptions = {},
): Promise<T> {
  try {
    return await send()
  } catch (error) {
    if (!isMissingMessageReceiverError(error)) throw error
  }

  try {
    await browser.scripting.executeScript({
      target: { tabId },
      func: resetHostContentInjectionMarker,
    })
    await browser.scripting.executeScript({
      target: { tabId },
      files: [HOST_CONTENT_SCRIPT_FILE],
    })
  } catch {
    throw new Error(HOST_MESSAGE_RECOVERY_ERROR)
  }

  for (const delayMs of retryDelaysMs) {
    await wait(delayMs)
    try {
      return await send()
    } catch (error) {
      if (!isMissingMessageReceiverError(error)) throw error
    }
  }

  throw new Error(HOST_MESSAGE_RECOVERY_ERROR)
}
