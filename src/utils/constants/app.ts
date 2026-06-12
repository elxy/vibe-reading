import { browser } from "#imports"

export const APP_NAME = "Vibe Reading"
const manifest = browser.runtime.getManifest()
export const EXTENSION_VERSION = manifest.version
