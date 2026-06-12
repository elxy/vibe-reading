import { describe, expect, it } from "vitest"
import { migrate } from "../../migration-scripts/v078-to-v079"

describe("v078-to-v079 migration", () => {
  it("removes languageDetection", () => {
    const migrated = migrate({
      language: {
        sourceCode: "auto",
        targetCode: "cmn",
      },
      languageDetection: {
        mode: "llm",
        providerId: "openai-default",
      },
    })

    expect(migrated).toEqual({
      language: {
        sourceCode: "auto",
        targetCode: "cmn",
      },
    })
  })

  it("is idempotent", () => {
    const config = {
      language: {
        sourceCode: "auto",
        targetCode: "cmn",
      },
    }

    expect(migrate(config)).toEqual(config)
  })
})
