/**
 * Migration script from v074 to v075.
 *
 * The original upstream migration introduced hosted-storage connection fields.
 * Vibe Reading does not include hosted storage or any project backend, so this
 * step is a no-op kept only to preserve migration version continuity.
 */
export function migrate(oldConfig: any): any {
  return oldConfig
}
