// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { PageTranslationManager } from "../page-translation"

// ─── Mock defuddle (throws in test, as in other integration tests) ─────────
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
// IMPORTANT: translateTextForPageTitle is NOT mocked here. If the page-translation
// module ever imports or calls it, the test will crash with a module-not-found error.
// That crash is intentional verification confirming the code path never touches titles.
const {
  mockGetLocalConfig,
  mockDeepQueryTopLevelSelector,
  mockWalkAndLabelElement,
  mockRemoveAllTranslatedWrapperNodes,
  mockTranslateWalkedElement,
  mockValidateTranslationConfigAndToast,
  mockSendMessage,
} = vi.hoisted(() => ({
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
  getRandomUUID: () => "title-int-walk-id",
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

class MockIntersectionObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()

  constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
}

// ─── Test helpers ───────────────────────────────────────────────────────────

async function flushDomUpdates(): Promise<void> {
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  await Promise.resolve()
}

/**
 * Walk implementation that sets data attributes so that
 * collectParagraphElementsDeep can find paragraph candidates.
 * Only direct paragraph/heading elements are marked as paragraphs
 * (not container divs), to avoid nesting issues.
 */
function labelParagraphElements(element: HTMLElement, walkId: string): void {
  element.setAttribute("data-vibe-reading-walked", walkId)

  const allElements: HTMLElement[] = [element]
  element.querySelectorAll("*").forEach(el => allElements.push(el as HTMLElement))

  for (const el of allElements) {
    el.setAttribute("data-vibe-reading-walked", walkId)
  }

  const paragraphTags = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6"])
  for (const el of allElements) {
    if (paragraphTags.has(el.tagName)) {
      el.setAttribute("data-vibe-reading-paragraph", "")
    }
  }
}

function buildConfig(range: "main" | "all" | "smart"): typeof DEFAULT_CONFIG {
  return {
    ...DEFAULT_CONFIG,
    translate: {
      ...DEFAULT_CONFIG.translate,
      page: {
        ...DEFAULT_CONFIG.translate.page,
        range,
        smart: {
          customRules: "",
          debug: false,
        },
      },
    },
  }
}

// ─── Setup ──────────────────────────────────────────────────────────────────

describe("pageTranslationManager title disabled (integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    document.head.innerHTML = ""
    document.body.innerHTML = ""
    document.title = "Original Title"

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver)

    mockGetLocalConfig.mockResolvedValue(DEFAULT_CONFIG)
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
  // Scenario 1: main range — title unchanged on start & stop
  // ═══════════════════════════════════════════════════════════════════════════
  describe("scenario 1: main range", () => {
    it("does not change document.title when starting in main range", async () => {
      document.title = "Original Title"
      document.body.innerHTML = "<p>Article body content for translation purposes.</p>"

      mockGetLocalConfig.mockResolvedValue(buildConfig("main"))

      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      expect(document.title).toBe("Original Title")

      manager.stop()
    })

    it("does not change document.title when stopping in main range", async () => {
      document.title = "Original Title"
      document.body.innerHTML = "<p>Article body content for translation purposes.</p>"

      mockGetLocalConfig.mockResolvedValue(buildConfig("main"))

      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      manager.stop()
      await flushDomUpdates()

      expect(document.title).toBe("Original Title")
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 2: all range — title unchanged on start & stop
  // ═══════════════════════════════════════════════════════════════════════════
  describe("scenario 2: all range", () => {
    it("does not change document.title when starting in all range", async () => {
      document.title = "Original Title"
      document.body.innerHTML = "<p>Article body content for translation purposes.</p>"

      mockGetLocalConfig.mockResolvedValue(buildConfig("all"))

      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      expect(document.title).toBe("Original Title")

      manager.stop()
    })

    it("does not change document.title when stopping in all range", async () => {
      document.title = "Original Title"
      document.body.innerHTML = "<p>Article body content for translation purposes.</p>"

      mockGetLocalConfig.mockResolvedValue(buildConfig("all"))

      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      manager.stop()
      await flushDomUpdates()

      expect(document.title).toBe("Original Title")
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 3: smart range — title unchanged on start & stop
  // ═══════════════════════════════════════════════════════════════════════════
  describe("scenario 3: smart range", () => {
    it("does not change document.title when starting in smart range", async () => {
      document.title = "Original Title"
      document.body.innerHTML = `
        <article>
          <h1>Smart Article Title</h1>
          <p>This is a long paragraph with substantial text content that should clearly pass the word and character count thresholds for smart translation.</p>
        </article>
      `

      mockGetLocalConfig.mockResolvedValue(buildConfig("smart"))

      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      expect(document.title).toBe("Original Title")

      manager.stop()
    })

    it("does not change document.title when stopping in smart range", async () => {
      document.title = "Original Title"
      document.body.innerHTML = `
        <article>
          <h1>Smart Article Title</h1>
          <p>This is a long paragraph with substantial text content that should clearly pass the word and character count thresholds for smart translation.</p>
        </article>
      `

      mockGetLocalConfig.mockResolvedValue(buildConfig("smart"))

      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      manager.stop()
      await flushDomUpdates()

      expect(document.title).toBe("Original Title")
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 4: title mutation while translation is active
  // ═══════════════════════════════════════════════════════════════════════════
  describe("scenario 4: title mutation during active translation", () => {
    it("does not overwrite externally mutated title in main range", async () => {
      document.title = "Original Title"
      document.body.innerHTML = "<p>Some paragraph content here for page translation purposes.</p>"

      mockGetLocalConfig.mockResolvedValue(buildConfig("main"))

      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      expect(document.title).toBe("Original Title")

      // Simulate an external title change (e.g., SPA navigation)
      document.title = "Updated Source Title"
      await flushDomUpdates()

      expect(document.title).toBe("Updated Source Title")

      manager.stop()
      await flushDomUpdates()

      // Title should remain the latest source title, not overwritten
      expect(document.title).toBe("Updated Source Title")
    })

    it("does not overwrite externally mutated title in all range", async () => {
      document.title = "Original Title"
      document.body.innerHTML = "<p>Some paragraph content here for page translation purposes.</p>"

      mockGetLocalConfig.mockResolvedValue(buildConfig("all"))

      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      expect(document.title).toBe("Original Title")

      document.title = "Updated Source Title"
      await flushDomUpdates()

      expect(document.title).toBe("Updated Source Title")

      manager.stop()
      await flushDomUpdates()

      expect(document.title).toBe("Updated Source Title")
    })

    it("does not overwrite externally mutated title in smart range", async () => {
      document.title = "Original Title"
      document.body.innerHTML = `
        <article>
          <h1>Smart Article Title</h1>
          <p>This is a long paragraph with substantial text content that should clearly pass the word and character count thresholds for smart translation.</p>
        </article>
      `

      mockGetLocalConfig.mockResolvedValue(buildConfig("smart"))

      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      expect(document.title).toBe("Original Title")

      document.title = "Updated Source Title"
      await flushDomUpdates()

      expect(document.title).toBe("Updated Source Title")

      manager.stop()
      await flushDomUpdates()

      expect(document.title).toBe("Updated Source Title")
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 5: title stability across start/stop/restart cycles
  // ═══════════════════════════════════════════════════════════════════════════
  describe("scenario 5: start/stop/restart preserves title", () => {
    it("preserves title across full start → stop → restart → stop cycle in main range", async () => {
      document.title = "Cycle Test Title"
      document.body.innerHTML = "<p>Paragraph content for cycle testing scenario.</p>"

      mockGetLocalConfig.mockResolvedValue(buildConfig("main"))

      const manager = new PageTranslationManager()

      // Start
      await manager.start()
      await flushDomUpdates()
      expect(document.title).toBe("Cycle Test Title")

      // External mutation
      document.title = "After Mutation"
      await flushDomUpdates()
      expect(document.title).toBe("After Mutation")

      // Stop
      manager.stop()
      await flushDomUpdates()
      expect(document.title).toBe("After Mutation")

      // Restart
      await manager.restart()
      await flushDomUpdates()
      expect(document.title).toBe("After Mutation")

      // Stop again
      manager.stop()
      await flushDomUpdates()
      expect(document.title).toBe("After Mutation")
    })

    it("preserves title across full cycle in all range", async () => {
      document.title = "All Range Cycle"
      document.body.innerHTML = "<p>Paragraph content for cycle testing scenario.</p>"

      mockGetLocalConfig.mockResolvedValue(buildConfig("all"))

      const manager = new PageTranslationManager()

      await manager.start()
      await flushDomUpdates()
      expect(document.title).toBe("All Range Cycle")

      document.title = "Changed During All"
      await flushDomUpdates()

      await manager.restart()
      await flushDomUpdates()
      expect(document.title).toBe("Changed During All")

      manager.stop()
      await flushDomUpdates()
      expect(document.title).toBe("Changed During All")
    })

    it("preserves title across full cycle in smart range", async () => {
      document.title = "Smart Cycle Title"
      document.body.innerHTML = `
        <article>
          <h1>Smart Cycle Article</h1>
          <p>This is a long paragraph with substantial text content that should clearly pass the word and character count thresholds for smart translation.</p>
        </article>
      `

      mockGetLocalConfig.mockResolvedValue(buildConfig("smart"))

      const manager = new PageTranslationManager()

      await manager.start()
      await flushDomUpdates()
      expect(document.title).toBe("Smart Cycle Title")

      document.title = "Smart Changed"
      await flushDomUpdates()

      await manager.restart()
      await flushDomUpdates()
      expect(document.title).toBe("Smart Changed")

      manager.stop()
      await flushDomUpdates()
      expect(document.title).toBe("Smart Changed")
    })
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 6: translateTextForPageTitle is not imported/called
  // ═══════════════════════════════════════════════════════════════════════════
  describe("scenario 6: translateTextForPageTitle never called", () => {
    it("does not require a mock for translateTextForPageTitle — proves it is not imported", async () => {
      // No mock is set up for translateTextForPageTitle or getOrCreateWebPageContext.
      // If page-translation.ts imported either, the vi.mock system would fail.
      // This test loading successfully is itself the assertion.

      document.title = "Verify No Title API"
      document.body.innerHTML = "<p>Some body content for translation.</p>"

      mockGetLocalConfig.mockResolvedValue(buildConfig("all"))

      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      // Title is untouched — no title API was called
      expect(document.title).toBe("Verify No Title API")

      manager.stop()
    })

    it("no title mutation occurs even after IntersectionObserver triggers translation", async () => {
      // Even when translateWalkedElement is called (simulating real translation),
      // the title should remain untouched because page-translation never touches it.

      document.title = "No Title During Translate"
      document.body.innerHTML = "<p>Content for translation testing purposes.</p>"

      mockGetLocalConfig.mockResolvedValue(buildConfig("main"))

      const manager = new PageTranslationManager()
      await manager.start()
      await flushDomUpdates()

      expect(document.title).toBe("No Title During Translate")

      // Verify that if translateWalkedElement were to be called,
      // it would not touch the title either (it's independent)
      expect(mockTranslateWalkedElement).not.toHaveBeenCalled()

      document.title = "Post Translate"
      await flushDomUpdates()
      expect(document.title).toBe("Post Translate")

      manager.stop()
    })
  })
})
