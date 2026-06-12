/**
 * Migration script from v075 to v076.
 *
 * The original upstream migration backfilled hosted-storage account snapshots.
 * Vibe Reading removes hosted storage entirely, so this step is a no-op kept
 * only to preserve migration version continuity.
 */
export function migrate(oldConfig: any): any {
  return oldConfig
}
