// @vitest-environment jsdom
import type { ReactNode } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { pageTranslateRangeSchema } from "@/types/config/translate"
import { SmartContentRules } from "../smart-content-rules"

// Hoist the mutable holder so vi.mock factories can reference it
const { translateHolder } = vi.hoisted(() => ({
  translateHolder: {
    current: null as unknown,
  },
}))

vi.mock("#imports", () => ({
  i18n: {
    t: (key: string) => key,
  },
}))

vi.mock("@/utils/host/translate/smart/user-rules", () => ({
  parseSmartRules: (input: string) => {
    if (input.includes("#@#")) {
      return {
        rules: [],
        errors: [{ line: 1, text: input, message: "Exception rules (#@#) are not supported" }],
      }
    }
    if (input.includes("[")) {
      return {
        rules: [],
        errors: [{ line: 1, text: input, message: "Invalid CSS selector" }],
      }
    }
    return { rules: [], errors: [] }
  },
}))

vi.mock("@/utils/styles/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}))

vi.mock("@/entrypoints/options/components/config-card", () => ({
  ConfigCard: ({ id, title, description, children }: { id?: string, title: ReactNode, description: ReactNode, children: ReactNode }) => (
    <section id={id} data-testid="config-card">
      <h2>{title}</h2>
      <div>{description}</div>
      <div>{children}</div>
    </section>
  ),
}))

vi.mock("@/components/ui/base-ui/field", () => ({
  Field: ({ children, ...props }: Record<string, unknown>) => <div data-slot="field" {...props}>{children as ReactNode}</div>,
  FieldContent: ({ children, ...props }: Record<string, unknown>) => <div data-slot="field-content" {...props}>{children as ReactNode}</div>,
  FieldGroup: ({ children, ...props }: Record<string, unknown>) => <div data-slot="field-group" {...props}>{children as ReactNode}</div>,
  FieldLabel: ({ children, htmlFor }: { children: ReactNode, htmlFor?: string }) => <label htmlFor={htmlFor}>{children}</label>,
}))

// deepmerge mock — use function declaration so recursive calls work
function deepmerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  if (target && typeof target === "object" && source && typeof source === "object") {
    const result = { ...target } as Record<string, unknown>
    for (const key of Object.keys(source as Record<string, unknown>)) {
      const sv = (source as Record<string, unknown>)[key]
      const tv = (target as Record<string, unknown>)[key]
      if (sv && typeof sv === "object" && !Array.isArray(sv) && tv && typeof tv === "object" && !Array.isArray(tv)) {
        result[key] = deepmerge(tv as Record<string, unknown>, sv as Record<string, unknown>)
      }
      else {
        result[key] = sv
      }
    }
    return result as T
  }
  return source as T
}

vi.mock("deepmerge-ts", () => ({
  deepmerge,
}))

// Mock config atoms using proper Jotai dependency tracking
vi.mock("@/utils/atoms/config", async () => {
  const { atom } = await vi.importActual<typeof import("jotai")>("jotai")
  const initialTranslate = {
    providerId: "test",
    mode: "bilingual" as const,
    node: { enabled: false, hotkey: "control" as const },
    page: {
      range: "main" as const,
      shortcut: "",
      preload: { margin: 100, threshold: 200 },
      minCharactersPerNode: 40,
      minWordsPerNode: 8,
      floatingButtonEnabled: null,
      smart: {
        customRules: "!example.com .sidebar",
        debug: false,
      },
    },
    enableAIContentAware: false,
    customPromptsConfig: { promptId: null as string | null, patterns: [] },
    requestQueueConfig: { capacity: 5, rate: 5 },
    batchQueueConfig: { maxCharactersPerBatch: 2000, maxItemsPerBatch: 10 },
    translationNodeStyle: { preset: "none" as const, isCustom: false, customCSS: null as string | null },
  }
  translateHolder.current = { ...initialTranslate }

  // Base atom holds the config. translateAtom reads from it and writes to it.
  const baseAtom = atom(initialTranslate)

  const translateAtom = atom(
    (get) => {
      // Use get() to track dependencies (though baseAtom has no deps)
      return get(baseAtom)
    },
    (_get, set, newVal: typeof initialTranslate) => {
      // Set on the base atom to trigger proper Jotai store update
      set(baseAtom, newVal)
      // Also update holder for test assertions
      translateHolder.current = newVal
    },
  )

  return {
    configFieldsAtomMap: {
      translate: translateAtom,
    },
  }
})

describe("smartContentRules", () => {
  it("renders textarea and debug switch", () => {
    render(<SmartContentRules />)

    expect(screen.getByRole("textbox")).toBeInTheDocument()
    // base-ui Switch renders as <span role="switch">
    expect(screen.getByRole("switch")).toBeInTheDocument()
  })

  it("textarea displays current customRules", () => {
    render(<SmartContentRules />)

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    expect(textarea.value).toBe("!example.com .sidebar")
  })

  it("editing textarea writes customRules through config atom", async () => {
    render(<SmartContentRules />)

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: "example.com article\n* .global" } })

    // Wait for state update
    await act(async () => {
      await Promise.resolve()
    })

    const textareaAfter = screen.getByRole("textbox") as HTMLTextAreaElement
    expect(textareaAfter.value).toBe("example.com article\n* .global")

    const current = translateHolder.current as Record<string, unknown>
    const page = current.page as Record<string, unknown>
    const smart = page.smart as Record<string, unknown>
    expect(smart.customRules).toBe("example.com article\n* .global")
  })

  it("toggling debug writes debug flag", async () => {
    render(<SmartContentRules />)

    const switchEl = screen.getByRole("switch")
    expect(switchEl.getAttribute("aria-checked")).toBe("false")

    fireEvent.click(switchEl)

    await act(async () => {
      await Promise.resolve()
    })

    const current = translateHolder.current as Record<string, unknown>
    const page = current.page as Record<string, unknown>
    const smart = page.smart as Record<string, unknown>
    expect(smart.debug).toBe(true)
  })

  it("displays line-numbered error for invalid selector", async () => {
    render(<SmartContentRules />)

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: "example.com [invalid" } })

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText(/Invalid CSS selector/)).toBeInTheDocument()
  })

  it("displays unsupported syntax error for #@#", async () => {
    render(<SmartContentRules />)

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: "example.com##.ad #@# exception" } })

    await act(async () => {
      await Promise.resolve()
    })

    expect(screen.getByText(/Exception rules.*not supported/)).toBeInTheDocument()
  })
})

describe("translateRange", () => {
  it("pageTranslateRangeSchema includes smart option", () => {
    expect(pageTranslateRangeSchema.options).toContain("smart")
  })
})
