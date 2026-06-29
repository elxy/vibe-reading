// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest"

import { detectSmartContentRoot } from "../content-detector"
import { shouldTranslateSmartParagraph } from "../paragraph-filter"

vi.mock("defuddle/full", () => ({
  __esModule: true,
  default: class {
    parse() {
      throw new Error("defuddle not available in test")
    }
  },
}))

vi.mock("@/utils/logger", () => ({
  logger: { warn: vi.fn() },
}))

// ─── Test constants ─────────────────────────────────────────────────────────

const detectionOptions = {
  hostname: "example.com",
  timeoutMs: 5000,
  debug: true,
}

/** Smart thresholds as specified: 40 characters, 8 words */
const filterOptions = {
  hostname: "example.com",
  minCharacters: 40,
  minWords: 8,
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Collect all leaf-level text-bearing elements under a root node.
 *  "Paragraph-like" here means any element whose direct textContent
 *  is non-empty (after trimming).
 */
function collectParagraphLikeElements(root: HTMLElement): HTMLElement[] {
  const results: HTMLElement[] = []
  const all = root.querySelectorAll<HTMLElement>("*")
  for (const el of all) {
    // Only consider elements that have their own direct text (not just children)
    const directText = getDirectTextContent(el)
    if (directText.length > 0) {
      results.push(el)
    }
  }
  // Also include the root itself if it has direct text
  const rootDirectText = getDirectTextContent(root)
  if (rootDirectText.length > 0 && !results.includes(root)) {
    results.push(root)
  }
  return results
}

/** Get the text content from direct child text nodes only (excluding nested elements). */
function getDirectTextContent(el: HTMLElement): string {
  let text = ""
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      text += child.textContent ?? ""
    }
  }
  return text.trim()
}

/** Build a map from element to its filter decision for quick lookups. */
function filterAll(
  elements: HTMLElement[],
  options: typeof filterOptions,
): Map<HTMLElement, ReturnType<typeof shouldTranslateSmartParagraph>> {
  const map = new Map()
  for (const el of elements) {
    map.set(el, shouldTranslateSmartParagraph(el, options))
  }
  return map
}

// ─── Test helpers ───────────────────────────────────────────────────────────

function makeArticleDocument(): Document {
  document.body.innerHTML = `
    <nav>Home Docs</nav>
    <article>
      <h1>Short Title</h1>
      <div class="toc"><a>Intro</a></div>
      <p>This is a long English paragraph with enough words to be translated by smart content filtering.</p>
      <section class="related"><p>Recommended article</p></section>
    </article>
    <footer>Footer</footer>
  `
  return document
}

function makeSearchDocument(): Document {
  document.body.innerHTML = `
    <div class="search-header">
      <div class="filter-bar">
        <button>Filter by date</button>
      </div>
    </div>
    <div class="search-results">
      <ul>
        <li role="listitem">
          <a class="result-title">Search Result Title One</a>
          <p class="result-snippet">This is a search result snippet with some description text about the result.</p>
        </li>
        <li role="listitem">
          <a class="result-title">Search Result Title Two</a>
          <p class="result-snippet">Another search result with a different description that users might want to translate.</p>
        </li>
      </ul>
    </div>
    <nav class="pagination">
      <a>1</a>
      <a>2</a>
      <a>Next</a>
    </nav>
  `
  return document
}

// ═══════════════════════════════════════════════════════════════════════════════
// Integration tests
// ═══════════════════════════════════════════════════════════════════════════════

describe("detector-filter integration", () => {
  // ── Scenario 1: article page ─────────────────────────────────────────────

  describe("article page", () => {
    it("detector selects article root (not nav/footer)", async () => {
      makeArticleDocument()

      const result = await detectSmartContentRoot(document, detectionOptions)

      expect(result.root.tagName).toBe("ARTICLE")
      expect(result.source).toBe("lightweight")
      // Nav and footer exist in the document but are outside the selected root
      expect(document.querySelector("nav")).not.toBeNull()
      expect(document.querySelector("footer")).not.toBeNull()
      // Nav and footer are not descendants of the article root
      expect(result.root.contains(document.querySelector("nav"))).toBe(false)
      expect(result.root.contains(document.querySelector("footer"))).toBe(false)
    })

    it("h1 passes filter by heading exception", async () => {
      makeArticleDocument()

      const result = await detectSmartContentRoot(document, detectionOptions)
      const h1 = result.root.querySelector("h1")!

      const decision = shouldTranslateSmartParagraph(h1, filterOptions)

      expect(decision.shouldTranslate).toBe(true)
      expect(decision.forced).toBe(false)
      expect(decision.reason).toBe("short-heading-exception")
    })

    it("long paragraph passes filter", async () => {
      makeArticleDocument()

      const result = await detectSmartContentRoot(document, detectionOptions)
      const longP = result.root.querySelector(":scope > p") as HTMLElement

      const decision = shouldTranslateSmartParagraph(longP, filterOptions)

      expect(decision.shouldTranslate).toBe(true)
      expect(decision.forced).toBe(false)
      expect(decision.reason).toBe("long-text")
    })

    it("toc element fails filter", async () => {
      makeArticleDocument()

      const result = await detectSmartContentRoot(document, detectionOptions)
      const toc = result.root.querySelector(".toc") as HTMLElement

      const decision = shouldTranslateSmartParagraph(toc, filterOptions)

      expect(decision.shouldTranslate).toBe(false)
      expect(decision.forced).toBe(false)
      expect(decision.reason).toBe("toc")
    })

    it("toc child link fails filter (ancestor is toc)", async () => {
      makeArticleDocument()

      const result = await detectSmartContentRoot(document, detectionOptions)
      const tocLink = result.root.querySelector(".toc a") as HTMLElement

      const decision = shouldTranslateSmartParagraph(tocLink, filterOptions)

      expect(decision.shouldTranslate).toBe(false)
      expect(decision.forced).toBe(false)
      expect(decision.reason).toBe("toc")
    })

    it("related section paragraph fails filter", async () => {
      makeArticleDocument()

      const result = await detectSmartContentRoot(document, detectionOptions)
      const relatedP = result.root.querySelector(".related p") as HTMLElement

      const decision = shouldTranslateSmartParagraph(relatedP, filterOptions)

      expect(decision.shouldTranslate).toBe(false)
      expect(decision.forced).toBe(false)
      expect(decision.reason).toBe("recommendation")
    })

    it("collects paragraph-like elements under root and filters correctly", async () => {
      makeArticleDocument()

      const result = await detectSmartContentRoot(document, detectionOptions)
      const elements = collectParagraphLikeElements(result.root)
      const decisions = filterAll(elements, filterOptions)

      // h1: should pass
      const h1 = result.root.querySelector("h1")!
      expect(decisions.get(h1)!.shouldTranslate).toBe(true)

      // Long paragraph: should pass
      const longP = result.root.querySelector(":scope > p") as HTMLElement
      expect(decisions.get(longP)!.shouldTranslate).toBe(true)
      expect(decisions.get(longP)!.reason).toBe("long-text")

      // Related section's p: should fail
      const relatedP = result.root.querySelector(".related p") as HTMLElement
      expect(decisions.get(relatedP)!.shouldTranslate).toBe(false)
      expect(decisions.get(relatedP)!.reason).toBe("recommendation")
    })
  })

  // ── Scenario 2: search/list page ──────────────────────────────────────────

  describe("search page", () => {
    it("detector returns body with low confidence (no strong root)", async () => {
      makeSearchDocument()

      const result = await detectSmartContentRoot(document, detectionOptions)

      expect(result.root.tagName).toBe("BODY")
      expect(result.source).toBe("body")
      expect(result.confidence).toBe("low")
      expect(result.debug.fallbackReason).toBe("no-reliable-candidate")
    })

    it("passes search result title as short-heading-exception", async () => {
      makeSearchDocument()

      const result = await detectSmartContentRoot(document, detectionOptions)
      const title = result.root.querySelector(".result-title") as HTMLElement

      const decision = shouldTranslateSmartParagraph(title, filterOptions)

      expect(decision.shouldTranslate).toBe(true)
      expect(decision.forced).toBe(false)
      expect(decision.reason).toBe("short-heading-exception")
    })

    it("passes search result snippet (in listitem so short-heading-exception)", async () => {
      makeSearchDocument()

      const result = await detectSmartContentRoot(document, detectionOptions)
      const snippet = result.root.querySelector(".result-snippet") as HTMLElement

      const decision = shouldTranslateSmartParagraph(snippet, filterOptions)

      // The snippet is inside a <li role="listitem"> inside .search-results,
      // so isSearchResultTitle returns true → short-heading-exception.
      // This is correct: both title and snippet in a search result item should be translated.
      expect(decision.shouldTranslate).toBe(true)
      expect(decision.forced).toBe(false)
      expect(decision.reason).toBe("short-heading-exception")
    })

    it("skips pagination link in nav (navigation failure)", async () => {
      makeSearchDocument()

      const result = await detectSmartContentRoot(document, detectionOptions)
      const pageLink = result.root.querySelector(".pagination a") as HTMLElement

      const decision = shouldTranslateSmartParagraph(pageLink, filterOptions)

      expect(decision.shouldTranslate).toBe(false)
      expect(decision.forced).toBe(false)
      expect(decision.reason).toBe("navigation")
    })

    it("skips filter button (control failure)", async () => {
      makeSearchDocument()

      const result = await detectSmartContentRoot(document, detectionOptions)
      const filterBtn = result.root.querySelector("button") as HTMLElement

      const decision = shouldTranslateSmartParagraph(filterBtn, filterOptions)

      expect(decision.shouldTranslate).toBe(false)
      expect(decision.forced).toBe(false)
      expect(decision.reason).toBe("control")
    })

    it("collects paragraph-like elements under body and verifies all filter decisions", async () => {
      makeSearchDocument()

      const result = await detectSmartContentRoot(document, detectionOptions)
      const elements = collectParagraphLikeElements(result.root)
      const decisions = filterAll(elements, filterOptions)

      // All result-title elements should pass
      const titles = result.root.querySelectorAll(".result-title")
      for (const title of titles) {
        const d = decisions.get(title as HTMLElement)
        expect(d!.shouldTranslate).toBe(true)
        expect(d!.reason).toBe("short-heading-exception")
      }

      // All result-snippet elements should pass (inside search result listitem)
      const snippets = result.root.querySelectorAll(".result-snippet")
      for (const snippet of snippets) {
        const d = decisions.get(snippet as HTMLElement)
        expect(d!.shouldTranslate).toBe(true)
        expect(d!.reason).toBe("short-heading-exception")
      }

      // All pagination links should fail (navigation)
      const pageLinks = result.root.querySelectorAll(".pagination a")
      for (const link of pageLinks) {
        const d = decisions.get(link as HTMLElement)
        expect(d!.shouldTranslate).toBe(false)
        expect(d!.reason).toBe("navigation")
      }

      // Filter button should fail (control)
      const filterBtn = result.root.querySelector("button") as HTMLElement
      expect(decisions.get(filterBtn)!.shouldTranslate).toBe(false)
      expect(decisions.get(filterBtn)!.reason).toBe("control")
    })
  })
})
