import type { ConfigExport } from "@/types/config/export"

import { saveAs } from "file-saver"
import { browser, storage } from "#imports"

import { configSchema } from "@/types/config/config"
import { CONFIG_EXPORT_VERSION, configExportSchema } from "@/types/config/export"
import { themeModeSchema } from "@/types/config/theme"
import { storageAdapter } from "../atoms/storage-adapter"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG, THEME_STORAGE_KEY } from "../constants/config"

/**
 * Build the export payload from current local storage.
 *
 * - `config` falls back to DEFAULT_CONFIG if storage is empty or invalid.
 * - `theme` is included only if the stored value passes schema validation;
 *   otherwise it's omitted (a fresh install with no explicit theme choice
 *   should not pin the importer to "system").
 */
export async function buildConfigExport(): Promise<ConfigExport> {
  const config = await storageAdapter.get(CONFIG_STORAGE_KEY, DEFAULT_CONFIG, configSchema)
  const rawTheme = await storage.getItem<unknown>(`local:${THEME_STORAGE_KEY}`)
  const parsedTheme = themeModeSchema.safeParse(rawTheme)
  const version = browser.runtime.getManifest().version
  return {
    vibeReadingExport: CONFIG_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    exportedBy: version,
    data: {
      config,
      ...(parsedTheme.success ? { theme: parsedTheme.data } : {}),
    },
  }
}

export async function exportConfigToFile() {
  const payload = await buildConfigExport()
  const json = JSON.stringify(payload, null, 2)
  const blob = new Blob([json], { type: "application/json" })
  saveAs(blob, `vibe-reading-config-${Date.now()}.json`)
}

/**
 * Parse and validate the raw text of an export file.
 *
 * Throws:
 * - SyntaxError if `text` is not valid JSON.
 * - ZodError if the JSON does not match the export schema (including a
 *   non-"v1" `vibeReadingExport` field, which is rejected outright).
 */
export function parseConfigExport(text: string): ConfigExport {
  const json: unknown = JSON.parse(text)
  return configExportSchema.parse(json)
}

/**
 * Apply a previously parsed export to local storage, fully replacing the
 * current configuration. UI atoms re-sync via their existing storage watchers.
 */
export async function applyConfigImport(payload: ConfigExport) {
  await storageAdapter.set(CONFIG_STORAGE_KEY, payload.data.config, configSchema)
  await storageAdapter.setMeta(CONFIG_STORAGE_KEY, { lastModifiedAt: Date.now() })
  if (payload.data.theme !== undefined) {
    await storageAdapter.set(THEME_STORAGE_KEY, payload.data.theme, themeModeSchema)
  }
}
