// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { PageTranslationManager } from "../page-translation"

// ─── Mock defuddle (throws in test, as in detector-filter.integration.test.ts) ──
vi.mock("defuddle/full", () => ({
  __esModule: true,
  default: class {
    parse() {
      throw new Error("defuddle not available in test")
    }
  },
}))

// ─── Mock logger ─────────────────────────────────────────────────────────────
vi.mock("@/utils/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

// ─── Hoisted mocks for infrastructure dependencies ──────────────────────────
const {
  mockGetDetectedCodeFromStorage,
  mockGetLocalConfig,
  mockDeepQueryTopLevelSelector,
  mockWalkAndLabelElement,
  mockRemoveAllTranslatedWrapperNodes,
  mockTranslateWalkedElement,
  mockValidateTranslationConfigAndToast,
  mockSendMessage,
} = vi.hoisted(() => ({
  mockGetDetectedCodeFromStorage: vi.fn(),
  mockGetLocalConfig: vi.fn(),
  mockDeepQueryTopLevelSelector: vi.fn(),
  mockWalkAndLabelElement: vi.fn(),
  mockRemoveAllTranslatedWrapperNodes: vi.fn(),
  mockTranslateWalkedElement: vi.fn(),
  mockValidateTranslationConfigAndToast: vi.fn(),
  mockSendMessage: vi.fn(),
}))

vi.mock("@/utils/config/languages", () => ({
  getDetectedCodeFromStorage: mockGetDetectedCodeFromStorage,
}))

vi.mock("@/utils/config/storage", () => ({
  getLocalConfig: mockGetLocalConfig,
}))

vi.mock("@/utils/crypto-polyfill", () => ({
  getRandomUUID: () => "integration-walk-id",
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
    private readonly callback: IntersectionObserverCallback,
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

function buildAllConfig(customRules: string): typeof DEFAULT_CONFIG {
  return {
    ...DEFAULT_CONFIG,
    translate: {
      ...DEFAULT_CONFIG.translate,
      page: {
        ...DEFAULT_CONFIG.translate.page,
        range: "all",
        smart: {
          customRules,
          debug: false,
        },
      },
    },
  }
}

/**
 * Walk implementation that sets data attributes so that
 * collectParagraphElementsDeep can find paragraph candidates.
 *
 * Only direct paragraph/heading elements are marked as paragraphs
 * (not container divs), to avoid nesting issues in topLevelParagraphs filtering.
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

  // Mark paragraph/heading elements (including the container itself if applicable)
  const paragraphTags = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6"])
  for (const el of allElements) {
    if (paragraphTags.has(el.tagName)) {
      el.setAttribute("data-vibe-reading-paragraph", "")
    }
  }
}

// ─── Setup ──────────────────────────────────────────────────────────────────
// Note: Vitest's jsdom environment sets window.location.hostname to "localhost".
// We use "*" domain wildcard in user rules to avoid hostname mismatch.

describe("pageTranslationManager smart integration", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    intersectionObservers.length = 0

    document.head.innerHTML = ""
    document.body.innerHTML = ""
    document.title = "Integration Test Page"

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver)

    mockGetDetectedCodeFromStorage.mockResolvedValue("eng")
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
  // Scenario 1: Smart article page
  // ═══════════════════════════════════════════════════════════════════════════
  describe("scenario 1: smart article page", () => {
    it("observes h1 and long paragraph, but not TOC, related, or footer candidates", async () => {
      // ── Arrange ────────────────────────────────────────────────────────
      document.body.innerHTML = `
        <nav>Site Navigation</nav>
        <article>
          <h1 id="article-title">Smart Article Title</h1>
          <p id="long-paragraph">This is a long paragraph with substantial text content that should clearly pass the word and character count thresholds for smart translation.</p>
          <div class="toc">
            <p id="toc-item">Table of Contents Link</p>
          </div>
          <section class="related">
            <p id="related-item">Related article recommendation</p>
          </section>
        </article>
        <footer>
          <p id="footer-text">Footer copyright information</p>
        </footer>
      `

      mockGetLocalConfig.mockResolvedValue(buildSmartConfig())

      // ── Act ────────────────────────────────────────────────────────────
      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      // ── Assert ─────────────────────────────────────────────────────────
      const observer = intersectionObservers[0]
      expect(observer).toBeDefined()

      const observedIds = observer.getTargets().map(el => (el as HTMLElement).id)

      // Article heading and content should be observed
      expect(observedIds).toContain("article-title")
      expect(observedIds).toContain("long-paragraph")

      // TOC item filter out (paragraph-filter → toc reason)
      expect(observedIds).not.toContain("toc-item")

      // Related item filter out (paragraph-filter → recommendation reason)
      expect(observedIds).not.toContain("related-item")

      // Footer is outside the detected <article> root and thus not walked
      expect(observedIds).not.toContain("footer-text")

      manager.stop()
    })

    it("detector selects article as the content root (not nav/footer)", async () => {
      // ── Arrange ────────────────────────────────────────────────────────
      document.body.innerHTML = `
        <nav>Site Navigation</nav>
        <article>
          <h1>Title</h1>
          <p>Long paragraph with enough text content to score well in the smart content detector. This paragraph has many words so the detector sees this as a content-rich area.</p>
          <p>Another paragraph with substantial content for scoring purposes. The more paragraphs the article has the higher the score.</p>
        </article>
        <footer>Footer</footer>
      `

      mockGetLocalConfig.mockResolvedValue(buildSmartConfig())

      // ── Act ────────────────────────────────────────────────────────────
      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      // ── Assert ─────────────────────────────────────────────────────────
      // The smart context root should be the article element (not body)
      // We can verify this indirectly: footer elements should NOT be observed
      // (they're outside the article root)
      const observer = intersectionObservers[0]
      const observedTags = observer.getTargets().map(el => el.tagName)

      // All observed elements should be inside <article>
      expect(observedTags).not.toContain("NAV")
      expect(observedTags).not.toContain("FOOTER")

      // The article's content should be observed
      const observedIds = observer.getTargets().map(el => (el as HTMLElement).id)
      // At least one paragraph observed
      expect(observedIds.length).toBeGreaterThan(0)

      manager.stop()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 2: User exclude applies globally (all range)
  // ═══════════════════════════════════════════════════════════════════════════
  describe("scenario 2: user exclude applies globally", () => {
    it("does not observe a .skip-me paragraph when user exclude rule is configured in all range", async () => {
      // ── Arrange ────────────────────────────────────────────────────────
      document.body.innerHTML = `
        <p id="normal-para">This is a normal paragraph that should be translated when the user browses the page.</p>
        <p id="skip-me" class="skip-me">This is a long paragraph that would normally pass filtering but the user wants to exclude it.</p>
        <p id="also-keep">Another normal paragraph with enough content that should be translated as expected.</p>
      `

      // Use "*" wildcard domain so the rule matches regardless of jsdom hostname
      mockGetLocalConfig.mockResolvedValue(buildAllConfig("!* .skip-me"))

      // ── Act ────────────────────────────────────────────────────────────
      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      // ── Assert ─────────────────────────────────────────────────────────
      const observer = intersectionObservers[0]
      const observedIds = observer.getTargets().map(el => (el as HTMLElement).id)

      // Normal paragraphs observed
      expect(observedIds).toContain("normal-para")
      expect(observedIds).toContain("also-keep")

      // .skip-me paragraph excluded by user rule
      expect(observedIds).not.toContain("skip-me")

      manager.stop()
    })

    it("user exclude prevents observation even for content that passes all filters in all range", async () => {
      // ── Arrange ────────────────────────────────────────────────────────
      document.body.innerHTML = `
        <p id="keep">Keep this translation candidate with substantial content that passes all checks.</p>
        <p id="excluded" class="exclude-this">This has plenty of text and would normally be translated but the user rule excludes it.</p>
      `

      mockGetLocalConfig.mockResolvedValue(buildAllConfig("!* .exclude-this"))

      // ── Act ────────────────────────────────────────────────────────────
      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      // ── Assert ─────────────────────────────────────────────────────────
      const observer = intersectionObservers[0]
      const observedIds = observer.getTargets().map(el => (el as HTMLElement).id)

      expect(observedIds).toContain("keep")
      expect(observedIds).not.toContain("excluded")

      manager.stop()
    })

    it("user rule parse errors do not prevent normal translation in all range", async () => {
      // ── Arrange ────────────────────────────────────────────────────────
      document.body.innerHTML = `
        <p id="normal">Normal paragraph content for translation purposes.</p>
      `

      // Invalid rule (missing selector) should produce parse error but not crash
      mockGetLocalConfig.mockResolvedValue(buildAllConfig("!*"))

      // ── Act ────────────────────────────────────────────────────────────
      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      // ── Assert ─────────────────────────────────────────────────────────
      const observer = intersectionObservers[0]
      const observedIds = observer.getTargets().map(el => (el as HTMLElement).id)

      // Should still observe elements despite parse errors
      expect(observedIds).toContain("normal")

      manager.stop()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 3: User include forces observation
  // ═══════════════════════════════════════════════════════════════════════════
  describe("scenario 3: user include forces observation", () => {
    it("observes a short .force-me paragraph outside smart root when user include rule is configured", async () => {
      // ── Arrange ────────────────────────────────────────────────────────
      document.body.innerHTML = `
        <article>
          <p id="article-content">This is a long paragraph inside the article with substantial content for translation purposes.</p>
        </article>
        <footer>
          <p id="footer-existing">Existing footer text that is outside the smart root.</p>
        </footer>
      `

      mockGetLocalConfig.mockResolvedValue(
        buildSmartConfig({ customRules: "* .force-me", debug: false }),
      )

      // ── Act ────────────────────────────────────────────────────────────
      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      // ── Assert: initial state ─────────────────────────────────────────
      const observer = intersectionObservers[0]

      // Article content should be observed (inside smart root)
      const observedIds = observer.getTargets().map(el => (el as HTMLElement).id)
      expect(observedIds).toContain("article-content")

      // Footer existing is outside smart root → not walked at startup
      expect(observedIds).not.toContain("footer-existing")

      // Now dynamically add a .force-me element outside the smart root
      const footer = document.querySelector("footer") as HTMLElement
      const forcedPara = document.createElement("p")
      forcedPara.id = "force-me"
      forcedPara.className = "force-me"
      forcedPara.textContent = "Short"
      footer.appendChild(forcedPara)
      await flushDomUpdates()

      // ── Assert: after dynamic addition ────────────────────────────────
      // The user-include rule should force observation even outside smart root
      const updatedIds = observer.getTargets().map(el => (el as HTMLElement).id)
      expect(updatedIds).toContain("force-me")

      manager.stop()
    })

    it("user include forces observation for short text that would normally fail paragraph filter", async () => {
      // ── Arrange ────────────────────────────────────────────────────────
      document.body.innerHTML = `
        <article>
          <p id="force-short" class="force-include">Hi</p>
          <p id="normal-long">A normal long paragraph with enough text to pass translation filters.</p>
        </article>
      `

      mockGetLocalConfig.mockResolvedValue(
        buildSmartConfig({ customRules: "* .force-include" }),
      )

      // ── Act ────────────────────────────────────────────────────────────
      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      // ── Assert ─────────────────────────────────────────────────────────
      const observer = intersectionObservers[0]
      const observedIds = observer.getTargets().map(el => (el as HTMLElement).id)

      // Both should be observed: the long one passes filters,
      // the short one is forced by user include rule
      expect(observedIds).toContain("force-short")
      expect(observedIds).toContain("normal-long")

      manager.stop()
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 4: Smart body fallback
  // ═══════════════════════════════════════════════════════════════════════════
  describe("scenario 4: smart body fallback", () => {
    it("body fallback still filters out TOC, buttons and observes long paragraphs", async () => {
      // ── Arrange ────────────────────────────────────────────────────────
      // A page without any strong content container selectors
      // (no article, main, .post-content, #content, etc.)
      // The detector will fall back to body with "no-reliable-candidate".
      document.body.innerHTML = `
        <div class="page-wrapper">
          <p id="good-paragraph">
            This is a valid paragraph with sufficient text content that should be translated.
            It has enough words to pass both the character and word count thresholds.
          </p>
          <div class="toc">
            <p id="toc-in-body">Navigation link inside TOC</p>
          </div>
          <button id="action-button">Translate</button>
          <p id="short-text">Hi</p>
        </div>
      `

      mockGetLocalConfig.mockResolvedValue(buildSmartConfig())

      // ── Act ────────────────────────────────────────────────────────────
      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      // ── Assert ─────────────────────────────────────────────────────────
      const observer = intersectionObservers[0]
      const observedIds = observer.getTargets().map(el => (el as HTMLElement).id)

      // Long paragraph should pass paragraph filter
      expect(observedIds).toContain("good-paragraph")

      // TOC item should be filtered out (paragraph-filter → toc reason)
      expect(observedIds).not.toContain("toc-in-body")

      // Button should be filtered out (paragraph-filter → control reason)
      expect(observedIds).not.toContain("action-button")

      // Short text should be filtered out (paragraph-filter → short-text reason)
      expect(observedIds).not.toContain("short-text")

      manager.stop()
    })

    it("body fallback still respects user rules in smart mode", async () => {
      // ── Arrange ────────────────────────────────────────────────────────
      document.body.innerHTML = `
        <div>
          <p id="keep-me">A paragraph to keep with enough text content for translation purposes.</p>
          <p id="exclude-me" class="no-translate">A paragraph with user exclude rule that should be skipped.</p>
        </div>
      `

      mockGetLocalConfig.mockResolvedValue(
        buildSmartConfig({ customRules: "!* .no-translate" }),
      )

      // ── Act ────────────────────────────────────────────────────────────
      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      // ── Assert ─────────────────────────────────────────────────────────
      const observer = intersectionObservers[0]
      const observedIds = observer.getTargets().map(el => (el as HTMLElement).id)

      // Keep should be observed
      expect(observedIds).toContain("keep-me")

      // Exclude should not be observed
      expect(observedIds).not.toContain("exclude-me")

      manager.stop()
    })

    it("body fallback pass-through: comments are still observed in body fallback mode", async () => {
      // ── Arrange ────────────────────────────────────────────────────────
      document.body.innerHTML = `
        <div>
          <p id="article-para">Some article content that is long enough to pass the paragraph filter thresholds for translation.</p>
          <div class="comment-section comments">
            <p id="comment1" class="comment">Great article!</p>
          </div>
        </div>
      `

      mockGetLocalConfig.mockResolvedValue(buildSmartConfig())

      // ── Act ────────────────────────────────────────────────────────────
      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      // ── Assert ─────────────────────────────────────────────────────────
      const observer = intersectionObservers[0]
      const observedIds = observer.getTargets().map(el => (el as HTMLElement).id)

      // Article paragraph should be observed
      expect(observedIds).toContain("article-para")

      // Visible comment should be observed (paragraph-filter → comment reason passes)
      expect(observedIds).toContain("comment1")

      manager.stop()
    })
  })
})
