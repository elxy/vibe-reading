import { kebabCase } from "case-anything"
import * as React from "react"
import { Toaster } from "sonner"

import { browser } from "#imports"
import vibeReadingIcon from "@/assets/icons/vibe-reading.png?url&no-inline"
import { APP_NAME } from "@/utils/constants/app"

const vibeReadingIconUrl = new URL(vibeReadingIcon, browser.runtime.getURL("/")).href

const vibeReadingIconElement = (
  <img
    src={vibeReadingIconUrl}
    alt={APP_NAME}
    style={{
      maxWidth: "100%",
      height: "auto",
      minHeight: "20px",
      minWidth: "20px",
    }}
  />
)

function AppToast({ position = "bottom-left", toastOptions, ...props }: React.ComponentProps<typeof Toaster>) {
  return (
    <Toaster
      {...props}
      position={position}
      richColors
      icons={{
        warning: vibeReadingIconElement,
        success: vibeReadingIconElement,
        error: vibeReadingIconElement,
        info: vibeReadingIconElement,
        loading: vibeReadingIconElement,
      }}
      toastOptions={{
        ...toastOptions,
        className: [`${kebabCase(APP_NAME)}-toaster`, toastOptions?.className].filter(Boolean).join(" "),
      }}
      className="z-[2147483647] notranslate"
    />
  )
}

export default AppToast
