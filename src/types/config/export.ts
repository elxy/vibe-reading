import { z } from "zod"

import { configSchema } from "./config"
import { themeModeSchema } from "./theme"

/**
 * Strict version literal for the export envelope. Future versions must use a
 * new literal (e.g. "v2") and a separate schema. Imports with a non-matching
 * version are rejected outright (no implicit migration).
 */
export const CONFIG_EXPORT_VERSION = "v1"

export const configExportSchema = z.object({
  vibeReadingExport: z.literal(CONFIG_EXPORT_VERSION),
  exportedAt: z.string(),
  exportedBy: z.string(),
  data: z.object({
    config: configSchema,
    theme: themeModeSchema.optional(),
  }),
})

export type ConfigExport = z.infer<typeof configExportSchema>
