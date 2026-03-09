import { DEFAULT_APP_APPEARANCE, isAppAppearance, type AppAppearance } from './appSettings'

export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'echosphere:appearance'
export const SYSTEM_DARK_MODE_QUERY = '(prefers-color-scheme: dark)'
export const LIGHT_THEME_COLOR = '#EEF4EE'
export const DARK_THEME_COLOR = '#181818'

export function getCachedAppearancePreference(): AppAppearance {
  if (typeof window === 'undefined') {
    return DEFAULT_APP_APPEARANCE
  }

  try {
    const cachedAppearance = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isAppAppearance(cachedAppearance) ? cachedAppearance : DEFAULT_APP_APPEARANCE
  } catch {
    return DEFAULT_APP_APPEARANCE
  }
}

export function cacheAppearancePreference(appearance: AppAppearance) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, appearance)
  } catch {
    // Ignore local cache write failures and rely on the persisted Electron settings store.
  }
}

export function resolveTheme(
  appearance: AppAppearance,
  mediaQueryList?: Pick<MediaQueryList, 'matches'> | null,
): ResolvedTheme {
  if (appearance === 'system') {
    return mediaQueryList?.matches ? 'dark' : 'light'
  }

  return appearance
}
