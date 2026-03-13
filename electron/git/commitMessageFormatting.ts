const MAX_COMMIT_SUBJECT_LENGTH = 72
const CONVENTIONAL_PREFIX_PATTERN = /^(feat|fix|docs|style|refactor|test|build|ci|perf|chore)(\([^)]+\))?!?:\s+\S/u

export function normalizeGeneratedCommitMessage(rawMessage: string) {
  const firstLine = rawMessage
    .replace(/```[\s\S]*?```/gu, '')
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  if (!firstLine) {
    return ''
  }

  const withoutWrappingQuotes = firstLine.replace(/^['"`]+|['"`]+$/gu, '')
  const withoutBulletPrefix = withoutWrappingQuotes.replace(/^[-*]\s+/u, '')
  const normalizedWhitespace = withoutBulletPrefix.replace(/\s+/gu, ' ').trim()
  if (normalizedWhitespace.length === 0) {
    return ''
  }

  const withConventionalPrefix = CONVENTIONAL_PREFIX_PATTERN.test(normalizedWhitespace)
    ? normalizedWhitespace
    : `chore: ${normalizedWhitespace}`

  const withoutTrailingPeriod = withConventionalPrefix.replace(/[.。]+$/u, '').trim()
  if (withoutTrailingPeriod.length <= MAX_COMMIT_SUBJECT_LENGTH) {
    return withoutTrailingPeriod
  }

  const clipped = withoutTrailingPeriod.slice(0, MAX_COMMIT_SUBJECT_LENGTH)
  const lastWhitespaceIndex = clipped.lastIndexOf(' ')
  const bounded = lastWhitespaceIndex >= 20 ? clipped.slice(0, lastWhitespaceIndex) : clipped
  return bounded.trim()
}

export function buildFallbackCommitMessage(touchedFiles: readonly string[]) {
  if (touchedFiles.length === 0) {
    return 'chore: update project files'
  }

  const hasTests = touchedFiles.some((filePath) => /(^|\/)(test|tests|__tests__)($|\/)|\.test\./u.test(filePath))
  if (hasTests) {
    return 'test: update test coverage for recent changes'
  }

  const hasDocs = touchedFiles.some((filePath) => /(^|\/)(docs?)($|\/)|readme/i.test(filePath))
  if (hasDocs) {
    return 'docs: refresh documentation for recent updates'
  }

  const hasSourceCode = touchedFiles.some((filePath) => /(^|\/)src\//u.test(filePath))
  if (hasSourceCode) {
    return 'refactor: update implementation details across changed modules'
  }

  return touchedFiles.length === 1
    ? `chore: update ${touchedFiles[0]}`
    : `chore: update ${touchedFiles.length} files`
}
