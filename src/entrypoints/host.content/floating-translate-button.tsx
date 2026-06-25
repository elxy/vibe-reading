import type { Config } from "@/types/config/config"
import { IconLanguage } from "@tabler/icons-react"
import ReactDOM from "react-dom/client"
import { i18n, storage } from "#imports"
import themeCSS from "@/assets/styles/theme.css?inline"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { Button } from "@/components/ui/base-ui/button"
import { TooltipProvider } from "@/components/ui/base-ui/tooltip"
import { configSchema } from "@/types/config/config"
import { CONFIG_STORAGE_KEY } from "@/utils/constants/config"
import { NOTRANSLATE_CLASS, REACT_SHADOW_HOST_CLASS } from "@/utils/constants/dom-labels"
import { isMobileLikeDevice, resolveFloatingTranslateButtonEnabled } from "@/utils/content/device"
import { ShadowHostBuilder } from "@/utils/react-shadow-host/shadow-host-builder"
import { cn } from "@/utils/styles/utils"

interface FloatingTranslateButtonProps {
  active: boolean
  onToggle: () => void
}

function FloatingTranslateButton({ active, onToggle }: FloatingTranslateButtonProps) {
  const label = active ? i18n.t("content.floatingTranslateButton.showOriginal") : i18n.t("content.floatingTranslateButton.translate")

  return (
    <div className={NOTRANSLATE_CLASS}>
      <Button
        type="button"
        size="icon-lg"
        variant={active ? "secondary" : "brand"}
        aria-label={label}
        title={label}
        onClick={onToggle}
        className={cn(
          "size-12 rounded-full shadow-floating ring-1 ring-foreground/10",
          "transition-transform hover:scale-105 active:scale-95",
        )}
      >
        <IconLanguage className="size-5" aria-hidden="true" />
      </Button>
    </div>
  )
}

function shouldShowFloatingTranslateButton(config: Config | null): boolean {
  return resolveFloatingTranslateButtonEnabled(config?.translate.page.floatingButtonEnabled)
}

export function mountFloatingTranslateButton({
  initialConfig,
  isActive,
  toggle,
}: {
  initialConfig: Config | null
  isActive: () => boolean
  toggle: () => void
}): () => void {
  if (window !== window.top) {
    return () => {}
  }

  const target = document.body ?? document.documentElement
  const shadowHost = document.createElement("div")
  shadowHost.classList.add(REACT_SHADOW_HOST_CLASS)
  shadowHost.setAttribute("data-vibe-reading-floating-translate-button", "")
  Object.assign(shadowHost.style, {
    position: "fixed",
    right: isMobileLikeDevice() ? "18px" : "24px",
    bottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
    zIndex: "2147483647",
    display: shouldShowFloatingTranslateButton(initialConfig) ? "block" : "none",
  } satisfies Partial<CSSStyleDeclaration>)

  const shadowRoot = shadowHost.attachShadow({ mode: "open" })
  const hostBuilder = new ShadowHostBuilder(shadowRoot, {
    position: "block",
    cssContent: [themeCSS],
    inheritStyles: false,
  })
  const reactContainer = hostBuilder.build()
  const root = ReactDOM.createRoot(reactContainer)

  let active = isActive()

  const render = () => {
    root.render(
      <ThemeProvider container={reactContainer}>
        <TooltipProvider>
          <FloatingTranslateButton active={active} onToggle={toggle} />
        </TooltipProvider>
      </ThemeProvider>,
    )
  }

  const updateFromConfig = (config: Config | null) => {
    shadowHost.style.display = shouldShowFloatingTranslateButton(config) ? "block" : "none"
  }

  const updateActiveState = () => {
    active = isActive()
    render()
  }

  const unwatchConfig = storage.watch<Config>(`local:${CONFIG_STORAGE_KEY}`, (newConfig) => {
    const parseResult = configSchema.safeParse(newConfig)
    updateFromConfig(parseResult.success ? parseResult.data : null)
  })

  const handleTranslationStateChanged = () => updateActiveState()
  window.addEventListener("vibe-reading:page-translation-state-changed", handleTranslationStateChanged)

  render()
  target.appendChild(shadowHost)

  let cleaned = false

  return () => {
    if (cleaned) {
      return
    }

    cleaned = true
    window.removeEventListener("vibe-reading:page-translation-state-changed", handleTranslationStateChanged)
    unwatchConfig()
    root.unmount()
    hostBuilder.cleanup()
    shadowHost.remove()
  }
}
