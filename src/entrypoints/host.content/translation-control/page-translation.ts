import type { Config } from "@/types/config/config"
import type { SmartContentConfidence, SmartContentDetectionSource } from "@/utils/host/translate/smart/content-detector"
import type { SmartParagraphDecision } from "@/utils/host/translate/smart/paragraph-filter"
import type { ParsedSmartRule, SmartRuleParseError } from "@/utils/host/translate/smart/user-rules"
import { getLocalConfig } from "@/utils/config/storage"
import { CONTENT_WRAPPER_CLASS } from "@/utils/constants/dom-labels"
import { SMART_CONTENT_DETECTION_TIMEOUT_MS, SMART_DEFAULT_MIN_CHARACTERS_PER_NODE, SMART_DEFAULT_MIN_WORDS_PER_NODE } from "@/utils/constants/translate"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { hasNoWalkAncestor, isDontWalkIntoAndDontTranslateAsChildElement, isDontWalkIntoButTranslateAsChildElement, isHTMLElement } from "@/utils/host/dom/filter"
import { deepQueryTopLevelSelector } from "@/utils/host/dom/find"
import { walkAndLabelElement } from "@/utils/host/dom/traversal"
import { removeAllTranslatedWrapperNodes, translateWalkedElement } from "@/utils/host/translate/node-manipulation"
import { detectSmartContentRoot } from "@/utils/host/translate/smart/content-detector"
import { shouldTranslateSmartParagraph } from "@/utils/host/translate/smart/paragraph-filter"
import { matchSmartRulesForElement, parseSmartRules } from "@/utils/host/translate/smart/user-rules"
import { validateTranslationConfigAndToast } from "@/utils/host/translate/translate-text"
import { logger } from "@/utils/logger"
import { sendMessage } from "@/utils/message"

type SimpleIntersectionOptions = Omit<IntersectionObserverInit, "threshold"> & {
  threshold?: number
}

interface IPageTranslationManager {
  /**
   * Indicates whether the page translation is currently active
   */
  readonly isActive: boolean

  /**
   * Starts the automatic page translation functionality
   * Registers observers, touch triggers and set storage
   */
  start: () => Promise<void>

  /**
   * Stops the automatic page translation functionality
   * Cleans up all observers and removes translated content and set storage
   */
  stop: () => void

  /**
   * Refreshes translation after an in-document route change without disabling
   * the tab-level page translation session.
   */
  restart: () => Promise<void>

  /**
   * Registers page translation triggers
   */
  registerPageTranslationTriggers: () => () => void
}

interface SmartPageContext {
  root: HTMLElement
  source: SmartContentDetectionSource
  confidence: SmartContentConfidence
  parsedRules: ParsedSmartRule[]
  ruleErrors: SmartRuleParseError[]
  debug: boolean
}

export class PageTranslationManager implements IPageTranslationManager {
  private static readonly MAX_DURATION = 500
  private static readonly MOVE_THRESHOLD = 30 * 30
  private static readonly DEFAULT_INTERSECTION_OPTIONS: SimpleIntersectionOptions = {
    root: null,
    rootMargin: "600px",
    threshold: 0.1,
  }

  private isPageTranslating: boolean = false
  private intersectionObserver: IntersectionObserver | null = null
  private mutationObservers: MutationObserver[] = []
  private walkId: string | null = null
  private intersectionOptions: IntersectionObserverInit
  private walkBlockedElementsCache = new WeakSet<HTMLElement>()
  private smartContext: SmartPageContext | null = null
  private parsedSmartRules: ParsedSmartRule[] = []
  private smartRuleErrors: SmartRuleParseError[] = []

  constructor(intersectionOptions: SimpleIntersectionOptions = {}) {
    if (intersectionOptions.threshold !== undefined) {
      if (intersectionOptions.threshold < 0 || intersectionOptions.threshold > 1) {
        throw new Error("IntersectionObserver threshold must be between 0 and 1")
      }
    }

    this.intersectionOptions = {
      ...PageTranslationManager.DEFAULT_INTERSECTION_OPTIONS,
      ...intersectionOptions,
    }
  }

  get isActive(): boolean {
    return this.isPageTranslating
  }

  private dispatchTranslationStateChanged(): void {
    window.dispatchEvent(new CustomEvent("vibe-reading:page-translation-state-changed", {
      detail: { active: this.isPageTranslating },
    }))
  }

  async start(): Promise<void> {
    if (this.isPageTranslating) {
      console.warn("PageTranslationManager is already active")
      return
    }

    const config = await getLocalConfig()
    if (!config) {
      console.warn("Config is not initialized")
      return
    }

    if (!validateTranslationConfigAndToast({
      providersConfig: config.providersConfig,
      translate: config.translate,
      language: config.language,
    })) {
      return
    }

    await sendMessage("setAndNotifyPageTranslationStateChangedByManager", {
      enabled: true,
      url: window.location.href,
    })

    this.isPageTranslating = true
    this.dispatchTranslationStateChanged()

    // Parse user rules (applies to all page translation ranges)
    const parsedRules = parseSmartRules(config.translate.page.smart.customRules)
    this.parsedSmartRules = parsedRules.rules
    this.smartRuleErrors = parsedRules.errors

    // Smart mode: detect content root
    if (config.translate.page.range === "smart") {
      const debugEnabled = config.translate.page.smart.debug
      try {
        const detectionResult = await detectSmartContentRoot(document, {
          hostname: window.location.hostname,
          timeoutMs: SMART_CONTENT_DETECTION_TIMEOUT_MS,
          debug: debugEnabled,
        })

        this.smartContext = {
          root: detectionResult.root,
          source: detectionResult.source,
          confidence: detectionResult.confidence,
          parsedRules: parsedRules.rules,
          ruleErrors: parsedRules.errors,
          debug: debugEnabled,
        }

        if (debugEnabled) {
          logger.info(`[smart] detection: source=${detectionResult.source}, confidence=${detectionResult.confidence}, root=${detectionResult.root.tagName}`)
          if (detectionResult.debug.candidates.length > 0) {
            logger.info("[smart] candidate scores:", detectionResult.debug.candidates)
          }
          if (detectionResult.debug.fallbackReason) {
            logger.info(`[smart] fallback reason: ${detectionResult.debug.fallbackReason}`)
          }
        }
      }
      catch (error) {
        this.smartContext = null
        if (debugEnabled) {
          logger.info("[smart] detection failed, falling back to main behavior:", error)
        }
      }
    }
    else {
      this.smartContext = null
    }

    // Log user rule errors when debug is enabled
    if (config.translate.page.smart.debug && parsedRules.errors.length > 0) {
      for (const err of parsedRules.errors) {
        logger.info(`[smart] rule parse error at line ${err.line}: ${err.message}`)
      }
    }

    // Listen to existing elements when they enter the viewport
    const walkId = getRandomUUID()
    this.walkId = walkId
    this.intersectionObserver = new IntersectionObserver(async (entries, observer) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          if (isHTMLElement(entry.target)) {
            if (!entry.target.closest(`.${CONTENT_WRAPPER_CLASS}`)) {
              const currentConfig = await getLocalConfig()
              if (!currentConfig) {
                logger.error("Global config is not initialized")
                return
              }
              void translateWalkedElement(entry.target, walkId, currentConfig)
            }
          }
          observer.unobserve(entry.target)
        }
      }
    }, this.intersectionOptions)

    // Initialize walkability state for existing elements
    const startContainer = this.smartContext?.root ?? document.body
    this.addWalkBlockedElements(startContainer, config)
    await this.observeTopLevelParagraphs(startContainer, config)

    // Always observe mutations from document.body so that external additions
    // can be detected for user-include handling in smart mode
    this.observeMutations(document.body)
  }

  stop(): void {
    this.stopInternal({ notify: true })
  }

  async restart(): Promise<void> {
    if (!this.isPageTranslating) {
      await this.start()
      return
    }

    this.stopInternal({ notify: false })
    await this.start()
  }

  private stopInternal({ notify }: { notify: boolean }): void {
    if (!this.isPageTranslating) {
      console.warn("PageTranslationManager is already inactive")
      return
    }

    if (notify) {
      void sendMessage("setAndNotifyPageTranslationStateChangedByManager", {
        enabled: false,
        url: window.location.href,
      })
    }

    this.isPageTranslating = false
    this.dispatchTranslationStateChanged()
    this.walkId = null
    this.walkBlockedElementsCache = new WeakSet()
    this.smartContext = null
    this.parsedSmartRules = []
    this.smartRuleErrors = []

    if (this.intersectionObserver) {
      this.intersectionObserver.disconnect()
      this.intersectionObserver = null
    }
    this.mutationObservers.forEach(observer => observer.disconnect())
    this.mutationObservers = []

    void removeAllTranslatedWrapperNodes()
  }

  registerPageTranslationTriggers(): () => void {
    let startTime = 0
    let startTouches: TouchList | null = null

    const reset = () => {
      startTime = 0
      startTouches = null
    }

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 4) {
        startTime = performance.now()
        startTouches = e.touches
      }
      else {
        reset()
      }
    }

    const onMove = (e: TouchEvent) => {
      if (!startTouches)
        return
      if (e.touches.length !== 4)
        return reset()

      for (let i = 0; i < 4; i++) {
        const dx = e.touches[i].clientX - startTouches[i].clientX
        const dy = e.touches[i].clientY - startTouches[i].clientY
        if (dx * dx + dy * dy > PageTranslationManager.MOVE_THRESHOLD)
          return reset()
      }
    }

    const onEnd = () => {
      if (!startTouches)
        return
      if (performance.now() - startTime < PageTranslationManager.MAX_DURATION) {
        this.isPageTranslating
          ? this.stop()
          : void this.start()
      }
      reset()
    }

    document.addEventListener("touchstart", onStart, { passive: true })
    document.addEventListener("touchmove", onMove, { passive: true })
    document.addEventListener("touchend", onEnd, { passive: true })
    document.addEventListener("touchcancel", reset, { passive: true })

    // Teardown: remove all touch listeners
    return () => {
      document.removeEventListener("touchstart", onStart)
      document.removeEventListener("touchmove", onMove)
      document.removeEventListener("touchend", onEnd)
      document.removeEventListener("touchcancel", reset)
    }
  }

  /**
   * Determine whether a candidate element should be observed for translation.
   * Applies user rules and (in smart mode) smart paragraph filtering.
   */
  private shouldObserveCandidate(el: HTMLElement, config: Config): boolean {
    const hostname = window.location.hostname

    // Apply user rules
    const userDecision = matchSmartRulesForElement(el, hostname, this.parsedSmartRules)

    if (userDecision.action === "exclude") {
      if (this.smartContext?.debug) {
        logger.info(`[smart] user exclude rule matched: ${el.tagName}`)
      }
      return false
    }

    if (userDecision.action === "include") {
      return true
    }

    // Smart mode: apply paragraph filter
    if (this.smartContext) {
      const minChars = config.translate.page.minCharactersPerNode || SMART_DEFAULT_MIN_CHARACTERS_PER_NODE
      const minWords = config.translate.page.minWordsPerNode || SMART_DEFAULT_MIN_WORDS_PER_NODE

      const decision: SmartParagraphDecision = shouldTranslateSmartParagraph(el, {
        hostname,
        minCharacters: minChars,
        minWords,
      })

      if (!decision.shouldTranslate && this.smartContext.debug) {
        logger.info(`[smart] filtered out: ${decision.reason}`, el.tagName)
      }

      return decision.shouldTranslate
    }

    // all/main mode: observe everything not excluded by user rules
    return true
  }

  private async observeTopLevelParagraphs(container: HTMLElement, existingConfig?: Config): Promise<void> {
    const observer = this.intersectionObserver
    if (!this.walkId || !observer)
      return

    const config = existingConfig ?? await getLocalConfig()
    if (!config) {
      logger.error("Global config is not initialized")
      return
    }

    // Skip if container has an ancestor that should not be walked into
    if (hasNoWalkAncestor(container, config))
      return

    walkAndLabelElement(container, this.walkId, config)
    // if container itself has paragraph and the id
    if (container.hasAttribute("data-vibe-reading-paragraph") && container.getAttribute("data-vibe-reading-walked") === this.walkId) {
      observer.observe(container)
      return
    }

    const paragraphs = this.collectParagraphElementsDeep(container, this.walkId)
    const topLevelParagraphs = paragraphs.filter((el) => {
      const ancestor = el.parentElement?.closest("[data-vibe-reading-paragraph]")
      // keep it if either:
      //  • no paragraph ancestor at all, or
      //  • the ancestor is *not* inside container
      return !ancestor || !container.contains(ancestor)
    })
    topLevelParagraphs.forEach((el) => {
      if (this.shouldObserveCandidate(el, config)) {
        observer.observe(el)
      }
    })
  }

  /**
   * Recursively collect elements with paragraph attributes from shadow roots and iframes
   */
  private collectParagraphElementsDeep(container: HTMLElement, walkId: string): HTMLElement[] {
    const result: HTMLElement[] = []

    const collectFromContainer = (root: HTMLElement | Document | ShadowRoot) => {
      const elements = root.querySelectorAll<HTMLElement>(`[data-vibe-reading-paragraph][data-vibe-reading-walked="${CSS.escape(walkId)}"]`)
      result.push(...[...elements])
    }

    const traverseElement = (element: HTMLElement) => {
      if (element.shadowRoot) {
        collectFromContainer(element.shadowRoot)
        for (const child of element.shadowRoot.children) {
          if (child instanceof HTMLElement) {
            traverseElement(child)
          }
        }
      }

      for (const child of element.children) {
        if (child instanceof HTMLElement) {
          traverseElement(child)
        }
      }
    }

    collectFromContainer(container)
    traverseElement(container)

    return result
  }

  /**
   * Track the same blocked states that the traversal skips, so hidden accordion
   * panels can be re-walked when the site reveals an existing subtree.
   */
  private isWalkBlockedElement(element: HTMLElement, config: Config): boolean {
    return isDontWalkIntoButTranslateAsChildElement(element)
      || isDontWalkIntoAndDontTranslateAsChildElement(element, config)
  }

  /**
   * Handle attribute changes and only trigger observation
   * when element transitions from blocked to walkable.
   */
  private didChangeToWalkable(element: HTMLElement, config: Config): boolean {
    const wasWalkBlocked = this.walkBlockedElementsCache.has(element)
    const isWalkBlockedNow = this.isWalkBlockedElement(element, config)

    // Update cache with current state
    if (isWalkBlockedNow) {
      this.walkBlockedElementsCache.add(element)
    }
    else {
      this.walkBlockedElementsCache.delete(element)
    }

    return wasWalkBlocked === true && isWalkBlockedNow === false
  }

  /**
   * Initialize walkability state for an element and its descendants
   */
  private addWalkBlockedElements(element: HTMLElement, config: Config): void {
    const walkBlockedElements = deepQueryTopLevelSelector(element, el => this.isWalkBlockedElement(el, config))
    walkBlockedElements.forEach(el => this.walkBlockedElementsCache.add(el))
  }

  /**
   * Start observing mutations for a container and all its shadow roots
   */
  private observeMutations(container: HTMLElement): void {
    const mutationObserver = new MutationObserver((records) => {
      void this.handleMutationRecords(records)
    })

    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "hidden", "aria-hidden"],
    })

    this.mutationObservers.push(mutationObserver)
    this.observeIsolatedDescendantsMutations(container)
  }

  private async handleMutationRecords(records: MutationRecord[]): Promise<void> {
    const config = await getLocalConfig()
    if (!config) {
      logger.error("Global config is not initialized")
      return
    }

    for (const rec of records) {
      if (rec.type === "childList") {
        rec.addedNodes.forEach((node) => {
          if (isHTMLElement(node)) {
            // Smart mode: skip nodes outside smart root unless user-include forces observation
            if (this.smartContext) {
              const insideSmartRoot = this.smartContext.root === node || this.smartContext.root.contains(node)
              if (!insideSmartRoot) {
                const userDecision = matchSmartRulesForElement(node, window.location.hostname, this.parsedSmartRules)
                if (userDecision.action !== "include") {
                  if (this.smartContext.debug) {
                    logger.info(`[smart] skipped mutation outside smart root: ${node.tagName}`)
                  }
                  return
                }
                if (this.smartContext.debug) {
                  logger.info(`[smart] user-include forced mutation outside smart root: ${node.tagName}`)
                }
              }
            }

            this.addWalkBlockedElements(node, config)
            void this.observeTopLevelParagraphs(node, config)
            this.observeIsolatedDescendantsMutations(node)
          }
        })
      }
      else if (this.isWalkabilityAttributeMutation(rec)) {
        const el = rec.target
        if (isHTMLElement(el) && this.didChangeToWalkable(el, config)) {
          void this.observeTopLevelParagraphs(el, config)
        }
      }
    }
  }

  private isWalkabilityAttributeMutation(record: MutationRecord): boolean {
    return record.type === "attributes"
      && (record.attributeName === "style"
        || record.attributeName === "class"
        || record.attributeName === "hidden"
        || record.attributeName === "aria-hidden")
  }

  /**
   * Recursively find and observe shadow roots and iframes in an element and its descendants
   * These can't be found as top level paragraph elements because isolated shadow roots and iframes are not
   * considered as part of the document.
   */
  private observeIsolatedDescendantsMutations(element: HTMLElement): void {
    // Check if this element has a shadow root
    if (element.shadowRoot) {
      for (const child of element.shadowRoot.children) {
        if (isHTMLElement(child)) {
          this.observeMutations(child)
        }
      }
    }

    // Recursively check children
    for (const child of element.children) {
      if (isHTMLElement(child)) {
        this.observeIsolatedDescendantsMutations(child)
      }
    }
  }
}
