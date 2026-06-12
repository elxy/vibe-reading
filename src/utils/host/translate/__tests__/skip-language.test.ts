import type { LangCodeISO6393 } from "@/definitions"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { detectLanguage } from "@/utils/content/language"
import { shouldSkipByLanguage } from "../translate-text"

// Mock detectLanguage
vi.mock("@/utils/content/language", () => ({
  detectLanguage: vi.fn(),
}))

const mockedDetect = vi.mocked(detectLanguage)

beforeEach(() => {
  mockedDetect.mockReset()
})

describe("shouldSkipByLanguage", () => {
  describe("basic skip logic", () => {
    it("should return true when detected language is in skipLanguages", async () => {
      mockedDetect.mockResolvedValueOnce("jpn")

      const japaneseText = "これは日本語のテストです。日本語で書かれたテキストです。"
      const skipLanguages: LangCodeISO6393[] = ["jpn"]

      const result = await shouldSkipByLanguage(
        japaneseText,
        skipLanguages,
      )

      expect(result).toBe(true)
      expect(mockedDetect).toHaveBeenCalledWith(japaneseText, {
        minLength: 10,
      })
    })

    it("should return false when detected language is not in skipLanguages", async () => {
      mockedDetect.mockResolvedValueOnce("eng")

      const englishText = "This is a test written in English."
      const skipLanguages: LangCodeISO6393[] = ["jpn"]

      const result = await shouldSkipByLanguage(
        englishText,
        skipLanguages,
      )

      expect(result).toBe(false)
    })

    it("should return false when skipLanguages is empty", async () => {
      mockedDetect.mockResolvedValueOnce("jpn")

      const japaneseText = "これは日本語のテストです。日本語で書かれたテキストです。"
      const skipLanguages: LangCodeISO6393[] = []

      const result = await shouldSkipByLanguage(
        japaneseText,
        skipLanguages,
      )

      expect(result).toBe(false)
    })

    it("should return false when language cannot be detected", async () => {
      mockedDetect.mockResolvedValueOnce(null)

      const undetectableText = "12345 67890 !@#$%"
      const skipLanguages: LangCodeISO6393[] = ["jpn", "eng"]

      const result = await shouldSkipByLanguage(
        undetectableText,
        skipLanguages,
      )

      expect(result).toBe(false)
    })
  })

  describe("llm detection", () => {
    it("should return false when detectLanguage returns null", async () => {
      mockedDetect.mockResolvedValueOnce(null)

      const japaneseText = "これは日本語のテストです。日本語で書かれたテキストです。"
      const skipLanguages: LangCodeISO6393[] = ["jpn"]

      const result = await shouldSkipByLanguage(
        japaneseText,
        skipLanguages,
      )

      expect(mockedDetect).toHaveBeenCalled()
      expect(result).toBe(false) // null detection means no skip
    })

    it("should pass LLM options to detectLanguage", async () => {
      mockedDetect.mockResolvedValueOnce("jpn")

      const japaneseText = "これは日本語のテストです。日本語で書かれたテキストです。"
      const skipLanguages: LangCodeISO6393[] = ["jpn"]

      await shouldSkipByLanguage(
        japaneseText,
        skipLanguages,
      )

      expect(mockedDetect).toHaveBeenCalledWith(japaneseText, {
        minLength: 10,
      })
    })
  })
})
