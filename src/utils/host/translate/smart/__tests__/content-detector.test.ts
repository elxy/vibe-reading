// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockParse = vi.fn()

const { mockWarn } = vi.hoisted(() => ({
  mockWarn: vi.fn(),
  mockParseInner: vi.fn(),
}))

vi.mock("../paragraph-filter", () => import("./mocks/paragraph-filter"))

vi.mock("@/utils/logger", () => ({
  logger: {
    warn: mockWarn,
  },
}))

async function setupDefuddleMock(parseImpl: typeof mockParse) {
  vi.resetModules()
  vi.doMock("defuddle/full", () => ({
    __esModule: true,
    default: class MockDefuddle {
      constructor(..._args: unknown[]) {
        // noop
      }

      parse() {
        return parseImpl()
      }
    },
  }))
}

async function loadModule() {
  return await import("../content-detector")
}

function makeArticlePage(): Document {
  document.head.innerHTML = ""
  document.body.innerHTML = `
    <nav>
      <ul><li><a href="#">Home</a></li><li><a href="#">About</a></li></ul>
    </nav>
    <article>
      <h1>Article Title</h1>
      <p>This is the first paragraph of the article with enough words to be considered readable content for the detector.</p>
      <p>This is the second paragraph with more text that adds to the word count and makes the article look substantial.</p>
      <p>A third paragraph with additional content that makes the article feel complete and well-written.</p>
      <p>Fourth paragraph continuing the discussion with even more interesting text to read through.</p>
      <p>Fifth paragraph wrapping up the article content with final thoughts and conclusions drawn from the analysis.</p>
    </article>
    <footer>
      <p>Copyright 2024</p>
    </footer>
  `
  return document
}

function makeMarkdownPage(): Document {
  document.head.innerHTML = ""
  document.body.innerHTML = `
    <header>
      <nav><a href="#">Home</a></nav>
    </header>
    <div class="markdown-body">
      <h1>README</h1>
      <p>This is a project that does interesting things with TypeScript and browser extensions.</p>
      <p>Installation is easy with npm. Just run the install command and you are ready to go.</p>
      <p>Usage is straightforward and well documented with examples for common scenarios.</p>
      <h2>API Reference</h2>
      <p>The API is designed to be intuitive and follow common patterns found in modern libraries.</p>
      <h3>Configuration</h3>
      <p>Configuration options allow deep customization while providing sensible defaults out of the box.</p>
      <h2>License</h2>
      <p>This project is licensed under the MIT license which allows free use and modification.</p>
    </div>
    <footer>
      <p>Footer content</p>
    </footer>
  `
  return document
}

function makeListPage(): Document {
  document.head.innerHTML = ""
  document.body.innerHTML = `
    <ul>
      <li>Item one in the list</li>
      <li>Item two in the list</li>
      <li>Item three in the list</li>
      <li>Item four in the list</li>
      <li>Item five in the list</li>
    </ul>
  `
  return document
}

function makePageWithToc(): Document {
  document.head.innerHTML = ""
  document.body.innerHTML = `
    <nav class="toc">
      <h2>Table of Contents</h2>
      <ul>
        <li><a href="#s1">Section 1</a></li>
        <li><a href="#s2">Section 2</a></li>
      </ul>
    </nav>
    <div class="related-posts">
      <h2>Related Articles</h2>
      <p>Check out these other articles that you might find interesting to read.</p>
    </div>
    <article>
      <h1>Main Article Title Here</h1>
      <p>The main content of the article goes here with substantial text to make it look like a real article.</p>
      <p>Additional paragraphs provide more depth and detail about the topic being discussed in the article.</p>
      <p>A third paragraph ensures the article has enough content to be considered the primary candidate.</p>
      <p>Fourth paragraph with even more valuable information for the reader to consider and learn from.</p>
    </article>
    <footer>
      <p>Site footer with links and copyright information that is not part of the content.</p>
    </footer>
  `
  return document
}

const defaultOptions = {
  hostname: "example.com",
  timeoutMs: 5000,
  debug: true,
}

describe("detectSmartContentRoot", () => {
  beforeEach(() => {
    mockParse.mockReset()
    mockWarn.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  describe("lightweight detection", () => {
    it("selects article over nav/footer/body on article page", async () => {
      makeArticlePage()
      await setupDefuddleMock(mockParse)
      const { detectSmartContentRoot } = await loadModule()

      const result = await detectSmartContentRoot(document, defaultOptions)

      expect(result.root.tagName).toBe("ARTICLE")
      expect(result.source).toBe("lightweight")
      expect(result.debug.candidates.length).toBeGreaterThan(0)

      const articleCandidate = result.debug.candidates.find(c => c.selector === "article")
      const bodyCandidate = result.debug.candidates.find(c => c.selector === "body")

      expect(articleCandidate).toBeDefined()
      expect(bodyCandidate).toBeDefined()
      expect(articleCandidate!.score).toBeGreaterThan(bodyCandidate!.score)
    })

    it("selects .markdown-body on GitHub-like README page", async () => {
      makeMarkdownPage()
      await setupDefuddleMock(mockParse)
      const { detectSmartContentRoot } = await loadModule()

      const result = await detectSmartContentRoot(document, defaultOptions)

      expect(result.root.className).toBe("markdown-body")
      expect(result.source).toBe("lightweight")

      const mdCandidate = result.debug.candidates.find(c => c.selector === ".markdown-body")
      const bodyCandidate = result.debug.candidates.find(c => c.selector === "body")

      expect(mdCandidate).toBeDefined()
      expect(mdCandidate!.score).toBeGreaterThan(bodyCandidate!.score)
    })

    it("penalizes TOC/related so they are not selected", async () => {
      makePageWithToc()
      await setupDefuddleMock(mockParse)
      const { detectSmartContentRoot } = await loadModule()

      const result = await detectSmartContentRoot(document, defaultOptions)

      // Article should be selected over body
      expect(result.root.tagName).toBe("ARTICLE")
      expect(result.source).toBe("lightweight")

      // Body should include article content but may score lower due to TOC/related
      const articleCandidate = result.debug.candidates.find(c => c.selector === "article")
      expect(articleCandidate).toBeDefined()
      expect(articleCandidate!.score).toBeGreaterThan(0)
    })

    it("returns body low confidence for list-like page with no strong root", async () => {
      makeListPage()
      await setupDefuddleMock(mockParse)
      const { detectSmartContentRoot } = await loadModule()

      const result = await detectSmartContentRoot(document, defaultOptions)

      expect(result.root.tagName).toBe("BODY")
      expect(result.source).toBe("body")
      expect(result.confidence).toBe("low")
      expect(result.debug.fallbackReason).toBe("no-reliable-candidate")
    })

    it("returns debug candidates with selector and score", async () => {
      makeArticlePage()
      await setupDefuddleMock(mockParse)
      const { detectSmartContentRoot } = await loadModule()

      const result = await detectSmartContentRoot(document, { ...defaultOptions, debug: true })

      expect(result.debug.candidates.length).toBeGreaterThan(0)
      for (const candidate of result.debug.candidates) {
        expect(candidate).toHaveProperty("selector")
        expect(candidate).toHaveProperty("score")
        expect(candidate).toHaveProperty("reason")
        expect(typeof candidate.selector).toBe("string")
        expect(typeof candidate.score).toBe("number")
        expect(typeof candidate.reason).toBe("string")
      }
    })
  })

  describe("defuddle assistance", () => {
    it("uses mocked Defuddle selector when available and valid", async () => {
      makeArticlePage()
      const defuddleArticle = document.querySelector("article")!
      mockParse.mockReturnValue({
        debug: { selector: "article" },
      })
      await setupDefuddleMock(mockParse)
      const { detectSmartContentRoot } = await loadModule()

      const result = await detectSmartContentRoot(document, defaultOptions)

      expect(result.root).toBe(defuddleArticle)
      expect(result.source).toBe("defuddle")
      expect(mockParse).toHaveBeenCalled()
    })

    it("falls back to lightweight when mocked Defuddle throws", async () => {
      makeArticlePage()
      mockParse.mockImplementation(() => {
        throw new Error("parse failed")
      })
      await setupDefuddleMock(mockParse)
      const { detectSmartContentRoot } = await loadModule()

      const result = await detectSmartContentRoot(document, defaultOptions)

      expect(result.source).toBe("lightweight")
      expect(result.debug.fallbackReason).toBe("defuddle-error")
      expect(result.root.tagName).toBe("ARTICLE")
    })

    it("falls back to lightweight when mocked Defuddle times out", async () => {
      vi.useFakeTimers()
      makeArticlePage()
      // Never-resolving promise simulates a hanging Defuddle parse
      mockParse.mockReturnValue(new Promise(() => {}))
      await setupDefuddleMock(mockParse)
      const { detectSmartContentRoot } = await loadModule()

      const resultPromise = detectSmartContentRoot(document, {
        ...defaultOptions,
        timeoutMs: 100,
      })

      // Advance timers past the timeout so the race resolves
      await vi.advanceTimersByTimeAsync(200)
      const result = await resultPromise

      vi.useRealTimers()

      expect(result.source).toBe("lightweight")
      expect(result.debug.fallbackReason).toBe("defuddle-timeout")
      expect(result.root.tagName).toBe("ARTICLE")
    })

    it("falls back to lightweight when mocked Defuddle selector does not map to original DOM", async () => {
      makeArticlePage()
      mockParse.mockReturnValue({
        debug: { selector: ".content-wrapper" },
      })
      await setupDefuddleMock(mockParse)
      const { detectSmartContentRoot } = await loadModule()

      const result = await detectSmartContentRoot(document, defaultOptions)

      expect(result.source).toBe("lightweight")
      expect(result.debug.fallbackReason).toBe("defuddle-selector-not-found")
      expect(result.root.tagName).toBe("ARTICLE")
    })
  })
})
