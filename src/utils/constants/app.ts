import { browser } from "#imports"

export const APP_NAME = "HiTranslator"
const manifest = browser.runtime.getManifest()
export const EXTENSION_VERSION = manifest.version
