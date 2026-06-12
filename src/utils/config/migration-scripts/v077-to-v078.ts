/**
 * Migration script from v077 to v078
 * - Removes siteControl because the extension is always active.
 *
 * IMPORTANT: All values are hardcoded inline. Migration scripts are frozen
 * snapshots — never import constants or helpers that may change.
 */

export function migrate(oldConfig: any): any {
  if (!oldConfig || typeof oldConfig !== "object") {
    return oldConfig
  }

  const { siteControl: _siteControl, ...configWithoutSiteControl } = oldConfig
  return configWithoutSiteControl
}
