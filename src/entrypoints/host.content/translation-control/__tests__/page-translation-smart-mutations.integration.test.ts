// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { PageTranslationManager } from "../page-translation"

// ─── Mock defuddle (throws in test environment) ────────────────────────────
vi.mock("defuddle/full", () => ({
  __esModule: true,
  default: class {
    parse() {
      throw new Error("defuddle not available in test")
    }
  },
}))

// ─── Mock logger ────────────────────────────────────────────────────────────
vi.mock("@/utils/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

// ─── Hoisted mocks for infrastructure dependencies ─────────────────────────
// detectSmartContentRoot is mocked here to reliably track call count.
// All other smart modules (paragraph-filter, user-rules) use real implementations.
const {
  mockDetectSmartContentRoot,
  mockGetLocalConfig,
  mockDeepQueryTopLevelSelector,
  mockWalkAndLabelElement,
  mockRemoveAllTranslatedWrapperNodes,
  mockTranslateWalkedElement,
  mockValidateTranslationConfigAndToast,
  mockSendMessage,
} = vi.hoisted(() => ({
  mockDetectSmartContentRoot: vi.fn(),
  mockGetLocalConfig: vi.fn(),
  mockDeepQueryTopLevelSelector: vi.fn(),
  mockWalkAndLabelElement: vi.fn(),
  mockRemoveAllTranslatedWrapperNodes: vi.fn(),
  mockTranslateWalkedElement: vi.fn(),
  mockValidateTranslationConfigAndToast: vi.fn(),
  mockSendMessage: vi.fn(),
}))

vi.mock("@/utils/config/languages", () => ({
  getDetectedCodeFromStorage: vi.fn().mockResolvedValue("eng"),
}))

vi.mock("@/utils/config/storage", () => ({
  getLocalConfig: mockGetLocalConfig,
}))

vi.mock("@/utils/crypto-polyfill", () => ({
  getRandomUUID: () => "mut-int-walk-id",
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

vi.mock("@/utils/host/translate/translate-text", () => ({
  validateTranslationConfigAndToast: mockValidateTranslationConfigAndToast,
}))

vi.mock("@/utils/message", () => ({
  sendMessage: mockSendMessage,
}))

// ─── Mock IntersectionObserver ──────────────────────────────────────────────

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
    _callback: IntersectionObserverCallback,
    _options?: IntersectionObserverInit,
  ) {
    intersectionObservers.push(this)
  }

  getTargets(): Element[] {
    return [...this.targets]
  }
}

// ─── Test helpers ───────────────────────────────────────────────────────────

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
        range: "smart" as const,
        smart: {
          customRules: "",
          debug: false,
          ...overrides as Record<string, unknown>,
        },
      },
    },
  }
}

/**
 * Walk implementation that sets data attributes so that
 * collectParagraphElementsDeep can find paragraph candidates.
 *
 * Mirrors the helper used in page-translation-smart-integration.test.ts.
 */
function labelParagraphElements(element: HTMLElement, walkId: string): void {
  // Mark the container as walked
  element.setAttribute("data-vibe-reading-walked", walkId)

  // Collect element itself and all descendants
  const allElements: HTMLElement[] = [element]
  element.querySelectorAll("*").forEach(el => allElements.push(el as HTMLElement))

  // Mark all elements as walked
  for (const el of allElements) {
    el.setAttribute("data-vibe-reading-walked", walkId)
  }

  // Mark paragraph/heading elements
  const paragraphTags = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6"])
  for (const el of allElements) {
    if (paragraphTags.has(el.tagName)) {
      el.setAttribute("data-vibe-reading-paragraph", "")
    }
  }
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("pageTranslationManager smart dynamic mutation integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    intersectionObservers.length = 0

    document.head.innerHTML = ""
    document.body.innerHTML = ""
    document.title = "Smart Mutation Integration Test"

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver)

    mockGetLocalConfig.mockResolvedValue(buildSmartConfig())
    mockDeepQueryTopLevelSelector.mockReturnValue([])
    mockValidateTranslationConfigAndToast.mockReturnValue(true)
    mockSendMessage.mockResolvedValue(undefined)
    mockRemoveAllTranslatedWrapperNodes.mockResolvedValue(undefined)
    mockTranslateWalkedElement.mockResolvedValue(undefined)
    mockWalkAndLabelElement.mockImplementation(
      (element: HTMLElement, walkId: string) => {
        labelParagraphElements(element, walkId)
        return { forceBlock: false, isInlineNode: false }
      },
    )
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Full scenario: detector once, mutations use filter only
  // ═══════════════════════════════════════════════════════════════════════════
  it("calls detector exactly once during start and not again after mutations (scenarios 1–2, 11)", async () => {
    // ── Arrange ────────────────────────────────────────────────────────
    document.body.innerHTML = `
      <article>
        <p id="p1">A long paragraph with sufficient text content for translation purposes in this article.</p>
        <p id="p2">Another paragraph with enough meaningful text to warrant translation by the filter.</p>
      </article>
    `

    const articleEl = document.querySelector("article") as HTMLElement
    mockDetectSmartContentRoot.mockResolvedValue({
      root: articleEl,
      source: "lightweight" as const,
      confidence: "high" as const,
      debug: { candidates: [{ selector: "article", score: 100, reason: "mock" }] },
    })

    // ── Act: start ──────────────────────────────────────────────────────
    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    // ── Assert: detector called once ────────────────────────────────────
    expect(mockDetectSmartContentRoot).toHaveBeenCalledTimes(1)

    // Existing paragraphs inside article should be observed
    const observer = intersectionObservers[0]
    const initialIds = observer.getTargets().map(el => (el as HTMLElement).id)
    expect(initialIds).toContain("p1")
    expect(initialIds).toContain("p2")

    // ── Act: add a new long paragraph inside article root (scenario 3) ──
    const newP = document.createElement("p")
    newP.id = "new-long"
    newP.textContent = "This is a dynamically added paragraph with substantial text content that should pass the word and character thresholds for smart translation filtering."
    articleEl.appendChild(newP)
    await flushDomUpdates()

    // ── Assert: new paragraph observed (scenario 4) ─────────────────────
    const afterAddIds = observer.getTargets().map(el => (el as HTMLElement).id)
    expect(afterAddIds).toContain("new-long")

    // ── Assert: detector was NOT called again after mutations ───────────
    expect(mockDetectSmartContentRoot).toHaveBeenCalledTimes(1)

    manager.stop()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 5–6: related/recommended block inside root is not observed
  // ═══════════════════════════════════════════════════════════════════════════
  it("does not observe a related/recommended block added inside smart root (scenarios 5–6)", async () => {
    // ── Arrange ────────────────────────────────────────────────────────
    document.body.innerHTML = `
      <article>
        <p id="main-text">Main article content that is long enough to pass translation filtering thresholds properly.</p>
      </article>
    `

    const articleEl = document.querySelector("article") as HTMLElement
    mockDetectSmartContentRoot.mockResolvedValue({
      root: articleEl,
      source: "lightweight" as const,
      confidence: "high" as const,
      debug: { candidates: [{ selector: "article", score: 100, reason: "mock" }] },
    })

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]

    // Main text should be initially observed
    expect(observer.getTargets().map(el => (el as HTMLElement).id)).toContain("main-text")

    // ── Act: add a related block inside the article root ────────────────
    const relatedDiv = document.createElement("div")
    relatedDiv.className = "related"
    const relatedPara = document.createElement("p")
    relatedPara.id = "related-item"
    relatedPara.textContent = "Related article suggestion with enough text to pass simple length checks"
    relatedDiv.appendChild(relatedPara)
    articleEl.appendChild(relatedDiv)
    await flushDomUpdates()

    // ── Assert: related paragraph NOT observed ──────────────────────────
    // Real paragraph-filter detects ancestor class="related" → recommendation reason
    const observedIds = observer.getTargets().map(el => (el as HTMLElement).id)
    expect(observedIds).not.toContain("related-item")

    manager.stop()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 7–8: short paragraph outside root without user include is not observed
  // ═══════════════════════════════════════════════════════════════════════════
  it("does not observe a short paragraph added outside smart root without user include (scenarios 7–8)", async () => {
    // ── Arrange ────────────────────────────────────────────────────────
    document.body.innerHTML = `
      <article>
        <p id="article-text">Article content that is long enough to pass the translation filtering thresholds for smart mode.</p>
      </article>
      <footer></footer>
    `

    const articleEl = document.querySelector("article") as HTMLElement
    mockDetectSmartContentRoot.mockResolvedValue({
      root: articleEl,
      source: "lightweight" as const,
      confidence: "high" as const,
      debug: { candidates: [{ selector: "article", score: 100, reason: "mock" }] },
    })

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const footer = document.querySelector("footer")!

    // ── Act: add a short paragraph outside the article root ─────────────
    const shortP = document.createElement("p")
    shortP.id = "short-outside"
    shortP.textContent = "Hi"
    footer.appendChild(shortP)
    await flushDomUpdates()

    // ── Assert: short paragraph outside root NOT observed ───────────────
    // Mutation handler: outside smart root + no user include → returns early
    const observedIds = observer.getTargets().map(el => (el as HTMLElement).id)
    expect(observedIds).not.toContain("short-outside")

    manager.stop()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 9–10: short paragraph outside root with user include is observed
  // ═══════════════════════════════════════════════════════════════════════════
  it("observes a short paragraph outside smart root when matching user include rule (scenarios 9–10)", async () => {
    // ── Arrange ────────────────────────────────────────────────────────
    document.body.innerHTML = `
      <article>
        <p id="article-text">Article content that is long enough to pass the translation filtering thresholds for smart mode.</p>
      </article>
      <footer></footer>
    `

    const articleEl = document.querySelector("article") as HTMLElement
    mockDetectSmartContentRoot.mockResolvedValue({
      root: articleEl,
      source: "lightweight" as const,
      confidence: "high" as const,
      debug: { candidates: [{ selector: "article", score: 100, reason: "mock" }] },
    })

    // User include rule: force observation of #user-footer
    mockGetLocalConfig.mockResolvedValue(
      buildSmartConfig({ customRules: "* #user-footer" }),
    )

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const footer = document.querySelector("footer")!

    // ── Act: add a short paragraph outside root with matching user include ──
    const userPara = document.createElement("p")
    userPara.id = "user-footer"
    userPara.textContent = "Short"
    footer.appendChild(userPara)
    await flushDomUpdates()

    // ── Assert: observed despite outside root + short text ──────────────
    // Mutation handler: outside smart root but user-include → proceeds
    // shouldObserveCandidate: user-include → returns true (bypasses filter)
    const observedIds = observer.getTargets().map(el => (el as HTMLElement).id)
    expect(observedIds).toContain("user-footer")

    // Detector still only called once
    expect(mockDetectSmartContentRoot).toHaveBeenCalledTimes(1)

    manager.stop()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Boundary: recommended block outside root is not observed
  // ═══════════════════════════════════════════════════════════════════════════
  it("does not observe a recommended block added outside smart root without user include", async () => {
    // ── Arrange ────────────────────────────────────────────────────────
    document.body.innerHTML = `
      <article>
        <p id="article-text">Article content with enough meaningful text to pass the smart translation filter thresholds.</p>
      </article>
      <aside id="sidebar"></aside>
    `

    const articleEl = document.querySelector("article") as HTMLElement
    mockDetectSmartContentRoot.mockResolvedValue({
      root: articleEl,
      source: "lightweight" as const,
      confidence: "high" as const,
      debug: { candidates: [{ selector: "article", score: 100, reason: "mock" }] },
    })

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const sidebar = document.getElementById("sidebar")!

    // ── Act: add a recommended block outside the article ────────────────
    const recDiv = document.createElement("div")
    recDiv.className = "recommended"
    const recPara = document.createElement("p")
    recPara.id = "recommended-outside"
    recPara.textContent = "Recommended for you with substantial text content"
    recDiv.appendChild(recPara)
    sidebar.appendChild(recDiv)
    await flushDomUpdates()

    // ── Assert: not observed (outside smart root, no user include) ──────
    const observedIds = observer.getTargets().map(el => (el as HTMLElement).id)
    expect(observedIds).not.toContain("recommended-outside")

    manager.stop()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Regression: user include forces observation regardless of paragraph filter
  // ═══════════════════════════════════════════════════════════════════════════
  it("user include forces observation for short text inside smart root that would be filtered", async () => {
    // ── Arrange ────────────────────────────────────────────────────────
    document.body.innerHTML = `
      <article>
        <p id="long-one">A long enough paragraph with adequate textual content for translation purposes.</p>
        <p id="short-force" class="force-include">Hi</p>
      </article>
    `

    const articleEl = document.querySelector("article") as HTMLElement
    mockDetectSmartContentRoot.mockResolvedValue({
      root: articleEl,
      source: "lightweight" as const,
      confidence: "high" as const,
      debug: { candidates: [{ selector: "article", score: 100, reason: "mock" }] },
    })

    // User include forces observation for .force-include elements
    mockGetLocalConfig.mockResolvedValue(
      buildSmartConfig({ customRules: "* .force-include" }),
    )

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]
    const observedIds = observer.getTargets().map(el => (el as HTMLElement).id)

    // Long paragraph should pass filter normally
    expect(observedIds).toContain("long-one")

    // Short paragraph should be observed due to user include (bypasses filter)
    expect(observedIds).toContain("short-force")

    manager.stop()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Regression: user exclude prevents observation for dynamically added content
  // ═══════════════════════════════════════════════════════════════════════════
  it("user exclude prevents observation for dynamically added paragraph inside smart root", async () => {
    // ── Arrange ────────────────────────────────────────────────────────
    document.body.innerHTML = `
      <article>
        <p id="keep-me">A paragraph that should remain observed with adequate text content for translation.</p>
      </article>
    `

    const articleEl = document.querySelector("article") as HTMLElement
    mockDetectSmartContentRoot.mockResolvedValue({
      root: articleEl,
      source: "lightweight" as const,
      confidence: "high" as const,
      debug: { candidates: [{ selector: "article", score: 100, reason: "mock" }] },
    })

    // User exclude rule for .skip-dynamic
    mockGetLocalConfig.mockResolvedValue(
      buildSmartConfig({ customRules: "!* .skip-dynamic" }),
    )

    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    const observer = intersectionObservers[0]

    // ── Act: dynamically add a wrapper with excluded paragraph inside root ──
    // Wrapped in a div so observeTopLevelParagraphs doesn't short-circuit
    // on the container-being-a-paragraph path and reaches shouldObserveCandidate.
    const wrapper = document.createElement("div")
    const excludedP = document.createElement("p")
    excludedP.id = "skip-me"
    excludedP.className = "skip-dynamic"
    excludedP.textContent = "This has plenty of text content and would normally pass all translation filters but the user wants to exclude it specifically."
    wrapper.appendChild(excludedP)
    articleEl.appendChild(wrapper)
    await flushDomUpdates()

    // ── Assert: excluded paragraph NOT observed ────────────────────────
    const observedIds = observer.getTargets().map(el => (el as HTMLElement).id)
    expect(observedIds).toContain("keep-me")
    expect(observedIds).not.toContain("skip-me")

    manager.stop()
  })
})
