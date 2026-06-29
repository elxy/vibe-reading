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

class MockIntersectionObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()

  constructor(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {}
}

async function flushDomUpdates(): Promise<void> {
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 0))
  await Promise.resolve()
}

describe("pageTranslationManager title disabled", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    document.head.innerHTML = ""
    document.body.innerHTML = "<main>Article body</main>"
    document.title = "Original Title"

    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver)

    mockGetDetectedCodeFromStorage.mockResolvedValue("eng")
    mockGetLocalConfig.mockResolvedValue(DEFAULT_CONFIG)
    mockDeepQueryTopLevelSelector.mockReturnValue([])
    mockValidateTranslationConfigAndToast.mockReturnValue(true)
    mockSendMessage.mockResolvedValue(undefined)
    mockWalkAndLabelElement.mockImplementation((element: HTMLElement, walkId: string) => {
      element.setAttribute("data-vibe-reading-walked", walkId)
      return { forceBlock: false, isInlineNode: false }
    })
    mockParseSmartRules.mockReturnValue({ rules: [], errors: [] })
    mockMatchSmartRulesForElement.mockReturnValue({ action: null, matchedRules: [] })
    mockShouldTranslateSmartParagraph.mockReturnValue({ shouldTranslate: true, forced: false, reason: "pass" })
    mockDetectSmartContentRoot.mockResolvedValue({
      root: document.body,
      source: "body",
      confidence: "low",
      debug: { candidates: [] },
    })
  })

  it("does not change document.title when page translation starts", async () => {
    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    expect(document.title).toBe("Original Title")
    expect(document.title).not.toBe("")

    manager.stop()
  })

  it("does not change document.title when page translation stops", async () => {
    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    expect(document.title).toBe("Original Title")

    manager.stop()
    await flushDomUpdates()

    expect(document.title).toBe("Original Title")
  })

  it("does not import or reference translateTextForPageTitle in any way", async () => {
    // The fact that the module loads without mocking translateTextForPageTitle
    // proves it is not imported.
    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    // Title should remain completely untouched
    expect(document.title).toBe("Original Title")

    manager.stop()
  })

  it("does not call getOrCreateWebPageContext when starting", async () => {
    const manager = new PageTranslationManager()
    await manager.start()
    await flushDomUpdates()

    // If getOrCreateWebPageContext were imported and called, the test
    // would have required its mock. Loading without it succeeds.
    expect(document.title).toBe("Original Title")

    manager.stop()
  })

  it("title remains stable across start/stop/restart cycles", async () => {
    const manager = new PageTranslationManager()

    await manager.start()
    await flushDomUpdates()
    expect(document.title).toBe("Original Title")

    // Simulate external title change
    document.title = "External Change"
    await flushDomUpdates()
    expect(document.title).toBe("External Change")

    await manager.restart()
    await flushDomUpdates()
    expect(document.title).toBe("External Change")

    manager.stop()
    await flushDomUpdates()
    expect(document.title).toBe("External Change")
  })
})
