import { describe, expect, it } from "vitest"
import { migrate } from "../../migration-scripts/v077-to-v078"

describe("v077-to-v078 migration", () => {
  it("removes siteControl", () => {
    const migrated = migrate({
      language: {
        sourceCode: "auto",
        targetCode: "cmn",
      },
      siteControl: {
        mode: "blacklist",
        blacklistPatterns: ["example.com"],
        whitelistPatterns: [],
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
