// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { PageTranslationManager } from "../page-translation"

const {
  mockDeepQueryTopLevelSelector,
  mockGetDetectedCodeFromStorage,
  mockGetLocalConfig,
  mockHasNoWalkAncestor,
  mockIsDontWalkIntoAndDontTranslateAsChildElement,
  mockIsDontWalkIntoButTranslateAsChildElement,
  mockRemoveAllTranslatedWrapperNodes,
  mockSendMessage,
  mockTranslateWalkedElement,
  mockValidateTranslationConfigAndToast,
  mockWalkAndLabelElement,
  mockDetectSmartContentRoot,
  mockShouldTranslateSmartParagraph,
  mockParseSmartRules,
  mockMatchSmartRulesForElement,
} = vi.hoisted(() => ({
  mockGetDetectedCodeFromStorage: vi.fn(),
  mockGetLocalConfig: vi.fn(),
  mockDeepQueryTopLevelSelector: vi.fn(),
  mockHasNoWalkAncestor: vi.fn(),
  mockIsDontWalkIntoAndDontTranslateAsChildElement: vi.fn(),
  mockIsDontWalkIntoButTranslateAsChildElement: vi.fn(),
  mockWalkAndLabelElement: vi.fn(),
  mockRemoveAllTranslatedWrapperNodes: vi.fn(),
  mockTranslateWalkedElement: vi.fn(),
  mockValidateTranslationConfigAndToast: vi.fn(),
  mockSendMessage: vi.fn(),
  mockDetectSmartContentRoot: vi.fn(),
  mockShouldTranslateSmartParagraph: vi.fn(),
  mockParseSmartRules: vi.fn(),
  mockMatchSmartRulesForElement: vi.fn(),
}))

vi.mock("@/utils/config/languages", () => ({
  getDetectedCodeFromStorage: mockGetDetectedCodeFromStorage,
}))

vi.mock("@/utils/config/storage", () => ({
  getLocalConfig: mockGetLocalConfig,
}))

vi.mock("@/utils/crypto-polyfill", () => ({
  getRandomUUID: () => "walk-id",
}))

vi.mock("@/utils/host/dom/filter", () => ({
  hasNoWalkAncestor: mockHasNoWalkAncestor,
  isDontWalkIntoAndDontTranslateAsChildElement: mockIsDontWalkIntoAndDontTranslateAsChildElement,
  isDontWalkIntoButTranslateAsChildElement: mockIsDontWalkIntoButTranslateAsChildElement,
  isHTMLElement: (node: unknown) => node instanceof HTMLElement,
}))

vi.mock("@/utils/host/dom/find", () => ({
  deepQueryTopLevelSelector: mockDeepQueryTopLevelSelector,
}))

vi.mock("@/utils/host/dom/traversal", () => ({
  walkAndLabelElement: mockWalkAndLabelElement,
}))

vi.mock("@/utils/host/translate/node-manipulation", () => ({
  removeAllTranslatedWrapperNodes: mockRemoveAllTranslatedWrapperNodes,
  translateWalkedElement: mockTranslateWalkedElement,
}))

vi.mock("@/utils/host/translate/smart/content-detector", () => ({
  detectSmartContentRoot: mockDetectSmartContentRoot,
}))

vi.mock("@/utils/host/translate/smart/paragraph-filter", () => ({
  shouldTranslateSmartParagraph: mockShouldTranslateSmartParagraph,
}))

vi.mock("@/utils/host/translate/smart/user-rules", () => ({
  parseSmartRules: mockParseSmartRules,
  matchSmartRulesForElement: mockMatchSmartRulesForElement,
}))

vi.mock("@/utils/host/translate/translate-text", () => ({
  validateTranslationConfigAndToast: mockValidateTranslationConfigAndToast,
}))

vi.mock("@/utils/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock("@/utils/message", () => ({
  sendMessage: mockSendMessage,
}))

const intersectionObservers: MockIntersectionObserver[] = []

class MockIntersectionObserver {
  observe = vi.fn((target: Element) => {
    this.targets.add(target)
  })

  unobserve = vi.fn((target: Element) => {
    this.targets.delete(target)
  })

  disconnect = vi.fn(() => {
    this.targets.clear()
  })

  private readonly targets = new Set<Element>()

  constructor(
    private readonly callback: IntersectionObserverCallback,
    _options?: IntersectionObserverInit,
  ) {
    intersectionObservers.push(this)
  }

  async triggerIntersect(target: Element): Promise<void> {
    await this.callback([{
      isIntersecting: true,
      target,
    } as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }

  getTargets(): Element[] {
    return [...this.targets]
  }
}

async function flushDomUpdates(): Promise<void> {
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  await Promise.resolve()
}

function deepQueryTopLevelSelectorImpl(
  root: Document | ShadowRoot | HTMLElement,
  selectorFn: (element: HTMLElement) => boolean,
): HTMLElement[] {
  if (root instanceof Document) {
    return root.body ? deepQueryTopLevelSelectorImpl(root.body, selectorFn) : []
  }

  if (root instanceof HTMLElement && selectorFn(root)) {
    return [root]
  }

  const result: HTMLElement[] = []

  if (root instanceof HTMLElement && root.shadowRoot) {
    result.push(...deepQueryTopLevelSelectorImpl(root.shadowRoot, selectorFn))
  }

  for (const child of root.children) {
    if (child instanceof HTMLElement) {
      result.push(...deepQueryTopLevelSelectorImpl(child, selectorFn))
    }
  }

  return result
}

function isBlockedForTraversal(element: HTMLElement): boolean {
  return Boolean(element.hidden)
    || element.getAttribute("aria-hidden") === "true"
    || element.classList.contains("closed")
}

function walkAndLabelVisibleParagraphs(element: HTMLElement, walkId: string) {
  if (isBlockedForTraversal(element)) {
    return {
      forceBlock: false,
      isInlineNode: false,
    }
  }

  element.setAttribute("data-vibe-reading-walked", walkId)

  for (const child of element.children) {
    if (child instanceof HTMLElement) {
      walkAndLabelVisibleParagraphs(child, walkId)
    }
  }

  if (element.tagName === "P" && element.textContent?.trim()) {
    element.setAttribute("data-vibe-reading-paragraph", "")
  }

  return {
    forceBlock: false,
    isInlineNode: false,
  }
}

function buildSmartConfig(overrides: Record<string, unknown> = {}): typeof DEFAULT_CONFIG {
  return {
    ...DEFAULT_CONFIG,
    translate: {
      ...DEFAULT_CONFIG.translate,
      page: {
        ...DEFAULT_CONFIG.translate.page,
        range: "smart",
        smart: {
          customRules: "",
          debug: false,
          ...overrides as Record<string, unknown>,
        },
      },
    },
  }
}

function setupMutationTestDefaults(): void {
  mockHasNoWalkAncestor.mockReturnValue(false)
  mockIsDontWalkIntoButTranslateAsChildElement.mockReturnValue(false)
  mockIsDontWalkIntoAndDontTranslateAsChildElement.mockImplementation((element: HTMLElement) => isBlockedForTraversal(element))
  mockDeepQueryTopLevelSelector.mockImplementation(deepQueryTopLevelSelectorImpl)
  mockWalkAndLabelElement.mockImplementation((element: HTMLElement, walkId: string) => walkAndLabelVisibleParagraphs(element, walkId))
  mockValidateTranslationConfigAndToast.mockReturnValue(true)
  mockSendMessage.mockResolvedValue(undefined)
  mockParseSmartRules.mockReturnValue({ rules: [], errors: [] })
  mockMatchSmartRulesForElement.mockReturnValue({ action: null, matchedRules: [] })
  mockShouldTranslateSmartParagraph.mockReturnValue({ shouldTranslate: true, forced: false, reason: "pass" })
}

describe("pageTranslationManager mutation re-walk", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    intersectionObservers.length = 0

    document.head.innerHTML = ""
    document.body.innerHTML = ""
    document.title = ""

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver)

    mockGetDetectedCodeFromStorage.mockResolvedValue("eng")
    mockGetLocalConfig.mockResolvedValue(DEFAULT_CONFIG)
    setupMutationTestDefaults()
  })

  it("observes and translates hidden accordion content after it becomes visible", async () => {
    document.body.innerHTML = `
      <section id="accordion" hidden>
        <p id="panel">Accordion body</p>
      </section>
    `

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const accordion = document.getElementById("accordion") as HTMLElement
    const panel = document.getElementById("panel") as HTMLElement

    expect(observer.observe).not.toHaveBeenCalled()

    accordion.removeAttribute("hidden")
    await flushDomUpdates()

    expect(observer.observe).toHaveBeenCalledWith(panel)

    await observer.triggerIntersect(panel)
    await flushDomUpdates()

    expect(mockTranslateWalkedElement).toHaveBeenCalledWith(panel, "walk-id", DEFAULT_CONFIG)

    manager.stop()
  })

  it("observes and translates aria-hidden accordion content after it becomes visible", async () => {
    document.body.innerHTML = `
      <section id="accordion" aria-hidden="true">
        <p id="panel">Accordion body</p>
      </section>
    `

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const accordion = document.getElementById("accordion") as HTMLElement
    const panel = document.getElementById("panel") as HTMLElement

    expect(observer.observe).not.toHaveBeenCalled()

    accordion.setAttribute("aria-hidden", "false")
    await flushDomUpdates()

    expect(observer.observe).toHaveBeenCalledWith(panel)

    await observer.triggerIntersect(panel)
    await flushDomUpdates()

    expect(mockTranslateWalkedElement).toHaveBeenCalledWith(panel, "walk-id", DEFAULT_CONFIG)

    manager.stop()
  })

  it("keeps style/class based re-walk behavior for existing hidden panels", async () => {
    document.body.innerHTML = `
      <section id="accordion" class="closed">
        <p id="panel">Accordion body</p>
      </section>
    `

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const accordion = document.getElementById("accordion") as HTMLElement
    const panel = document.getElementById("panel") as HTMLElement

    expect(observer.observe).not.toHaveBeenCalled()

    accordion.classList.remove("closed")
    await flushDomUpdates()

    expect(observer.observe).toHaveBeenCalledWith(panel)

    await observer.triggerIntersect(panel)
    await flushDomUpdates()

    expect(mockTranslateWalkedElement).toHaveBeenCalledWith(panel, "walk-id", DEFAULT_CONFIG)

    manager.stop()
  })
})

describe("pageTranslationManager smart dynamic mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    intersectionObservers.length = 0

    document.head.innerHTML = ""
    document.body.innerHTML = ""
    document.title = ""

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver)

    mockGetDetectedCodeFromStorage.mockResolvedValue("eng")
    mockGetLocalConfig.mockResolvedValue(buildSmartConfig())
    setupMutationTestDefaults()
  })

  it("observes new paragraph inside smart root", async () => {
    document.body.innerHTML = `
      <article>
        <p id="existing">An existing paragraph that should be translated</p>
      </article>
      <footer>
        <p id="footer">Footer text outside article</p>
      </footer>
    `

    const articleEl = document.querySelector("article") as HTMLElement
    mockDetectSmartContentRoot.mockResolvedValue({
      root: articleEl,
      source: "lightweight",
      confidence: "high",
      debug: { candidates: [{ selector: "article", score: 100, reason: "mock" }] },
    })

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]

    // Existing paragraph inside article should be observed
    const existing = document.getElementById("existing") as HTMLElement
    expect(observer.getTargets()).toContain(existing)

    // Footer outside smart root should not be observed
    const footer = document.getElementById("footer") as HTMLElement
    expect(observer.getTargets()).not.toContain(footer)

    // Dynamically add a new paragraph inside the smart root
    const newP = document.createElement("p")
    newP.id = "new-inside"
    newP.textContent = "New paragraph added dynamically inside article"
    articleEl.appendChild(newP)
    await flushDomUpdates()

    // The new paragraph inside the smart root should be observed
    expect(observer.getTargets()).toContain(newP)

    manager.stop()
  })

  it("does not observe new related block outside smart root", async () => {
    document.body.innerHTML = `
      <article>
        <p id="main-content">Main article content for translation</p>
      </article>
      <div id="sidebar">
        <p id="sidebar-text">Sidebar text outside article</p>
      </div>
    `

    const articleEl = document.querySelector("article") as HTMLElement
    mockDetectSmartContentRoot.mockResolvedValue({
      root: articleEl,
      source: "lightweight",
      confidence: "high",
      debug: { candidates: [{ selector: "article", score: 100, reason: "mock" }] },
    })

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]

    // Main content should be observed
    const mainContent = document.getElementById("main-content") as HTMLElement
    expect(observer.getTargets()).toContain(mainContent)

    // Sidebar should not be observed
    const sidebarText = document.getElementById("sidebar-text") as HTMLElement
    expect(observer.getTargets()).not.toContain(sidebarText)

    // Dynamically add a recommendation block outside the smart root
    const sidebar = document.getElementById("sidebar") as HTMLElement
    const newRelated = document.createElement("p")
    newRelated.id = "new-related"
    newRelated.textContent = "Related article suggestion"
    sidebar.appendChild(newRelated)
    await flushDomUpdates()

    // The new related block outside smart root should NOT be observed
    expect(observer.getTargets()).not.toContain(newRelated)

    manager.stop()
  })

  it("user include forces observation for dynamically added element outside smart root", async () => {
    document.body.innerHTML = `
      <article>
        <p id="inside">Article content inside smart root</p>
      </article>
      <footer>
        <p id="footer-existing">Existing footer text outside article</p>
      </footer>
    `

    const articleEl = document.querySelector("article") as HTMLElement
    mockDetectSmartContentRoot.mockResolvedValue({
      root: articleEl,
      source: "lightweight",
      confidence: "high",
      debug: { candidates: [{ selector: "article", score: 100, reason: "mock" }] },
    })

    // User rule forces include for #user-footer
    mockMatchSmartRulesForElement.mockImplementation((el: Element) => {
      if (el.id === "user-footer" || el.closest("#user-footer")) {
        return { action: "include", matchedRules: [{ action: "include", domainPattern: "*", selector: "#user-footer", line: 1 }] }
      }
      return { action: null, matchedRules: [] }
    })

    // Filter passes everything
    mockShouldTranslateSmartParagraph.mockReturnValue({ shouldTranslate: true, forced: false, reason: "pass" })

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]

    // Existing footer text outside smart root should NOT be observed on startup
    // (container is smart root = article, so external elements are not walked)
    const footerExisting = document.getElementById("footer-existing") as HTMLElement
    expect(observer.getTargets()).not.toContain(footerExisting)

    // Dynamically add a paragraph outside smart root that matches user include rule
    const footer = document.querySelector("footer") as HTMLElement
    const userFooterPara = document.createElement("p")
    userFooterPara.id = "user-footer"
    userFooterPara.textContent = "Dynamically added footer text with user include rule"
    footer.appendChild(userFooterPara)
    await flushDomUpdates()

    // The dynamic addition outside smart root should be observed because user include forces it
    expect(observer.getTargets()).toContain(userFooterPara)

    manager.stop()
  })

  it("user rules apply in all/main range: exclude prevents observation", async () => {
    document.body.innerHTML = `
      <p id="keep">A paragraph to translate</p>
      <p id="skip">A paragraph to skip by user rule</p>
      <p id="also-keep">Another paragraph to translate</p>
    `

    // all range
    const allConfig = {
      ...DEFAULT_CONFIG,
      translate: {
        ...DEFAULT_CONFIG.translate,
        page: {
          ...DEFAULT_CONFIG.translate.page,
          range: "all" as const,
          smart: {
            customRules: "",
            debug: false,
          },
        },
      },
    }
    mockGetLocalConfig.mockResolvedValue(allConfig)

    mockMatchSmartRulesForElement.mockImplementation((el: Element) => {
      if (el.id === "skip" || el.closest("#skip")) {
        return { action: "exclude", matchedRules: [{ action: "exclude", domainPattern: "*", selector: "#skip", line: 1 }] }
      }
      return { action: null, matchedRules: [] }
    })

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const observedIds = observer.getTargets().map(el => el.id)

    expect(observedIds).toContain("keep")
    expect(observedIds).not.toContain("skip")
    expect(observedIds).toContain("also-keep")

    manager.stop()
  })

  it("user rules apply in all/main range: include can force observation", async () => {
    document.body.innerHTML = `
      <p id="normal">A normal paragraph</p>
      <p id="force">A paragraph the user wants included</p>
    `

    // main range
    const mainConfig = {
      ...DEFAULT_CONFIG,
      translate: {
        ...DEFAULT_CONFIG.translate,
        page: {
          ...DEFAULT_CONFIG.translate.page,
          range: "main" as const,
          smart: {
            customRules: "",
            debug: false,
          },
        },
      },
    }
    mockGetLocalConfig.mockResolvedValue(mainConfig)

    mockMatchSmartRulesForElement.mockReturnValue({ action: null, matchedRules: [] })

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const observedIds = observer.getTargets().map(el => el.id)

    // In main/all mode without smart filtering, all paragraphs should be observed
    expect(observedIds).toContain("normal")
    expect(observedIds).toContain("force")

    manager.stop()
  })
})
