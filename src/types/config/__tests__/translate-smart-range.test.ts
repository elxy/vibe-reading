import { describe, expect, it } from "vitest"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import {
  SMART_CONTENT_DETECTION_TIMEOUT_MS,
  SMART_DEFAULT_MIN_CHARACTERS_PER_NODE,
  SMART_DEFAULT_MIN_WORDS_PER_NODE,
} from "@/utils/constants/translate"
import { pageTranslateRangeSchema } from "../translate"

describe("translate smart range", () => {
  it("accepts \"smart\" as a valid page translate range", () => {
    const result = pageTranslateRangeSchema.safeParse("smart")

    expect(result.success).toBe(true)
    expect(result.data).toBe("smart")
  })

  it("rejects an invalid range value like \"custom\"", () => {
    const result = pageTranslateRangeSchema.safeParse("custom")

    expect(result.success).toBe(false)
  })

  it("default config range is \"main\"", () => {
    expect(DEFAULT_CONFIG.translate.page.range).toBe("main")
  })

  it("default config smart is { customRules: '', debug: false }", () => {
    expect(DEFAULT_CONFIG.translate.page.smart).toEqual({
      customRules: "",
      debug: false,
    })
  })

  it("smart default min characters per node is 40", () => {
    expect(SMART_DEFAULT_MIN_CHARACTERS_PER_NODE).toBe(40)
  })

  it("smart default min words per node is 8", () => {
    expect(SMART_DEFAULT_MIN_WORDS_PER_NODE).toBe(8)
  })

  it("smart content detection timeout is 500 ms", () => {
    expect(SMART_CONTENT_DETECTION_TIMEOUT_MS).toBe(500)
  })
})
