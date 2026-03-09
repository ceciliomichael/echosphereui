import { DEFAULT_APP_SETTINGS } from '../../src/lib/defaultAppSettings'
import { isAppAppearance, isAppLanguage } from '../../src/lib/appSettings'
import type { AppSettings } from '../../src/types/chat'

const INITIAL_SETTINGS_ARG_PREFIX = '--echosphere-initial-settings='

function sanitizeBootstrappedSettings(input: unknown): AppSettings {
  const candidate = input as Partial<AppSettings> | null | undefined

  return {
    appearance: isAppAppearance(candidate?.appearance) ? candidate.appearance : DEFAULT_APP_SETTINGS.appearance,
    language: isAppLanguage(candidate?.language) ? candidate.language : DEFAULT_APP_SETTINGS.language,
    sendMessageOnEnter:
      typeof candidate?.sendMessageOnEnter === 'boolean'
        ? candidate.sendMessageOnEnter
        : DEFAULT_APP_SETTINGS.sendMessageOnEnter,
    sidebarWidth:
      typeof candidate?.sidebarWidth === 'number' && Number.isFinite(candidate.sidebarWidth)
        ? Math.max(DEFAULT_APP_SETTINGS.sidebarWidth, candidate.sidebarWidth)
        : DEFAULT_APP_SETTINGS.sidebarWidth,
  }
}

export function serializeInitialSettingsArg(settings: AppSettings) {
  return `${INITIAL_SETTINGS_ARG_PREFIX}${encodeURIComponent(JSON.stringify(settings))}`
}

export function parseInitialSettingsArg(argv: readonly string[]): AppSettings {
  const serializedSettings = argv.find((value) => value.startsWith(INITIAL_SETTINGS_ARG_PREFIX))

  if (!serializedSettings) {
    return DEFAULT_APP_SETTINGS
  }

  try {
    return sanitizeBootstrappedSettings(
      JSON.parse(decodeURIComponent(serializedSettings.slice(INITIAL_SETTINGS_ARG_PREFIX.length))),
    )
  } catch (error) {
    console.error('Failed to parse initial settings payload', error)
    return DEFAULT_APP_SETTINGS
  }
}
