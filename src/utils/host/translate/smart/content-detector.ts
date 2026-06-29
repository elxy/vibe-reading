import type { SmartParagraphFilterOptions } from "./paragraph-filter"
import { shouldTranslateSmartParagraph } from "./paragraph-filter"

// ─── Public types ──────────────────────────────────────────────────────────

export type SmartContentDetectionSource = "lightweight" | "defuddle" | "body"
export type SmartContentConfidence = "high" | "medium" | "low"

export interface SmartContentCandidateDebug {
  selector: string
  score: number
  reason: string
}

export interface SmartContentDetectionDebug {
  candidates: SmartContentCandidateDebug[]
  fallbackReason?: string
}

export interface SmartContentDetectionResult {
  root: HTMLElement
  source: SmartContentDetectionSource
  confidence: SmartContentConfidence
  debug: SmartContentDetectionDebug
}

export interface DetectSmartContentRootOptions {
  hostname: string
  timeoutMs: number
  debug: boolean
}

// ─── Constants ─────────────────────────────────────────────────────────────

const CANDIDATE_SELECTORS: readonly string[] = [
  "article",
  "main",
  "[role=\"main\"]",
  "[role=\"article\"]",
  ".post-content",
  ".post-body",
  ".article-content",
  ".article-body",
  ".entry-content",
  ".markdown-body",
  "#content",
  "body",
]

const ARTICLE_LIKE_TAGS = new Set(["ARTICLE", "MAIN"])

const ARTICLE_LIKE_CLASSES: readonly string[] = [
  "post-content",
  "post-body",
  "article-content",
  "article-body",
  "entry-content",
  "markdown-body",
]

const CONTENT_BLOCK_SELECTOR = "p, h1, h2, h3, h4, h5, h6, li, td, dt, dd, blockquote, figcaption"

const CONTAINER_TAGS = new Set(["NAV", "HEADER", "FOOTER", "ASIDE"])

const TOC_TOKENS: readonly string[] = [
  "toc",
  "table-of-contents",
  "tableofcontents",
  "on-this-page",
]

const RECOMMENDATION_TOKENS: readonly string[] = [
  "related",
  "recommended",
  "newsletter",
  "subscribe",
  "share",
  "social",
  "sponsored",
  "advert",
  "ad-",
  "you-may-also-like",
  "more-from",
  "popular",
  "trending",
  "read-next",
]

// ─── Scoring weights ───────────────────────────────────────────────────────

const WORD_SCORE_FACTOR = 1.5
const PARAGRAPH_SCORE_PER = 0.3
const MAX_PARAGRAPH_COUNT = 15
const HEADING_SCORE_PER = 0.2
const MAX_HEADING_COUNT = 10
const SEMANTIC_TAG_BONUS = 3
const SEMANTIC_CLASS_BONUS = 2
const CONTAINER_PENALTY = 3
const TOKEN_PENALTY = 4
const LOW_WORD_COUNT_THRESHOLD = 30
const LOW_WORD_PENALTY = 3
const LINK_DENSITY_THRESHOLD = 0.3
const LINK_DENSITY_PENALTY_FACTOR = 10

// ─── Defuddle thresholds ──────────────────────────────────────────────────

const ARTICLE_MIN_WORDS = 50
const ARTICLE_MIN_PARAGRAPHS = 3
const ARTICLE_MAX_LINK_DENSITY = 0.5

// ─── Minimum score for a non-body candidate to be considered "good" ────────

const MIN_NON_BODY_SCORE = 0.5

// ─── Helpers ───────────────────────────────────────────────────────────────

function countWords(text: string): number {
  try {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "word" })
    return [...segmenter.segment(text)].filter(s => s.isWordLike).length
  }
  catch {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length
  }
}

function getReadableWordCount(el: Element, hostname: string): number {
  const blockElements = el.querySelectorAll(CONTENT_BLOCK_SELECTOR)
  let totalWords = 0
  const filterOptions: SmartParagraphFilterOptions = {
    hostname,
    minCharacters: 20,
    minWords: 3,
  }
  for (const block of blockElements) {
    if (block instanceof HTMLElement) {
      const decision = shouldTranslateSmartParagraph(block, filterOptions)
      if (decision.shouldTranslate) {
        totalWords += countWords(block.textContent ?? "")
      }
    }
  }
  return totalWords
}

function getParagraphCount(el: Element): number {
  return el.querySelectorAll("p").length
}

function getHeadingCount(el: Element): number {
  return el.querySelectorAll("h1, h2, h3, h4, h5, h6").length
}

function getLinkDensity(el: Element): number {
  const totalText = el.textContent ?? ""
  if (totalText.length === 0)
    return 0

  let linkTextLength = 0
  const links = el.querySelectorAll("a")
  for (const link of links) {
    linkTextLength += (link.textContent ?? "").length
  }
  return linkTextLength / totalText.length
}

function elementMatchesToken(el: Element, tokens: readonly string[]): boolean {
  const text = [
    el.className?.toString() ?? "",
    el.id,
    el.getAttribute("aria-label") ?? "",
  ]
    .join(" ")
    .toLowerCase()
  return tokens.some(t => text.includes(t))
}

function isArticleLike(el: Element): boolean {
  if (ARTICLE_LIKE_TAGS.has(el.tagName))
    return true

  const classText = (el.className?.toString() ?? "").toLowerCase()
  const idText = (el.id ?? "").toLowerCase()
  const combined = `${classText} ${idText}`

  return ARTICLE_LIKE_CLASSES.some(cls => combined.includes(cls))
}

// ─── Scoring ────────────────────────────────────────────────────────────────

function buildReason(parts: string[]): string {
  return parts.join(", ") || "no-signal"
}

function scoreElement(el: Element, selector: string, hostname: string): SmartContentCandidateDebug {
  const wordCount = getReadableWordCount(el, hostname)
  const paragraphCount = getParagraphCount(el)
  const headingCount = getHeadingCount(el)
  const linkDensity = getLinkDensity(el)

  let score = 0
  const reasons: string[] = []

  // Word count score (logarithmic to avoid body dominating)
  const wordScore = Math.log2(Math.max(1, wordCount)) * WORD_SCORE_FACTOR
  score += wordScore

  // Paragraph count score
  const paraScore = Math.min(paragraphCount, MAX_PARAGRAPH_COUNT) * PARAGRAPH_SCORE_PER
  score += paraScore
  if (paragraphCount > 0)
    reasons.push(`p=${paragraphCount}`)

  // Heading count score
  const headingScore = Math.min(headingCount, MAX_HEADING_COUNT) * HEADING_SCORE_PER
  score += headingScore
  if (headingCount > 0)
    reasons.push(`h=${headingCount}`)

  // Semantic bonus
  if (ARTICLE_LIKE_TAGS.has(el.tagName)) {
    score += SEMANTIC_TAG_BONUS
    reasons.push(`tag=${el.tagName.toLowerCase()}`)
  }
  else if (isArticleLike(el)) {
    score += SEMANTIC_CLASS_BONUS
    reasons.push("content-class")
  }

  // Container penalty
  if (CONTAINER_TAGS.has(el.tagName)) {
    score -= CONTAINER_PENALTY
    reasons.push(`container=${el.tagName.toLowerCase()}`)
  }

  // Link density penalty
  if (linkDensity > LINK_DENSITY_THRESHOLD) {
    const penalty = Math.min(
      (linkDensity - LINK_DENSITY_THRESHOLD) * LINK_DENSITY_PENALTY_FACTOR,
      5,
    )
    score -= penalty
    reasons.push(`links=${linkDensity.toFixed(2)}`)
  }

  // Token penalties
  if (elementMatchesToken(el, TOC_TOKENS)) {
    score -= TOKEN_PENALTY
    reasons.push("toc")
  }
  if (elementMatchesToken(el, RECOMMENDATION_TOKENS)) {
    score -= TOKEN_PENALTY
    reasons.push("rec-ads")
  }

  // Low word count penalty
  if (wordCount < LOW_WORD_COUNT_THRESHOLD) {
    score -= LOW_WORD_PENALTY
    reasons.push(`low-text(${wordCount}w)`)
  }

  return {
    selector,
    score: Math.round(score * 100) / 100,
    reason: buildReason(reasons),
  }
}

// ─── Article-like detection ─────────────────────────────────────────────────

function isBestArticleLike(best: SmartContentCandidateDebug, el: Element, hostname: string): boolean {
  if (!isArticleLike(el))
    return false

  const wordCount = getReadableWordCount(el, hostname)
  const paragraphCount = getParagraphCount(el)
  const linkDensity = getLinkDensity(el)

  return (
    wordCount >= ARTICLE_MIN_WORDS
    && paragraphCount >= ARTICLE_MIN_PARAGRAPHS
    && linkDensity <= ARTICLE_MAX_LINK_DENSITY
  )
}

// ─── Defuddle ───────────────────────────────────────────────────────────────

interface DefuddleOutput {
  debug?: {
    selector?: string
  }
}

type DefuddleAttempt
  = | { success: true, element: HTMLElement }
    | { success: false, reason: string }

async function tryDefuddle(
  doc: Document,
  hostname: string,
  timeoutMs: number,
): Promise<DefuddleAttempt> {
  const timeoutPromise = new Promise<DefuddleAttempt>((resolve) => {
    setTimeout(resolve, timeoutMs, { success: false, reason: "defuddle-timeout" })
  })

  const defuddlePromise = (async (): Promise<DefuddleAttempt> => {
    try {
      const { default: Defuddle } = await import("defuddle/full")
      const snapshotDoc = document.implementation.createHTMLDocument(doc.title)
      snapshotDoc.documentElement.innerHTML = doc.documentElement.outerHTML

      // Promise.resolve handles both sync (real Defuddle) and
      // thenable (test mock) parse results transparently.
      const rawResult: unknown = new Defuddle(snapshotDoc, {
        url: `https://${hostname}`,
        useAsync: false,
        separateMarkdown: true,
      }).parse()
      const result = (await Promise.resolve(rawResult)) as DefuddleOutput

      const selector = result?.debug?.selector
      if (selector) {
        const el = doc.querySelector(selector)
        if (el instanceof HTMLElement) {
          return { success: true, element: el }
        }
        return { success: false, reason: "defuddle-selector-not-found" }
      }
      return { success: false, reason: "defuddle-no-selector" }
    }
    catch {
      return { success: false, reason: "defuddle-error" }
    }
  })()

  return Promise.race([defuddlePromise, timeoutPromise])
}

// ─── Main ──────────────────────────────────────────────────────────────────

export async function detectSmartContentRoot(
  doc: Document,
  options: DetectSmartContentRootOptions,
): Promise<SmartContentDetectionResult> {
  const candidates: SmartContentCandidateDebug[] = []
  const scoredElements = new Set<Element>()

  for (const selector of CANDIDATE_SELECTORS) {
    try {
      const el = doc.querySelector(selector)
      if (!el || scoredElements.has(el))
        continue
      scoredElements.add(el)

      const candidate = scoreElement(el, selector, options.hostname)
      candidates.push(candidate)
    }
    catch {
      // Skip invalid selectors (should not happen with our list)
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score)

  // Find the best non-body candidate
  const nonBodyCandidates = candidates.filter(c => c.selector !== "body")
  const bestNonBody = nonBodyCandidates[0] // highest score

  // Fallback: no good non-body candidate → use body
  if (!bestNonBody || bestNonBody.score < MIN_NON_BODY_SCORE) {
    return {
      root: doc.body,
      source: "body",
      confidence: "low",
      debug: {
        candidates: options.debug ? candidates : [],
        fallbackReason: "no-reliable-candidate",
      },
    }
  }

  const bestEl = doc.querySelector(bestNonBody.selector)
  if (!(bestEl instanceof HTMLElement)) {
    return {
      root: doc.body,
      source: "body",
      confidence: "low",
      debug: {
        candidates: options.debug ? candidates : [],
        fallbackReason: "no-reliable-candidate",
      },
    }
  }

  // Determine lightweight confidence
  const lightweightConfidence: SmartContentConfidence
    = bestNonBody.score > 5
      ? "high"
      : bestNonBody.score > 2
        ? "medium"
        : "low"

  // Try Defuddle if article-like
  if (isBestArticleLike(bestNonBody, bestEl, options.hostname)) {
    const defuddleResult = await tryDefuddle(doc, options.hostname, options.timeoutMs)

    if (defuddleResult.success) {
      // Defuddle found an element — use it if it scores at least as well
      const defuddleDebug = scoreElement(
        defuddleResult.element,
        "<defuddle>",
        options.hostname,
      )
      if (defuddleDebug.score >= bestNonBody.score) {
        return {
          root: defuddleResult.element,
          source: "defuddle",
          confidence: "high",
          debug: {
            candidates: options.debug ? candidates : [],
          },
        }
      }
    }

    // Defuddle failed or returned worse element → lightweight with reason
    return {
      root: bestEl,
      source: "lightweight",
      confidence: lightweightConfidence,
      debug: {
        candidates: options.debug ? candidates : [],
        fallbackReason: defuddleResult.success ? undefined : defuddleResult.reason,
      },
    }
  }

  // No Defuddle attempt → pure lightweight
  return {
    root: bestEl,
    source: "lightweight",
    confidence: lightweightConfidence,
    debug: {
      candidates: options.debug ? candidates : [],
    },
  }
}
