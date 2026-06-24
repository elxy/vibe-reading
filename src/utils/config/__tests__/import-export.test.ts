import type { ConfigExport } from "@/types/config/export"

import { beforeEach, describe, expect, it, vi } from "vitest"

import { configExportSchema } from "@/types/config/export"
import { DEFAULT_CONFIG } from "@/utils/constants/config"

const { getItemMock, setItemMock, setMetaMock } = vi.hoisted(() => ({
  getItemMock: vi.fn(),
  setItemMock: vi.fn(),
  setMetaMock: vi.fn(),
}))

vi.mock("#imports", () => ({
  storage: {
    getItem: getItemMock,
    setItem: setItemMock,
    setMeta: setMetaMock,
    watch: () => () => {},
  },
  browser: {
    runtime: {
      getManifest: () => ({ version: "1.0.0" }),
    },
  },
}))

vi.mock("wxt/utils/storage", () => ({
  storage: {
    getItem: getItemMock,
    setItem: setItemMock,
    setMeta: setMetaMock,
    watch: () => () => {},
  },
}))

vi.mock("file-saver", () => ({
  saveAs: vi.fn(),
}))

describe("config import/export", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("parseConfigExport", () => {
    it("rejects non-JSON text", async () => {
      const { parseConfigExport } = await import("../import-export")
      expect(() => parseConfigExport("not json")).toThrow(SyntaxError)
    })

    it("rejects payload with a missing or wrong version literal", async () => {
      const { parseConfigExport } = await import("../import-export")
      const bad = {
        vibeReadingExport: "v2",
        exportedAt: new Date().toISOString(),
        exportedBy: "1.0.0",
        data: { config: DEFAULT_CONFIG },
      }
      expect(() => parseConfigExport(JSON.stringify(bad))).toThrow()
    })

    it("rejects payload with an invalid inner config", async () => {
      const { parseConfigExport } = await import("../import-export")
      const bad = {
        vibeReadingExport: "v1",
        exportedAt: new Date().toISOString(),
        exportedBy: "1.0.0",
        data: { config: { language: "not-an-object" } },
      }
      expect(() => parseConfigExport(JSON.stringify(bad))).toThrow()
    })

    it("accepts a well-formed payload with a valid config", async () => {
      const { parseConfigExport } = await import("../import-export")
      const good: ConfigExport = {
        vibeReadingExport: "v1",
        exportedAt: new Date().toISOString(),
        exportedBy: "1.0.0",
        data: { config: structuredClone(DEFAULT_CONFIG), theme: "dark" },
      }
      const parsed = parseConfigExport(JSON.stringify(good))
      expect(parsed.data.theme).toBe("dark")
      expect(parsed.vibeReadingExport).toBe("v1")
    })
  })

  describe("buildConfigExport", () => {
    it("produces a payload that passes its own schema (round-trip)", async () => {
      getItemMock.mockImplementation((key: string) => {
        if (key === "local:config")
          return Promise.resolve(structuredClone(DEFAULT_CONFIG))
        if (key === "local:theme")
          return Promise.resolve("dark")
        return Promise.resolve(null)
      })

      const { buildConfigExport } = await import("../import-export")
      const payload = await buildConfigExport()
      const reparsed = configExportSchema.parse(payload)
      expect(reparsed.exportedBy).toBe("1.0.0")
      expect(reparsed.data.theme).toBe("dark")
    })

    it("omits theme when storage has no valid theme value", async () => {
      getItemMock.mockImplementation((key: string) => {
        if (key === "local:config")
          return Promise.resolve(structuredClone(DEFAULT_CONFIG))
        return Promise.resolve(null) // no theme
      })

      const { buildConfigExport } = await import("../import-export")
      const payload = await buildConfigExport()
      expect(payload.data.theme).toBeUndefined()
    })
  })

  describe("applyConfigImport", () => {
    it("writes config (and theme when present) back to storage", async () => {
      const { applyConfigImport } = await import("../import-export")
      const payload: ConfigExport = {
        vibeReadingExport: "v1",
        exportedAt: new Date().toISOString(),
        exportedBy: "1.0.0",
        data: { config: structuredClone(DEFAULT_CONFIG), theme: "light" },
      }
      await applyConfigImport(payload)

      const calls = setItemMock.mock.calls
      expect(calls.some(([key]) => key === "local:config")).toBe(true)
      expect(calls.some(([key]) => key === "local:theme")).toBe(true)
      expect(setMetaMock).toHaveBeenCalledWith(
        "local:config",
        expect.objectContaining({ lastModifiedAt: expect.any(Number) }),
      )
    })

    it("does not touch theme storage when payload has no theme", async () => {
      const { applyConfigImport } = await import("../import-export")
      const payload: ConfigExport = {
        vibeReadingExport: "v1",
        exportedAt: new Date().toISOString(),
        exportedBy: "1.0.0",
        data: { config: structuredClone(DEFAULT_CONFIG) },
      }
      await applyConfigImport(payload)

      const themeWrite = setItemMock.mock.calls.find(([key]) => key === "local:theme")
      expect(themeWrite).toBeUndefined()
    })
  })
})
