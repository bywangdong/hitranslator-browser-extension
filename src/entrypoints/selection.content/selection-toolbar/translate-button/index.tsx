import { RiTranslate } from "@remixicon/react"
import { useAtomValue, useSetAtom } from "jotai"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { i18n } from "@/utils/i18n"
import { sendMessage } from "@/utils/message"
import { SelectionToolbarTooltip } from "../../components/selection-tooltip"
import { isSelectionToolbarVisibleAtom, selectionContentAtom } from "../atoms"

export function TranslateButton() {
  const selectionContent = useAtomValue(selectionContentAtom)
  const setIsSelectionToolbarVisible = useSetAtom(isSelectionToolbarVisibleAtom)
  const [isOpening, setIsOpening] = useState(false)
  const triggerLabel = i18n.t("action.translation")
  const handleClick = useCallback(async () => {
    if (isOpening) return

    const selectionText = selectionContent?.trim()
    if (!selectionText) return

    setIsOpening(true)
    try {
      await sendMessage("openHiTranslatorSelection", {
        selectionText,
        pageTitle: document.title,
        url: window.location.href,
      })
      setIsSelectionToolbarVisible(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "无法打开 HiTranslator")
    } finally {
      setIsOpening(false)
    }
  }, [isOpening, selectionContent, setIsSelectionToolbarVisible])

  return (
    <SelectionToolbarTooltip
      content={triggerLabel}
      render={
        <button
          type="button"
          aria-label={triggerLabel}
          aria-busy={isOpening}
          className="flex h-7 shrink-0 cursor-pointer items-center justify-center px-2 hover:bg-accent disabled:cursor-wait disabled:opacity-60"
          disabled={isOpening}
          onClick={(event) => {
            event.currentTarget.blur()
            void handleClick()
          }}
        />
      }
    >
      <RiTranslate className={isOpening ? "size-4.5 animate-pulse" : "size-4.5"} />
    </SelectionToolbarTooltip>
  )
}
