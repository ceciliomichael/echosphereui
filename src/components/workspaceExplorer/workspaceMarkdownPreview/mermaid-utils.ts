import type { ResolvedTheme } from '../../../lib/theme'

type MermaidModule = (typeof import('mermaid'))['default']

let mermaidModulePromise: Promise<MermaidModule> | null = null

function readCssVariable(name: string, fallback: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallback
  }

  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value.length > 0 ? value : fallback
}

export function loadMermaidModule() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import('mermaid').then((module) => module.default)
  }

  return mermaidModulePromise
}

export function createMermaidRenderCacheKey(code: string, theme: ResolvedTheme) {
  return `${theme}::${code}`
}

export function getMermaidThemeVariables() {
  const rootStyles =
    typeof window !== 'undefined' && typeof document !== 'undefined'
      ? window.getComputedStyle(document.documentElement)
      : null

  const background = readCssVariable('--color-background', '#ffffff')
  const foreground = readCssVariable('--color-foreground', '#101011')
  const mutedForeground = readCssVariable('--color-muted-foreground', '#606266')
  const surface = readCssVariable('--color-surface', '#ffffff')
  const surfaceMuted = readCssVariable('--color-surface-muted', '#f8f7ff')
  const border = readCssVariable('--color-border', '#f0f2f6')

  return {
    background: 'transparent',
    clusterBkg: surfaceMuted,
    clusterBorder: border,
    fontFamily: rootStyles?.fontFamily ?? 'Google Sans Flex, sans-serif',
    lineColor: border,
    mainBkg: surface,
    primaryBorderColor: border,
    primaryColor: surface,
    primaryTextColor: foreground,
    secondaryColor: surfaceMuted,
    tertiaryColor: background,
    textColor: foreground,
    nodeBorder: border,
    defaultLinkColor: mutedForeground,
  }
}

export function normalizeRenderedMermaidSvg(svg: string) {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return svg
  }

  try {
    const parsedDocument = new DOMParser().parseFromString(svg, 'image/svg+xml')
    const svgElement = parsedDocument.documentElement
    if (svgElement.tagName.toLowerCase() !== 'svg') {
      return svg
    }

    svgElement.removeAttribute('width')
    svgElement.removeAttribute('height')
    svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet')

    const existingStyle = svgElement.getAttribute('style') ?? ''
    const nextStyle = `${existingStyle};max-width:100%;max-height:100%;width:auto;height:auto;display:block;object-fit:contain;`
      .split(';')
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0)
      .join(';')
    svgElement.setAttribute('style', nextStyle)

    return new XMLSerializer().serializeToString(svgElement)
  } catch {
    return svg
  }
}

export function isMermaidErrorSvg(svg: string) {
  return /Syntax error in text/i.test(svg)
}
