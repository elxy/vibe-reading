// @vitest-environment jsdom

import type { SmartParagraphFilterOptions } from "../paragraph-filter"
import { describe, expect, it } from "vitest"
import { shouldTranslateSmartParagraph } from "../paragraph-filter"

function makeOptions(overrides?: Partial<SmartParagraphFilterOptions>): SmartParagraphFilterOptions {
  return {
    hostname: "example.com",
    minCharacters: 20,
    minWords: 3,
    ...overrides,
  }
}

describe("shouldTranslateSmartParagraph", () => {
  describe("user decision", () => {
    it("returns include when userDecision is include, even for short/control content", () => {
      const el = document.createElement("span")
      el.textContent = "hi"
      const result = shouldTranslateSmartParagraph(el, makeOptions({ userDecision: "include" }))
      expect(result).toEqual({ shouldTranslate: true, forced: true, reason: "user-include" })
    })

    it("returns exclude when userDecision is exclude, even for long paragraph", () => {
      const el = document.createElement("p")
      el.textContent = "This is a long enough paragraph with sufficient words to be translated normally."
      const result = shouldTranslateSmartParagraph(el, makeOptions({ userDecision: "exclude" }))
      expect(result).toEqual({ shouldTranslate: false, forced: true, reason: "user-exclude" })
    })
  })

  describe("long / short text", () => {
    it("passes a long paragraph with sufficient words", () => {
      const el = document.createElement("p")
      el.textContent = "This is a long enough paragraph with sufficient words to be translated."
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: true, forced: false, reason: "long-text" })
    })

    it("fails a short plain text paragraph", () => {
      const el = document.createElement("p")
      el.textContent = "Short."
      const result = shouldTranslateSmartParagraph(el, makeOptions({ minCharacters: 10, minWords: 3 }))
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "short-text" })
    })

    it("fails text below minWords but above minCharacters", () => {
      const el = document.createElement("p")
      el.textContent = "A couple words."
      const result = shouldTranslateSmartParagraph(el, makeOptions({ minCharacters: 5, minWords: 5 }))
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "short-text" })
    })
  })

  describe("heading exceptions", () => {
    it("passes h1 short text", () => {
      const el = document.createElement("h1")
      el.textContent = "Title"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: true, forced: false, reason: "short-heading-exception" })
    })

    it("passes h2 short text", () => {
      const el = document.createElement("h2")
      el.textContent = "Section"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: true, forced: false, reason: "short-heading-exception" })
    })

    it("passes h3 short text", () => {
      const el = document.createElement("h3")
      el.textContent = "Sub"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: true, forced: false, reason: "short-heading-exception" })
    })

    it("passes figcaption short text", () => {
      const el = document.createElement("figcaption")
      el.textContent = "Figure 1"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: true, forced: false, reason: "short-heading-exception" })
    })

    it("passes blockquote short text", () => {
      const el = document.createElement("blockquote")
      el.textContent = "Quote me"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: true, forced: false, reason: "short-heading-exception" })
    })

    it("passes an element inside a blockquote", () => {
      const bq = document.createElement("blockquote")
      const el = document.createElement("p")
      el.textContent = "Nested quote"
      bq.appendChild(el)
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: true, forced: false, reason: "short-heading-exception" })
    })
  })

  describe("search result titles", () => {
    it("passes an element with result-title class", () => {
      const el = document.createElement("span")
      el.className = "result-title"
      el.textContent = "Title"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: true, forced: false, reason: "short-heading-exception" })
    })

    it("passes an element with search-result-title in id", () => {
      const el = document.createElement("div")
      el.id = "search-result-title-1"
      el.textContent = "Title"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: true, forced: false, reason: "short-heading-exception" })
    })

    it("passes an element inside role=listitem inside a search results container", () => {
      const container = document.createElement("div")
      container.className = "search-results"
      const listItem = document.createElement("li")
      listItem.setAttribute("role", "listitem")
      const el = document.createElement("a")
      el.textContent = "Result Link"
      listItem.appendChild(el)
      container.appendChild(listItem)
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: true, forced: false, reason: "short-heading-exception" })
    })
  })

  describe("product titles", () => {
    it("passes an element with product-title class", () => {
      const el = document.createElement("span")
      el.className = "product-title"
      el.textContent = "Widget"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: true, forced: false, reason: "short-heading-exception" })
    })

    it("passes an element with sku-name class", () => {
      const el = document.createElement("h1")
      el.className = "sku-name"
      el.textContent = "ABC-123"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: true, forced: false, reason: "short-heading-exception" })
    })
  })

  describe("navigation containers", () => {
    it("fails an element inside nav", () => {
      const nav = document.createElement("nav")
      const el = document.createElement("span")
      el.textContent = "Some nav link text that is long enough."
      nav.appendChild(el)
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "navigation" })
    })

    it("fails an element inside header", () => {
      const header = document.createElement("header")
      const el = document.createElement("h2")
      el.textContent = "Site Header Title Long Enough Here"
      header.appendChild(el)
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "navigation" })
    })

    it("fails an element inside footer", () => {
      const footer = document.createElement("footer")
      const el = document.createElement("p")
      el.textContent = "Footer text long enough here."
      footer.appendChild(el)
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "navigation" })
    })

    it("fails an element inside aside", () => {
      const aside = document.createElement("aside")
      const el = document.createElement("div")
      el.textContent = "Sidebar text long enough here for testing."
      aside.appendChild(el)
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "navigation" })
    })
  })

  describe("tOC containers", () => {
    it("fails an element inside a toc class container", () => {
      const toc = document.createElement("div")
      toc.className = "toc"
      const el = document.createElement("a")
      el.textContent = "Chapter 1 Introduction"
      toc.appendChild(el)
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "toc" })
    })

    it("fails an element inside #toc", () => {
      const toc = document.createElement("div")
      toc.id = "toc"
      const el = document.createElement("li")
      el.textContent = "Section 1"
      toc.appendChild(el)
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "toc" })
    })

    it("fails an element with aria-label table of contents", () => {
      const el = document.createElement("nav")
      el.setAttribute("aria-label", "table of contents")
      el.textContent = "TOC Item"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "toc" })
    })

    it("fails an element inside .table-of-contents", () => {
      const toc = document.createElement("div")
      toc.className = "table-of-contents"
      const el = document.createElement("span")
      el.textContent = "TOC entry"
      toc.appendChild(el)
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "toc" })
    })

    it("fails an element matching .on-this-page", () => {
      const el = document.createElement("div")
      el.className = "on-this-page"
      el.textContent = "On this page entry with more content."
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "toc" })
    })
  })

  describe("controls", () => {
    it("fails a button", () => {
      const el = document.createElement("button")
      el.textContent = "Click me now please for translation test."
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "control" })
    })

    it("fails a select", () => {
      const el = document.createElement("select")
      el.textContent = "Option text"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "control" })
    })

    it("fails an input", () => {
      const el = document.createElement("input")
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "control" })
    })

    it("fails a textarea", () => {
      const el = document.createElement("textarea")
      el.textContent = "Some content here inside the textarea element."
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "control" })
    })

    it("fails an element with role=button", () => {
      const el = document.createElement("div")
      el.setAttribute("role", "button")
      el.textContent = "Action text"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "control" })
    })
  })

  describe("code", () => {
    it("fails a pre element", () => {
      const el = document.createElement("pre")
      el.textContent = "const x = 1;"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "code" })
    })

    it("fails a code element", () => {
      const el = document.createElement("code")
      el.textContent = "console.log('hello')"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "code" })
    })

    it("fails a kbd element", () => {
      const el = document.createElement("kbd")
      el.textContent = "Ctrl+C"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "code" })
    })

    it("fails a descendant of pre", () => {
      const pre = document.createElement("pre")
      const el = document.createElement("span")
      el.textContent = "some code span"
      pre.appendChild(el)
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "code" })
    })
  })

  describe("recommendation / ad containers", () => {
    it("fails an element inside a related container", () => {
      const container = document.createElement("div")
      container.className = "related-posts"
      const el = document.createElement("a")
      el.textContent = "Related article title here."
      container.appendChild(el)
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "recommendation" })
    })

    it("fails an element with recommended class", () => {
      const el = document.createElement("div")
      el.className = "recommended-articles"
      el.textContent = "A recommended article with enough words to be translated."
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "recommendation" })
    })

    it("fails an element inside a newsletter container", () => {
      const container = document.createElement("div")
      container.className = "newsletter-signup"
      const el = document.createElement("p")
      el.textContent = "Subscribe to our newsletter for updates and more content."
      container.appendChild(el)
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "recommendation" })
    })

    it("fails an element inside a share container", () => {
      const container = document.createElement("div")
      container.className = "share-buttons"
      const el = document.createElement("span")
      el.textContent = "Share this article with your friends and family."
      container.appendChild(el)
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "recommendation" })
    })

    it("fails an element inside a sponsored container", () => {
      const container = document.createElement("div")
      container.id = "sponsored-content"
      const el = document.createElement("p")
      el.textContent = "This is a sponsored article with enough words for translation."
      container.appendChild(el)
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "recommendation" })
    })

    it("fails an element with advert class", () => {
      const el = document.createElement("div")
      el.className = "advert-container"
      el.textContent = "An advertisement with sufficient text to be long enough."
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "recommendation" })
    })

    it("fails an element matching ad- prefix in aria-label", () => {
      const el = document.createElement("div")
      el.setAttribute("aria-label", "ad-banner")
      el.textContent = "Ad content with plenty of text for testing purposes."
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "recommendation" })
    })
  })

  describe("comments", () => {
    it("passes a visible comment with short text", () => {
      const el = document.createElement("div")
      el.className = "comment-body"
      el.textContent = "Nice!"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: true, forced: false, reason: "comment" })
    })

    it("passes a visible comment inside a comment thread", () => {
      const thread = document.createElement("div")
      thread.id = "discussion-thread"
      const el = document.createElement("p")
      el.textContent = "I agree"
      thread.appendChild(el)
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: true, forced: false, reason: "comment" })
    })

    it("passes a visible element with reply in its aria-label", () => {
      const el = document.createElement("div")
      el.setAttribute("aria-label", "reply box")
      el.textContent = "Thanks!"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: true, forced: false, reason: "comment" })
    })

    it("fails a hidden comment", () => {
      const el = document.createElement("div")
      el.className = "comment-body"
      el.setAttribute("hidden", "")
      el.textContent = "Nice!"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "hidden" })
    })

    it("fails a comment with aria-hidden=true", () => {
      const el = document.createElement("div")
      el.className = "reply-content"
      el.setAttribute("aria-hidden", "true")
      el.textContent = "Hidden reply"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "hidden" })
    })

    it("fails a comment with display:none", () => {
      const el = document.createElement("div")
      el.className = "comment"
      el.style.display = "none"
      el.textContent = "Hidden comment"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "hidden" })
    })
  })

  describe("hidden elements", () => {
    it("fails an element with hidden attribute", () => {
      const el = document.createElement("p")
      el.setAttribute("hidden", "")
      el.textContent = "This is hidden content that should not be translated at all."
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "hidden" })
    })

    it("fails an element with visibility:hidden", () => {
      const el = document.createElement("p")
      el.style.visibility = "hidden"
      el.textContent = "This is content hidden via visibility hidden style."
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "hidden" })
    })
  })

  describe("numeric content", () => {
    it("fails numeric-only content", () => {
      const el = document.createElement("span")
      el.textContent = "12345"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "numeric" })
    })

    it("fails content with numbers and punctuation only", () => {
      const el = document.createElement("span")
      el.textContent = "1,234.56"
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "numeric" })
    })

    it("passes alphanumeric content", () => {
      const el = document.createElement("p")
      el.textContent = "The price is 123 dollars and fifty six cents only."
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: true, forced: false, reason: "long-text" })
    })
  })

  describe("edge cases", () => {
    it("skips empty element", () => {
      const el = document.createElement("p")
      el.textContent = ""
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "short-text" })
    })

    it("skips whitespace-only element", () => {
      const el = document.createElement("p")
      el.textContent = "   \n  "
      const result = shouldTranslateSmartParagraph(el, makeOptions())
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "short-text" })
    })

    it("passes a long paragraph with exactly min characters", () => {
      const el = document.createElement("p")
      el.textContent = "abcdefghijklmnopqrst" // exactly 20 chars
      const result = shouldTranslateSmartParagraph(el, makeOptions({ minCharacters: 20, minWords: 1 }))
      expect(result).toEqual({ shouldTranslate: true, forced: false, reason: "long-text" })
    })

    it("skips a paragraph one character below min", () => {
      const el = document.createElement("p")
      el.textContent = "abcde fghij klmno" // 17 chars trimmed, 3 words
      const result = shouldTranslateSmartParagraph(el, makeOptions({ minCharacters: 18, minWords: 3 }))
      expect(result).toEqual({ shouldTranslate: false, forced: false, reason: "short-text" })
    })
  })
})
