import { describe, expect, it } from "vitest"
import { configSchema } from "@/types/config/config"
import { DEFAULT_CONFIG } from "@/utils/constants/config"

describe("init smart range backward compatibility", () => {
  it("fills smart defaults when old config lacks translate.page.smart", () => {
    const oldConfig = structuredClone(DEFAULT_CONFIG)
    // Simulate an old config that does not have the smart field
    delete (oldConfig.translate.page as Record<string, unknown>).smart

    const result = configSchema.safeParse(oldConfig)

    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.translate.page.smart).toEqual({
      customRules: "",
      debug: false,
    })
    expect(result.data.translate.page.range).toBe("main")
  })

  it("preserves \"all\" range when existing config has range \"all\"", () => {
    const configWithAllRange = structuredClone(DEFAULT_CONFIG)
    configWithAllRange.translate.page.range = "all"

    const result = configSchema.safeParse(configWithAllRange)

    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.translate.page.range).toBe("all")
  })

  it("accepts \"smart\" range via full config schema", () => {
    const configWithSmartRange = structuredClone(DEFAULT_CONFIG)
    configWithSmartRange.translate.page.range = "smart"

    const result = configSchema.safeParse(configWithSmartRange)

    expect(result.success).toBe(true)
    if (!result.success)
      return
    expect(result.data.translate.page.range).toBe("smart")
  })
})
