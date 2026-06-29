// @vitest-environment jsdom
import type { ReactNode } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { configSchema } from "@/types/config/config"
import { pageTranslateRangeSchema } from "@/types/config/translate"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { SmartContentRules } from "../smart-content-rules"
import { TranslateRange } from "../translate-range"

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
  FieldLabel: ({ children, htmlFor, nativeLabel }: { children: ReactNode, htmlFor?: string, nativeLabel?: boolean, render?: ReactNode }) => {
    if (nativeLabel === false) {
      return <span>{children}</span>
    }
    return <label htmlFor={htmlFor}>{children}</label>
  },
}))

vi.mock("@/components/ui/base-ui/textarea", () => ({
  Textarea: (props: Record<string, unknown>) => <textarea {...props} />,
}))

vi.mock("@/components/ui/base-ui/switch", () => ({
  Switch: ({ id, checked, onCheckedChange, ...props }: Record<string, unknown>) => (
    <span
      id={id as string}
      role="switch"
      aria-checked={checked ? "true" : "false"}
      tabIndex={0}
      onClick={() => (onCheckedChange as (v: boolean) => void)?.(!checked)}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          ;(onCheckedChange as (v: boolean) => void)?.(!checked)
        }
      }}
      {...props}
    />
  ),
}))

vi.mock("@/components/ui/base-ui/select", () => ({
  Select: ({ children }: { children: ReactNode }) => <div data-testid="select">{children as ReactNode}</div>,
  SelectContent: ({ children }: { children: ReactNode }) => <div data-testid="select-content">{children as ReactNode}</div>,
  SelectGroup: ({ children }: { children: ReactNode }) => <div>{children as ReactNode}</div>,
  SelectItem: ({ value, children }: { value: string, children: ReactNode }) => (
    <div data-value={value}>{children}</div>
  ),
  SelectTrigger: ({ children, className }: { children: ReactNode, className?: string }) => (
    <div className={className}>{children as ReactNode}</div>
  ),
  SelectValue: ({ children }: { children: ReactNode }) => <span data-testid="select-value">{children as ReactNode}</span>,
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

// NOTE: Intentionally NOT mocking @/utils/host/translate/smart/user-rules.
// The integration test exercises the real parseSmartRules parser to verify
// the UI → parser → config contract end-to-end.

// ── Mock config atoms with proper Jotai dependency tracking ──
vi.mock("@/utils/atoms/config", async () => {
  const { atom } = await vi.importActual<typeof import("jotai")>("jotai")

  // Initial config matching integration spec scenario 1:
  //   translate.page.range = "smart"
  //   translate.page.smart.customRules = "!example.com .sidebar\nexample.com article"
  //   translate.page.smart.debug = true
  const initialTranslate = {
    providerId: "test",
    mode: "bilingual" as const,
    node: { enabled: false, hotkey: "control" as const },
    page: {
      range: "smart" as const,
      shortcut: "",
      preload: { margin: 100, threshold: 200 },
      minCharactersPerNode: 40,
      minWordsPerNode: 8,
      floatingButtonEnabled: null,
      smart: {
        customRules: "!example.com .sidebar\nexample.com article",
        debug: true,
      },
    },
    enableAIContentAware: false,
    customPromptsConfig: { promptId: null as string | null, patterns: [] },
    requestQueueConfig: { capacity: 5, rate: 5 },
    batchQueueConfig: { maxCharactersPerBatch: 2000, maxItemsPerBatch: 10 },
    translationNodeStyle: { preset: "none" as const, isCustom: false, customCSS: null as string | null },
  }
  translateHolder.current = { ...initialTranslate }

  const baseAtom = atom(initialTranslate)

  const translateAtom = atom(
    get => get(baseAtom),
    (_get, set, newVal: typeof initialTranslate) => {
      set(baseAtom, newVal)
      translateHolder.current = newVal
    },
  )

  return {
    configFieldsAtomMap: {
      translate: translateAtom,
    },
  }
})

describe("smartContentConfigIntegration", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 1: Render translation settings with smart config
  // Assert UI displays Smart Content range, textarea text, and debug enabled
  // ═══════════════════════════════════════════════════════════════════════════
  it("renders smart range select, custom rules textarea with content, and debug switch enabled", () => {
    render(
      <>
        <TranslateRange />
        <SmartContentRules />
      </>,
    )

    // Smart Content range: TranslateRange selector should display the "smart" range
    const selectValue = screen.getByTestId("select-value")
    expect(selectValue.textContent).toBe("options.translation.translateRange.range.smart")

    // Textarea displays the customRules from config
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    expect(textarea.value).toBe("!example.com .sidebar\nexample.com article")

    // Debug switch is checked (debug: true in config)
    const switchEl = screen.getByRole("switch")
    expect(switchEl.getAttribute("aria-checked")).toBe("true")

    // No validation errors for valid rules
    expect(screen.queryByText(/Unsupported rule syntax/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Invalid/)).not.toBeInTheDocument()
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 2: Invalid #@# syntax → error message appears
  // ═══════════════════════════════════════════════════════════════════════════
  it("shows unsupported-rule validation message when textarea contains #@# syntax", async () => {
    render(<SmartContentRules />)

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: "example.com##.ad #@# exception" } })

    await act(async () => {
      await Promise.resolve()
    })

    // The real parseSmartRules should detect #@# and emit an error
    expect(screen.getByText(/Unsupported rule syntax/)).toBeInTheDocument()

    // Verify the atom was updated with the invalid text
    const current = translateHolder.current as Record<string, unknown>
    const page = current.page as Record<string, unknown>
    const smart = page.smart as Record<string, unknown>
    expect(smart.customRules).toBe("example.com##.ad #@# exception")
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 3: Fix syntax → validation message disappears
  // ═══════════════════════════════════════════════════════════════════════════
  it("hides validation message when textarea is corrected back to valid syntax", async () => {
    render(<SmartContentRules />)

    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement

    // Step 1: Set invalid syntax containing #@#
    fireEvent.change(textarea, { target: { value: "example.com##.ad #@# exception" } })
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByText(/Unsupported rule syntax/)).toBeInTheDocument()

    // Step 2: Correct back to valid syntax
    fireEvent.change(textarea, { target: { value: "example.com article" } })
    await act(async () => {
      await Promise.resolve()
    })

    // Error message should be gone
    expect(screen.queryByText(/Unsupported rule syntax/)).not.toBeInTheDocument()

    // Textarea value reflects the corrected input
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("example.com article")

    // Atom should hold the corrected value
    const current = translateHolder.current as Record<string, unknown>
    const page = current.page as Record<string, unknown>
    const smart = page.smart as Record<string, unknown>
    expect(smart.customRules).toBe("example.com article")
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 4: Config schema accepts the UI-written shape
  // ═══════════════════════════════════════════════════════════════════════════
  it("configSchema.safeParse accepts config with smart range and custom rules", () => {
    const uiConfig = {
      ...DEFAULT_CONFIG,
      translate: {
        ...DEFAULT_CONFIG.translate,
        page: {
          ...DEFAULT_CONFIG.translate.page,
          range: "smart" as const,
          smart: {
            customRules: "!example.com .sidebar\nexample.com article",
            debug: true,
          },
        },
      },
    }

    const result = configSchema.safeParse(uiConfig)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.translate.page.range).toBe("smart")
      expect(result.data.translate.page.smart.customRules).toBe("!example.com .sidebar\nexample.com article")
      expect(result.data.translate.page.smart.debug).toBe(true)
    }
  })

  // ═══════════════════════════════════════════════════════════════════════════
  // Scenario 5: Default config invariants
  // ═══════════════════════════════════════════════════════════════════════════
  it("default config has range main and page.smart fields", () => {
    expect(DEFAULT_CONFIG.translate.page.range).toBe("main")
    expect(DEFAULT_CONFIG.translate.page.smart).toEqual({
      customRules: "",
      debug: false,
    })
  })

  it("pageTranslateRangeSchema includes smart option", () => {
    expect(pageTranslateRangeSchema.options).toContain("smart")
  })
})
