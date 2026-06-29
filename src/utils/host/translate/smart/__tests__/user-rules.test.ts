// @vitest-environment jsdom

import type { ParsedSmartRule } from "../user-rules"
import { describe, expect, it } from "vitest"
import {
  doesSmartRuleMatchHostname,
  matchSmartRulesForElement,
  parseSmartRules,
} from "../user-rules"

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeRule(overrides?: Partial<ParsedSmartRule>): ParsedSmartRule {
  return {
    action: "include",
    domainPattern: "example.com",
    selector: "div",
    line: 1,
    ...overrides,
  }
}

// ─── parseSmartRules ────────────────────────────────────────────────────────

describe("parseSmartRules", () => {
  // 1. include rule parsing
  it("parses a simple include rule", () => {
    const result = parseSmartRules("example.com article")
    expect(result.errors).toHaveLength(0)
    expect(result.rules).toHaveLength(1)
    expect(result.rules[0]).toEqual({
      action: "include",
      domainPattern: "example.com",
      selector: "article",
      line: 1,
    })
  })

  it("parses include rule with complex selector", () => {
    const result = parseSmartRules("example.com .article-body p")
    expect(result.errors).toHaveLength(0)
    expect(result.rules).toHaveLength(1)
    expect(result.rules[0]).toEqual({
      action: "include",
      domainPattern: "example.com",
      selector: ".article-body p",
      line: 1,
    })
  })

  // 2. exclude rule parsing
  it("parses a simple exclude rule", () => {
    const result = parseSmartRules("!example.com .sidebar")
    expect(result.errors).toHaveLength(0)
    expect(result.rules).toHaveLength(1)
    expect(result.rules[0]).toEqual({
      action: "exclude",
      domainPattern: "example.com",
      selector: ".sidebar",
      line: 1,
    })
  })

  it("parses a global exclude rule with *", () => {
    const result = parseSmartRules("!* .global-ignore")
    expect(result.errors).toHaveLength(0)
    expect(result.rules).toHaveLength(1)
    expect(result.rules[0]).toEqual({
      action: "exclude",
      domainPattern: "*",
      selector: ".global-ignore",
      line: 1,
    })
  })

  it("parses a global include rule with *", () => {
    const result = parseSmartRules("* .global-force")
    expect(result.errors).toHaveLength(0)
    expect(result.rules).toHaveLength(1)
    expect(result.rules[0]).toEqual({
      action: "include",
      domainPattern: "*",
      selector: ".global-force",
      line: 1,
    })
  })

  it("parses exact domain match rule", () => {
    const result = parseSmartRules("=example.com main")
    expect(result.errors).toHaveLength(0)
    expect(result.rules).toHaveLength(1)
    expect(result.rules[0]).toEqual({
      action: "include",
      domainPattern: "=example.com",
      selector: "main",
      line: 1,
    })
  })

  it("parses subdomain-only rule", () => {
    const result = parseSmartRules("*.example.com .article-body")
    expect(result.errors).toHaveLength(0)
    expect(result.rules).toHaveLength(1)
    expect(result.rules[0]).toEqual({
      action: "include",
      domainPattern: "*.example.com",
      selector: ".article-body",
      line: 1,
    })
  })

  // 3. blank lines ignored
  it("ignores blank lines", () => {
    const result = parseSmartRules("example.com article\n\n\n*.example.com .body")
    expect(result.errors).toHaveLength(0)
    expect(result.rules).toHaveLength(2)
  })

  it("ignores whitespace-only lines", () => {
    const result = parseSmartRules("   \nexample.com article\n\t\n  ")
    expect(result.errors).toHaveLength(0)
    expect(result.rules).toHaveLength(1)
    expect(result.rules[0].domainPattern).toBe("example.com")
  })

  // Comments
  it("ignores lines starting with //", () => {
    const result = parseSmartRules("// This is a comment\nexample.com article")
    expect(result.errors).toHaveLength(0)
    expect(result.rules).toHaveLength(1)
  })

  it("does not treat ! as a comment marker", () => {
    const result = parseSmartRules("!example.com .sidebar")
    expect(result.errors).toHaveLength(0)
    expect(result.rules).toHaveLength(1)
    expect(result.rules[0].action).toBe("exclude")
  })

  // 4. invalid line without whitespace yields error
  it("reports error for line without whitespace", () => {
    const result = parseSmartRules("example.com")
    expect(result.rules).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toEqual({
      line: 1,
      text: "example.com",
      message: expect.stringContaining("missing selector") as string,
    })
  })

  it("reports error for exclude rule without whitespace", () => {
    const result = parseSmartRules("!example.com")
    expect(result.rules).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toEqual({
      line: 1,
      text: "!example.com",
      message: expect.stringContaining("missing selector") as string,
    })
  })

  // 5. invalid CSS selector yields error
  it("reports error for invalid CSS selector", () => {
    const result = parseSmartRules("example.com !!!invalid!!!")
    expect(result.rules).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toEqual({
      line: 1,
      text: "example.com !!!invalid!!!",
      message: expect.stringContaining("Invalid CSS selector") as string,
    })
  })

  // 6. #@# yields unsupported syntax error
  it("reports error for #@# exception syntax", () => {
    const result = parseSmartRules("example.com#@#.ad")
    expect(result.rules).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toEqual({
      line: 1,
      text: "example.com#@#.ad",
      message: expect.stringContaining("#@#") as string,
    })
  })

  it("reports error for #@# with domain and selector", () => {
    const result = parseSmartRules("example.com#@#.something")
    expect(result.rules).toHaveLength(0)
    expect(result.errors).toHaveLength(1)
  })

  // Continues parsing after errors
  it("continues parsing after encountering errors", () => {
    const input = [
      "invalid",
      "example.com article",
      "also-invalid",
      "!example.net .sidebar",
    ].join("\n")
    const result = parseSmartRules(input)
    expect(result.errors).toHaveLength(2)
    expect(result.rules).toHaveLength(2)
    expect(result.rules[0].selector).toBe("article")
    expect(result.rules[1].selector).toBe(".sidebar")
  })

  // Empty input
  it("returns empty result for empty input", () => {
    const result = parseSmartRules("")
    expect(result.rules).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
  })
})

// ─── doesSmartRuleMatchHostname ─────────────────────────────────────────────

describe("doesSmartRuleMatchHostname", () => {
  // 7. example.com matches root and subdomains
  describe("default pattern (root + any subdomain)", () => {
    const rule = makeRule({ domainPattern: "example.com" })

    it("matches the root domain", () => {
      expect(doesSmartRuleMatchHostname(rule, "example.com")).toBe(true)
    })

    it("matches direct subdomain", () => {
      expect(doesSmartRuleMatchHostname(rule, "www.example.com")).toBe(true)
    })

    it("matches deep subdomain", () => {
      expect(doesSmartRuleMatchHostname(rule, "blog.www.example.com")).toBe(true)
    })

    it("does not match a completely different domain", () => {
      expect(doesSmartRuleMatchHostname(rule, "other.org")).toBe(false)
    })

    it("does not match a domain that merely contains the pattern as substring", () => {
      expect(doesSmartRuleMatchHostname(rule, "notexample.com")).toBe(false)
    })

    it("does not match a domain with suffix overlap", () => {
      expect(doesSmartRuleMatchHostname(rule, "badexample.com")).toBe(false)
    })
  })

  // 8. =example.com matches exact root only
  describe("exact pattern (=host)", () => {
    const rule = makeRule({ domainPattern: "=example.com" })

    it("matches the exact root domain", () => {
      expect(doesSmartRuleMatchHostname(rule, "example.com")).toBe(true)
    })

    it("does not match a subdomain", () => {
      expect(doesSmartRuleMatchHostname(rule, "www.example.com")).toBe(false)
    })

    it("does not match a different domain", () => {
      expect(doesSmartRuleMatchHostname(rule, "other.com")).toBe(false)
    })

    it("is case-insensitive", () => {
      expect(doesSmartRuleMatchHostname(rule, "EXAMPLE.COM")).toBe(true)
    })
  })

  // 9. *.example.com matches subdomains only
  describe("subdomain-only pattern (*.host)", () => {
    const rule = makeRule({ domainPattern: "*.example.com" })

    it("matches a single subdomain", () => {
      expect(doesSmartRuleMatchHostname(rule, "www.example.com")).toBe(true)
    })

    it("matches a deep subdomain", () => {
      expect(doesSmartRuleMatchHostname(rule, "a.b.example.com")).toBe(true)
    })

    it("does not match the root domain", () => {
      expect(doesSmartRuleMatchHostname(rule, "example.com")).toBe(false)
    })

    it("does not match an unrelated domain", () => {
      expect(doesSmartRuleMatchHostname(rule, "other.org")).toBe(false)
    })

    it("is case-insensitive", () => {
      expect(doesSmartRuleMatchHostname(rule, "WWW.EXAMPLE.COM")).toBe(true)
    })
  })

  // 10. * matches all hosts
  describe("wildcard pattern (*)", () => {
    const rule = makeRule({ domainPattern: "*" })

    it("matches any domain", () => {
      expect(doesSmartRuleMatchHostname(rule, "anything.example.com")).toBe(true)
    })

    it("matches localhost", () => {
      expect(doesSmartRuleMatchHostname(rule, "localhost")).toBe(true)
    })

    it("matches any TLD", () => {
      expect(doesSmartRuleMatchHostname(rule, "some.random.site.io")).toBe(true)
    })

    it("matches empty string", () => {
      expect(doesSmartRuleMatchHostname(rule, "")).toBe(true)
    })
  })
})

// ─── matchSmartRulesForElement ──────────────────────────────────────────────

describe("matchSmartRulesForElement", () => {
  // 11. element matching with matches and closest behavior
  describe("element matching", () => {
    it("matches element itself via selector", () => {
      const article = document.createElement("div")
      article.className = "article"
      const rules = [makeRule({ selector: ".article" })]
      const result = matchSmartRulesForElement(article, "example.com", rules)
      expect(result.action).toBe("include")
      expect(result.matchedRules).toHaveLength(1)
    })

    it("matches a child element inside a matching ancestor", () => {
      const article = document.createElement("div")
      article.className = "article"
      const paragraph = document.createElement("p")
      paragraph.textContent = "Some text"
      article.appendChild(paragraph)
      const rules = [makeRule({ selector: ".article" })]
      const result = matchSmartRulesForElement(paragraph, "example.com", rules)
      expect(result.action).toBe("include")
      expect(result.matchedRules).toHaveLength(1)
    })

    it("does not match an unrelated element", () => {
      const element = document.createElement("span")
      element.className = "unrelated"
      const rules = [makeRule({ selector: ".article" })]
      const result = matchSmartRulesForElement(element, "example.com", rules)
      expect(result.action).toBeNull()
      expect(result.matchedRules).toHaveLength(0)
    })

    it("does not match when hostname differs", () => {
      const element = document.createElement("div")
      element.className = "article"
      const rules = [makeRule({ selector: ".article" })]
      const result = matchSmartRulesForElement(element, "other.org", rules)
      expect(result.action).toBeNull()
      expect(result.matchedRules).toHaveLength(0)
    })

    it("matches deep descendant via ancestor closest", () => {
      const article = document.createElement("div")
      article.className = "article"
      const inner = document.createElement("div")
      const deep = document.createElement("span")
      deep.textContent = "deep"
      inner.appendChild(deep)
      article.appendChild(inner)
      const rules = [makeRule({ selector: ".article" })]
      const result = matchSmartRulesForElement(deep, "example.com", rules)
      expect(result.action).toBe("include")
      expect(result.matchedRules).toHaveLength(1)
    })
  })

  // 12. include-only returns include
  it("returns include when only include rules match", () => {
    const element = document.createElement("div")
    element.className = "article"
    const rules = [
      makeRule({ selector: ".article", action: "include" }),
      makeRule({ selector: ".header", action: "include" }),
    ]
    const result = matchSmartRulesForElement(element, "example.com", rules)
    expect(result.action).toBe("include")
    expect(result.matchedRules).toHaveLength(1) // only .article matches
  })

  // 13. exclude-only returns exclude
  it("returns exclude when only exclude rules match", () => {
    const element = document.createElement("div")
    element.className = "sidebar"
    const rules = [
      makeRule({ selector: ".sidebar", action: "exclude" }),
    ]
    const result = matchSmartRulesForElement(element, "example.com", rules)
    expect(result.action).toBe("exclude")
    expect(result.matchedRules).toHaveLength(1)
  })

  // 14. include + exclude conflict returns exclude
  it("returns exclude when both include and exclude rules match", () => {
    const element = document.createElement("div")
    element.className = "article sidebar"
    const rules = [
      makeRule({ selector: ".article", action: "include", line: 1 }),
      makeRule({ selector: ".sidebar", action: "exclude", line: 2 }),
    ]
    const result = matchSmartRulesForElement(element, "example.com", rules)
    expect(result.action).toBe("exclude")
    expect(result.matchedRules).toHaveLength(2)
  })

  // No match
  it("returns null action when no rules match", () => {
    const element = document.createElement("div")
    element.className = "content"
    const rules = [
      makeRule({ selector: ".article" }),
      makeRule({ selector: ".sidebar", action: "exclude" }),
    ]
    const result = matchSmartRulesForElement(element, "example.com", rules)
    expect(result.action).toBeNull()
    expect(result.matchedRules).toHaveLength(0)
  })

  // Hostname filtering
  it("only matches rules for the correct hostname", () => {
    const element = document.createElement("div")
    element.className = "content"
    const rules = [
      makeRule({ selector: ".content", domainPattern: "example.com", line: 1 }),
      makeRule({ selector: ".content", domainPattern: "other.org", line: 2 }),
      makeRule({ selector: ".content", domainPattern: "*", line: 3 }),
    ]
    const result = matchSmartRulesForElement(element, "example.com", rules)
    // Only example.com and * should match
    expect(result.matchedRules).toHaveLength(2)
    expect(result.matchedRules[0].line).toBe(1)
    expect(result.matchedRules[1].line).toBe(3)
  })
})
