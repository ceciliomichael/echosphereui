import path from 'node:path'

interface ListToolEntry {
  kind?: unknown
  name?: unknown
}

interface GrepMatch {
  columnNumber?: unknown
  lineNumber?: unknown
  lineText?: unknown
  path?: unknown
}

export function formatArgumentsText(argumentsText: string) {
  if (argumentsText.trim().length === 0) {
    return '{}'
  }

  try {
    const parsedValue = JSON.parse(argumentsText) as unknown
    if (typeof parsedValue !== 'object' || parsedValue === null) {
      return argumentsText
    }

    return JSON.stringify(parsedValue, null, 2)
  } catch {
    return argumentsText
  }
}

export function parseArguments(argumentsText: string) {
  try {
    const parsedValue = JSON.parse(argumentsText) as unknown
    return typeof parsedValue === 'object' && parsedValue !== null ? (parsedValue as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

export function readBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : false
}

export function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function inferFenceLanguage(filePath: string) {
  const normalizedFileName = path.basename(filePath).trim().toLowerCase()
  if (normalizedFileName.length === 0) {
    return null
  }

  if (normalizedFileName === 'dockerfile' || normalizedFileName === 'makefile') {
    return normalizedFileName
  }

  if (normalizedFileName.startsWith('.')) {
    const dotfileLanguage = normalizedFileName.slice(1)
    return dotfileLanguage.length > 0 ? dotfileLanguage : null
  }

  const extension = path.extname(normalizedFileName).slice(1)
  return extension.length > 0 ? extension : null
}

export function readListEntries(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => (typeof entry === 'object' && entry !== null ? (entry as ListToolEntry) : null))
    .filter((entry): entry is ListToolEntry => entry !== null)
}

export function readGrepMatches(value: unknown) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => (typeof entry === 'object' && entry !== null ? (entry as GrepMatch) : null))
    .filter((entry): entry is GrepMatch => entry !== null)
}

export function filterUndefinedEntries(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined))
}
