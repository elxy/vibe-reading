// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { PageTranslationManager } from "../page-translation"

const {
  mockDeepQueryTopLevelSelector,
  mockGetDetectedCodeFromStorage,
  mockGetLocalConfig,
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
  getRandomUUID: () => "smart-walk-id",
}))

vi.mock("@/utils/host/dom/filter", () => ({
  hasNoWalkAncestor: vi.fn().mockReturnValue(false),
  isDontWalkIntoAndDontTranslateAsChildElement: vi.fn().mockReturnValue(false),
  isDontWalkIntoButTranslateAsChildElement: vi.fn().mockReturnValue(false),
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

function mockPassingFilter(): void {
  mockShouldTranslateSmartParagraph.mockReturnValue({
    shouldTranslate: true,
    forced: false,
    reason: "long-text",
  })
}

function labelAllPTagsAsParagraphs(container: HTMLElement, walkId: string): void {
  container.setAttribute("data-vibe-reading-walked", walkId)
  const paragraphs = container.querySelectorAll("p, h1, h2, h3, .comment")
  for (const el of paragraphs) {
    el.setAttribute("data-vibe-reading-walked", walkId)
    el.setAttribute("data-vibe-reading-paragraph", "")
  }
}

describe("pageTranslationManager smart mode", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    intersectionObservers.length = 0

    document.head.innerHTML = ""
    document.body.innerHTML = ""
    document.title = "Test Page"

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver)

    mockGetDetectedCodeFromStorage.mockResolvedValue("eng")
    mockGetLocalConfig.mockResolvedValue(buildSmartConfig())
    mockDeepQueryTopLevelSelector.mockReturnValue([])
    mockValidateTranslationConfigAndToast.mockReturnValue(true)
    mockSendMessage.mockResolvedValue(undefined)
    mockWalkAndLabelElement.mockImplementation((element: HTMLElement, walkId: string) => {
      labelAllPTagsAsParagraphs(element, walkId)
      return { forceBlock: false, isInlineNode: false }
    })
    mockParseSmartRules.mockReturnValue({ rules: [], errors: [] })
    mockMatchSmartRulesForElement.mockReturnValue({ action: null, matchedRules: [] })
    mockPassingFilter()
  })

  it("observes long article paragraphs in smart mode", async () => {
    document.body.innerHTML = `
      <article>
        <p id="p1">Long paragraph with substantial content for translation purposes</p>
        <p id="p2">Another long paragraph that should definitely be translated</p>
        <p id="p3">A third paragraph with enough meaningful text to warrant translation</p>
      </article>
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
    const observedIds = observer.getTargets().map(el => el.id)

    expect(observedIds).toContain("p1")
    expect(observedIds).toContain("p2")
    expect(observedIds).toContain("p3")

    manager.stop()
  })

  it("does not observe TOC, related, or button/control candidates in smart mode", async () => {
    document.body.innerHTML = `
      <article>
        <p id="good">A real paragraph to translate</p>
        <div class="toc">
          <p id="toc-item">Table of contents item</p>
        </div>
        <div class="related">
          <p id="related-item">Related article link</p>
        </div>
        <button id="action-btn">Translate</button>
      </article>
    `

    const articleEl = document.querySelector("article") as HTMLElement
    mockDetectSmartContentRoot.mockResolvedValue({
      root: articleEl,
      source: "lightweight",
      confidence: "high",
      debug: { candidates: [{ selector: "article", score: 100, reason: "mock" }] },
    })

    // Good paragraph passes, TOC/related/button skip
    mockShouldTranslateSmartParagraph.mockImplementation((el: HTMLElement) => {
      if (el.closest(".toc, .related") || el.tagName === "BUTTON") {
        return { shouldTranslate: false, forced: false, reason: "mock-skip" }
      }
      return { shouldTranslate: true, forced: false, reason: "long-text" }
    })

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const observedIds = observer.getTargets().map(el => el.id)

    expect(observedIds).toContain("good")
    expect(observedIds).not.toContain("toc-item")
    expect(observedIds).not.toContain("related-item")
    expect(observedIds).not.toContain("action-btn")

    manager.stop()
  })

  it("observes H1 even if short in smart mode", async () => {
    document.body.innerHTML = `
      <article>
        <h1 id="main-heading">Title</h1>
        <p id="content">A longer paragraph with enough text to be translated properly</p>
      </article>
    `

    const articleEl = document.querySelector("article") as HTMLElement
    mockDetectSmartContentRoot.mockResolvedValue({
      root: articleEl,
      source: "lightweight",
      confidence: "high",
      debug: { candidates: [{ selector: "article", score: 100, reason: "mock" }] },
    })

    // H1 should pass even though short
    mockShouldTranslateSmartParagraph.mockReturnValue({ shouldTranslate: true, forced: false, reason: "short-heading-exception" })

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const observedIds = observer.getTargets().map(el => el.id)

    expect(observedIds).toContain("main-heading")
    expect(observedIds).toContain("content")

    manager.stop()
  })

  it("observes comments even if short and visible in smart mode", async () => {
    document.body.innerHTML = `
      <article>
        <p id="article-text">Some article content to translate</p>
        <div id="comments-section" class="comments">
          <p id="comment1" class="comment">Nice article!</p>
          <p id="comment2" class="comment">👍</p>
        </div>
      </article>
    `

    const articleEl = document.querySelector("article") as HTMLElement
    mockDetectSmartContentRoot.mockResolvedValue({
      root: articleEl,
      source: "lightweight",
      confidence: "high",
      debug: { candidates: [{ selector: "article", score: 100, reason: "mock" }] },
    })

    // Comments pass, others pass too
    mockShouldTranslateSmartParagraph.mockReturnValue({ shouldTranslate: true, forced: false, reason: "comment" })

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const observedIds = observer.getTargets().map(el => el.id)

    expect(observedIds).toContain("comment1")
    expect(observedIds).toContain("comment2")
    expect(observedIds).toContain("article-text")

    manager.stop()
  })

  it("accepts body root and still filters paragraphs in smart mode", async () => {
    document.body.innerHTML = `
      <p id="good">A valid paragraph for translation purposes with enough content</p>
      <p id="short">Hi</p>
      <div class="toc">
        <p id="toc-item">Navigation link</p>
      </div>
    `

    mockDetectSmartContentRoot.mockResolvedValue({
      root: document.body,
      source: "body",
      confidence: "low",
      debug: { candidates: [] },
    })

    // Good passes, short and TOC skip
    mockShouldTranslateSmartParagraph.mockImplementation((el: HTMLElement) => {
      if (el.closest(".toc, .related") || el.tagName === "BUTTON") {
        return { shouldTranslate: false, forced: false, reason: "mock-skip" }
      }
      if ((el.textContent?.length ?? 0) < 10) {
        return { shouldTranslate: false, forced: false, reason: "short-text" }
      }
      return { shouldTranslate: true, forced: false, reason: "long-text" }
    })

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const observedIds = observer.getTargets().map(el => el.id)

    expect(observedIds).toContain("good")
    expect(observedIds).not.toContain("short")
    expect(observedIds).not.toContain("toc-item")

    manager.stop()
  })

  it("falls back to main behavior when detector fails and logs debug when enabled", async () => {
    document.body.innerHTML = `
      <p id="p1">A paragraph to translate on the page</p>
      <p id="p2">Another paragraph to translate</p>
    `

    const { logger } = await import("@/utils/logger")

    mockGetLocalConfig.mockResolvedValue(buildSmartConfig({ debug: true }))
    mockDetectSmartContentRoot.mockRejectedValue(new Error("detection timeout"))

    // In main fallback mode, all paragraphs pass
    mockShouldTranslateSmartParagraph.mockReturnValue({ shouldTranslate: true, forced: false, reason: "pass" })

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const observedIds = observer.getTargets().map(el => el.id)

    // Should fall back to body, so all paragraphs are observed
    expect(observedIds).toContain("p1")
    expect(observedIds).toContain("p2")

    // Debug logging should have been triggered
    expect(logger.info).toHaveBeenCalledWith(
      "[smart] detection failed, falling back to main behavior:",
      expect.any(Error),
    )

    manager.stop()
  })

  it("uses smart fallback thresholds when user thresholds are zero", async () => {
    document.body.innerHTML = `
      <article>
        <p id="long">A proper paragraph with sufficient textual content for translation</p>
        <p id="medium">Medium length paragraph that should also be translated properly</p>
      </article>
    `

    const articleEl = document.querySelector("article") as HTMLElement
    mockDetectSmartContentRoot.mockResolvedValue({
      root: articleEl,
      source: "lightweight",
      confidence: "high",
      debug: { candidates: [{ selector: "article", score: 100, reason: "mock" }] },
    })

    // Config with minCharactersPerNode = 0, minWordsPerNode = 0
    const zeroThresholdsConfig = buildSmartConfig()
    zeroThresholdsConfig.translate.page.minCharactersPerNode = 0
    zeroThresholdsConfig.translate.page.minWordsPerNode = 0
    mockGetLocalConfig.mockResolvedValue(zeroThresholdsConfig)

    // Mock filter to check what thresholds it receives
    mockShouldTranslateSmartParagraph.mockImplementation((_el, options) => {
      // Verify smart fallback thresholds are used
      expect(options.minCharacters).toBe(40)
      expect(options.minWords).toBe(8)
      return { shouldTranslate: true, forced: false, reason: "long-text" }
    })

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    expect(mockShouldTranslateSmartParagraph).toHaveBeenCalled()

    manager.stop()
  })

  it("user include forces observation in smart mode even for elements that would be filtered", async () => {
    document.body.innerHTML = `
      <article>
        <p id="short">Hi</p>
        <p id="long">A long enough paragraph to be translated normally</p>
      </article>
    `

    const articleEl = document.querySelector("article") as HTMLElement
    mockDetectSmartContentRoot.mockResolvedValue({
      root: articleEl,
      source: "lightweight",
      confidence: "high",
      debug: { candidates: [{ selector: "article", score: 100, reason: "mock" }] },
    })

    // Filter would normally skip short text
    mockShouldTranslateSmartParagraph.mockImplementation((el: HTMLElement) => {
      if ((el.textContent?.length ?? 0) < 10) {
        return { shouldTranslate: false, forced: false, reason: "short-text" }
      }
      return { shouldTranslate: true, forced: false, reason: "long-text" }
    })

    // But user include overrides for #short
    mockMatchSmartRulesForElement.mockImplementation((el: Element) => {
      if (el.id === "short") {
        return { action: "include", matchedRules: [{ action: "include", domainPattern: "*", selector: "#short", line: 1 }] }
      }
      return { action: null, matchedRules: [] }
    })

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const observedIds = observer.getTargets().map(el => el.id)

    expect(observedIds).toContain("short")
    expect(observedIds).toContain("long")

    manager.stop()
  })

  it("user exclude prevents observation in smart mode even for elements that would pass filtering", async () => {
    document.body.innerHTML = `
      <article>
        <p id="excluded">A long paragraph that would normally pass but is excluded by user rule</p>
        <p id="included">Another paragraph to translate</p>
      </article>
    `

    const articleEl = document.querySelector("article") as HTMLElement
    mockDetectSmartContentRoot.mockResolvedValue({
      root: articleEl,
      source: "lightweight",
      confidence: "high",
      debug: { candidates: [{ selector: "article", score: 100, reason: "mock" }] },
    })

    mockShouldTranslateSmartParagraph.mockReturnValue({ shouldTranslate: true, forced: false, reason: "long-text" })

    mockMatchSmartRulesForElement.mockImplementation((el: Element) => {
      if (el.id === "excluded") {
        return { action: "exclude", matchedRules: [{ action: "exclude", domainPattern: "*", selector: "#excluded", line: 1 }] }
      }
      return { action: null, matchedRules: [] }
    })

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const observedIds = observer.getTargets().map(el => el.id)

    expect(observedIds).not.toContain("excluded")
    expect(observedIds).toContain("included")

    manager.stop()
  })
})
