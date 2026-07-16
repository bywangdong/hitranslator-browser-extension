import { kebabCase } from "case-anything"
import * as React from "react"
import { Toaster } from "sonner"
import { browser } from "#imports"
import hiTranslatorIcon from "@/assets/icons/hitranslator.png?url&no-inline"
import { APP_NAME } from "@/utils/constants/app"

const hiTranslatorIconUrl = new URL(hiTranslatorIcon, browser.runtime.getURL("/")).href

const frogIconElement = (
  <img
    src={hiTranslatorIconUrl}
    alt={APP_NAME}
    style={{
      maxWidth: "100%",
      height: "auto",
      minHeight: "20px",
      minWidth: "20px",
    }}
  />
)

function FrogToast({
  position = "bottom-left",
  toastOptions,
  ...props
}: React.ComponentProps<typeof Toaster>) {
  return (
    <Toaster
      {...props}
      position={position}
      richColors
      icons={{
        warning: frogIconElement,
        success: frogIconElement,
        error: frogIconElement,
        info: frogIconElement,
        loading: frogIconElement,
      }}
      toastOptions={{
        ...toastOptions,
        className: [`${kebabCase(APP_NAME)}-toaster`, toastOptions?.className]
          .filter(Boolean)
          .join(" "),
      }}
      className="notranslate z-[2147483647]"
    />
  )
}

export default FrogToast
