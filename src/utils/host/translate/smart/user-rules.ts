export type SmartRuleAction = "include" | "exclude"

export interface ParsedSmartRule {
  action: SmartRuleAction
  domainPattern: string
  selector: string
  line: number
}

export interface SmartRuleParseError {
  line: number
  text: string
  message: string
}

export interface SmartRuleParseResult {
  rules: ParsedSmartRule[]
  errors: SmartRuleParseError[]
}

export interface SmartRuleDecision {
  action: SmartRuleAction | null
  matchedRules: ParsedSmartRule[]
}

/** Unsupported AdBlock exception syntax marker. */
const UNSUPPORTED_MARKER = "#@#"

/**
 * Parse a multiline rules text into structured rules and parse errors.
 *
 * Lines are processed one-by-one:
 * - Blank lines are ignored.
 * - Lines starting with `//` are treated as comments.
 * - Lines containing `#@#` are rejected with an unsupported-syntax error.
 * - Leading `!` means `exclude`, otherwise `include`.
 * - Domain pattern and CSS selector are separated by at least one whitespace.
 * - CSS selector is validated via `document.createElement("div").matches()`.
 */
export function parseSmartRules(input: string): SmartRuleParseResult {
  const rules: ParsedSmartRule[] = []
  const errors: SmartRuleParseError[] = []
  const lines = input.split("\n")

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1
    const raw = lines[i]
    const trimmed = raw.trim()

    // Blank line
    if (trimmed === "")
      continue

    // Comment line
    if (trimmed.startsWith("//"))
      continue

    // Unsupported AdBlock exception syntax
    if (trimmed.includes(UNSUPPORTED_MARKER)) {
      errors.push({
        line: lineNumber,
        text: raw,
        message: "Unsupported rule syntax: #@# exception is not supported",
      })
      continue
    }

    // Determine action
    let action: SmartRuleAction
    let remaining: string
    if (trimmed.startsWith("!")) {
      action = "exclude"
      remaining = trimmed.slice(1).trim()
    }
    else {
      action = "include"
      remaining = trimmed
    }

    // Split domain pattern and selector on first whitespace
    const wsIndex = remaining.search(/\s/)
    if (wsIndex === -1) {
      errors.push({
        line: lineNumber,
        text: raw,
        message: "Invalid rule: missing selector (expected a whitespace between domain pattern and CSS selector)",
      })
      continue
    }

    const domainPattern = remaining.slice(0, wsIndex).trim()
    const selector = remaining.slice(wsIndex + 1).trim()

    // Validate domain is non-empty
    if (domainPattern === "") {
      errors.push({
        line: lineNumber,
        text: raw,
        message: "Invalid rule: domain pattern is empty",
      })
      continue
    }

    // Validate selector is non-empty
    if (selector === "") {
      errors.push({
        line: lineNumber,
        text: raw,
        message: "Invalid rule: CSS selector is empty",
      })
      continue
    }

    // Validate CSS selector syntax
    try {
      // Use a detached div to test selector validity
      document.createElement("div").matches(selector)
    }
    catch {
      errors.push({
        line: lineNumber,
        text: raw,
        message: `Invalid CSS selector: "${selector}"`,
      })
      continue
    }

    rules.push({
      action,
      domainPattern,
      selector,
      line: lineNumber,
    })
  }

  return { rules, errors }
}

/**
 * Check whether a parsed rule's domain pattern matches the given hostname.
 *
 * Pattern semantics:
 * - `*`          → matches any hostname.
 * - `=host`      → exact match only.
 * - `*.host`     → subdomains only (e.g. `www.example.com` but not `example.com`).
 * - `host`       → root domain and any subdomain.
 */
export function doesSmartRuleMatchHostname(
  rule: ParsedSmartRule,
  hostname: string,
): boolean {
  const pattern = rule.domainPattern
  const lowerHost = hostname.toLowerCase()

  // Wildcard
  if (pattern === "*")
    return true

  // Exact match
  if (pattern.startsWith("=")) {
    return lowerHost === pattern.slice(1).toLowerCase()
  }

  // Subdomain-only wildcard
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1).toLowerCase() // ".example.com"
    return lowerHost.endsWith(suffix)
  }

  // Default: root + any subdomain
  const lowerPattern = pattern.toLowerCase()
  return lowerHost === lowerPattern || lowerHost.endsWith(`.${lowerPattern}`)
}

/**
 * Match parsed rules against an element + hostname, returning the effective
 * user decision and all matching rules (for debug/UI display).
 *
 * Decision rules:
 * - If no rule matches, action is `null`.
 * - If only include rules match, action is `include`.
 * - If any exclude rule matches, action is `exclude` (exclude wins).
 */
export function matchSmartRulesForElement(
  element: Element,
  hostname: string,
  rules: ParsedSmartRule[],
): SmartRuleDecision {
  const matchedRules: ParsedSmartRule[] = []

  for (const rule of rules) {
    if (!doesSmartRuleMatchHostname(rule, hostname))
      continue

    // An element matches if the selector targets the element itself
    // or any ancestor (using `closest` which checks self first, then walks up).
    if (element.matches(rule.selector) || element.closest(rule.selector) !== null) {
      matchedRules.push(rule)
    }
  }

  if (matchedRules.length === 0) {
    return { action: null, matchedRules: [] }
  }

  const hasExclude = matchedRules.some(r => r.action === "exclude")
  return {
    action: hasExclude ? "exclude" : "include",
    matchedRules,
  }
}
