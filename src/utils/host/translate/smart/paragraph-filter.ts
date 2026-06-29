export type SmartUserDecision = "include" | "exclude" | null

export interface SmartParagraphFilterOptions {
  hostname: string
  minCharacters: number
  minWords: number
  userDecision?: SmartUserDecision
}

export interface SmartParagraphDecision {
  shouldTranslate: boolean
  forced: boolean
  reason: string
}

// ─── Token sets ────────────────────────────────────────────────────────────

const RECOMMENDATION_TOKENS = [
  "related",
  "recommended",
  "you-may-also-like",
  "more-from",
  "popular",
  "trending",
  "read-next",
  "newsletter",
  "subscribe",
  "share",
  "social",
  "sponsored",
  "advert",
  "ad-",
]

const COMMENT_TOKENS = ["comment", "reply", "discussion", "thread"]

const SEARCH_RESULT_TITLE_TOKENS = ["result-title", "search-result-title"]

const SEARCH_CONTAINER_TOKENS = [
  "search-results",
  "search-result",
  "results-list",
  "serp",
  "search-list",
  "search",
]

const PRODUCT_TITLE_TOKENS = ["product-title", "item-title", "sku-name"]

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Join lower-cased class, id, aria-label, role into one string for token matching. */
function getAttributeText(el: Element): string {
  return [
    el.className?.toString() ?? "",
    el.id,
    el.getAttribute("aria-label") ?? "",
    el.getAttribute("role") ?? "",
  ]
    .join(" ")
    .toLowerCase()
}

/** Check whether `el` or any ancestor matches any token from `tokens`. */
function elementOrAncestorHasToken(el: Element, tokens: string[]): boolean {
  let current: Element | null = el
  while (current) {
    if (hasToken(current, tokens))
      return true
    current = current.parentElement
  }
  return false
}

/** Check an element's own class/id/aria-label/role for any token. */
function hasToken(el: Element, tokens: string[]): boolean {
  const text = getAttributeText(el)
  return tokens.some(t => text.includes(t))
}

/** True if `el` or any ancestor has the given tag name (case-insensitive). */
function hasAncestorTag(el: Element, tagName: string): boolean {
  let current: Element | null = el.parentElement
  const upper = tagName.toUpperCase()
  while (current) {
    if (current.tagName === upper)
      return true
    current = current.parentElement
  }
  return false
}

// ─── Individual checks ─────────────────────────────────────────────────────

function isHidden(el: HTMLElement): boolean {
  if (el.hidden)
    return true
  if (el.getAttribute("aria-hidden") === "true")
    return true
  if (el.style.display === "none")
    return true
  if (el.style.visibility === "hidden")
    return true
  return false
}

function isInsideNavContainer(el: Element): boolean {
  return (
    el.closest("nav") !== null
    || el.closest("header") !== null
    || el.closest("footer") !== null
    || el.closest("aside") !== null
  )
}

function isInsideTOC(el: Element): boolean {
  // Check element itself and all ancestors
  let current: Element | null = el
  while (current) {
    if (matchesTOCSelector(current))
      return true
    current = current.parentElement
  }
  return false
}

function matchesTOCSelector(el: Element): boolean {
  // aria-label checks (case-insensitive with "i" flag not supported in all selectors,
  // so check manually)
  const ariaLabel = (el.getAttribute("aria-label") ?? "").toLowerCase()
  if (ariaLabel.includes("table of contents") || ariaLabel.includes("on this page")) {
    return true
  }

  // CSS selector checks
  try {
    if (
      el.matches(".toc, .table-of-contents, .tableOfContents, .on-this-page, #toc")
    ) {
      return true
    }
  }
  catch {
    // Some selectors may fail in jsdom, ignore
  }

  return false
}

function isControl(el: HTMLElement): boolean {
  const tag = el.tagName
  if (tag === "BUTTON" || tag === "SELECT" || tag === "OPTION" || tag === "INPUT" || tag === "TEXTAREA") {
    return true
  }
  if (el.getAttribute("role") === "button")
    return true
  return false
}

function isCode(el: Element): boolean {
  const tag = el.tagName
  if (tag === "PRE" || tag === "CODE" || tag === "KBD" || tag === "SAMP")
    return true
  // Check ancestors
  if (hasAncestorTag(el, "pre"))
    return true
  if (hasAncestorTag(el, "code"))
    return true
  if (hasAncestorTag(el, "kbd"))
    return true
  if (hasAncestorTag(el, "samp"))
    return true
  return false
}

function isRecommendation(el: Element): boolean {
  return elementOrAncestorHasToken(el, RECOMMENDATION_TOKENS)
}

function isCommentContent(el: Element): boolean {
  return elementOrAncestorHasToken(el, COMMENT_TOKENS)
}

function isSearchResultTitle(el: Element): boolean {
  // Check element own tokens
  if (hasToken(el, SEARCH_RESULT_TITLE_TOKENS))
    return true

  // Check ancestor with role="listitem" inside a search results container
  let current: Element | null = el.parentElement
  while (current) {
    if (current.getAttribute("role") === "listitem") {
      // Check if this listitem is inside a search container
      let container: Element | null = current.parentElement
      while (container) {
        if (hasToken(container, SEARCH_CONTAINER_TOKENS))
          return true
        container = container.parentElement
      }
    }
    current = current.parentElement
  }
  return false
}

function isProductTitle(el: Element): boolean {
  return hasToken(el, PRODUCT_TITLE_TOKENS)
}

function isNumericText(text: string): boolean {
  const NUMERIC_PATTERN = /^[\d\s,.-]+$/
  const CONTAINS_DIGIT_RE = /\d/

  const cleaned = text.trim()
  if (!cleaned)
    return false
  if (!NUMERIC_PATTERN.test(cleaned))
    return false
  return CONTAINS_DIGIT_RE.test(cleaned)
}

function isShortHeadingException(el: Element): boolean {
  const tag = el.tagName
  if (tag === "H1" || tag === "H2" || tag === "H3")
    return true
  if (tag === "FIGCAPTION")
    return true
  if (tag === "BLOCKQUOTE")
    return true
  // blockquote descendant
  if (hasAncestorTag(el, "blockquote"))
    return true
  // search result title
  if (isSearchResultTitle(el))
    return true
  // product title
  if (isProductTitle(el))
    return true
  return false
}

function countWords(text: string): number {
  try {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" })
    return [...segmenter.segment(text)].filter(s => s.isWordLike).length
  }
  catch {
    // Fallback: whitespace splitting
    return text.trim().split(/\s+/).filter(w => w.length > 0).length
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────

export function shouldTranslateSmartParagraph(
  element: HTMLElement,
  options: SmartParagraphFilterOptions,
): SmartParagraphDecision {
  // 1. User decision overrides everything
  if (options.userDecision === "exclude") {
    return { shouldTranslate: false, forced: true, reason: "user-exclude" }
  }
  if (options.userDecision === "include") {
    return { shouldTranslate: true, forced: true, reason: "user-include" }
  }

  // 2. Hidden check
  if (isHidden(element)) {
    return { shouldTranslate: false, forced: false, reason: "hidden" }
  }

  // 3. TOC containers (before nav – TOC is more specific)
  if (isInsideTOC(element)) {
    return { shouldTranslate: false, forced: false, reason: "toc" }
  }

  // 4. Navigation containers
  if (isInsideNavContainer(element)) {
    return { shouldTranslate: false, forced: false, reason: "navigation" }
  }

  // 5. Controls
  if (isControl(element)) {
    return { shouldTranslate: false, forced: false, reason: "control" }
  }

  // 6. Code
  if (isCode(element)) {
    return { shouldTranslate: false, forced: false, reason: "code" }
  }

  // 7. Recommendation / ad / newsletter / share
  if (isRecommendation(element)) {
    return { shouldTranslate: false, forced: false, reason: "recommendation" }
  }

  // 8. Visible comments pass through (small-filter override)
  if (isCommentContent(element)) {
    return { shouldTranslate: true, forced: false, reason: "comment" }
  }

  const text = element.textContent?.trim() ?? ""

  // 9. Numeric-only check
  if (isNumericText(text)) {
    return { shouldTranslate: false, forced: false, reason: "numeric" }
  }

  // 10. Short-content exceptions (pass even below thresholds)
  if (isShortHeadingException(element)) {
    return { shouldTranslate: true, forced: false, reason: "short-heading-exception" }
  }

  // 11. Small filtering (character count)
  if (text.length < options.minCharacters) {
    return { shouldTranslate: false, forced: false, reason: "short-text" }
  }

  // 12. Small filtering (word count)
  if (options.minWords > 0) {
    const words = countWords(text)
    if (words < options.minWords) {
      return { shouldTranslate: false, forced: false, reason: "short-text" }
    }
  }

  // 13. Default pass
  return { shouldTranslate: true, forced: false, reason: "long-text" }
}
