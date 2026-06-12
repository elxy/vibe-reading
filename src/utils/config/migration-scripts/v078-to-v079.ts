/**
 * Migration script from v078 to v079
 * - Removes languageDetection because language detection always uses LLM.
 *
 * IMPORTANT: All values are hardcoded inline. Migration scripts are frozen
 * snapshots — never import constants or helpers that may change.
 */

export function migrate(oldConfig: any): any {
  if (!oldConfig || typeof oldConfig !== "object") {
    return oldConfig
  }

  const { languageDetection: _languageDetection, ...configWithoutLanguageDetection } = oldConfig
  return configWithoutLanguageDetection
}
