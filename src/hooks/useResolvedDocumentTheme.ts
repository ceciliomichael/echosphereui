import { useSyncExternalStore } from 'react'
import { SYSTEM_DARK_MODE_QUERY, type ResolvedTheme } from '../lib/theme'

function getResolvedDocumentTheme() {
  if (typeof document === 'undefined') {
    return 'light' as ResolvedTheme
  }

  const theme = document.documentElement.dataset.theme
  if (theme === 'dark' || theme === 'light') {
    return theme
  }

  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    return window.matchMedia(SYSTEM_DARK_MODE_QUERY).matches ? 'dark' : 'light'
  }

  return 'light'
}

function subscribeToThemeChanges(onStoreChange: () => void) {
  if (typeof document === 'undefined' || typeof window === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {}
  }

  const observer = new MutationObserver(() => {
    onStoreChange()
  })

  observer.observe(document.documentElement, {
    attributeFilter: ['data-theme'],
    attributes: true,
  })

  return () => {
    observer.disconnect()
  }
}

export function useResolvedDocumentTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeToThemeChanges, getResolvedDocumentTheme, () => 'light')
}
