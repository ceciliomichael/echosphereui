import { splitThinkingContent } from '../../src/lib/chatMessageContent'

const MAX_COMMIT_SUBJECT_LENGTH = 72
const CONVENTIONAL_PREFIX_PATTERN = /^(feat|fix|docs|style|refactor|test|build|ci|perf|chore)(\([^)]+\))?!?:\s+\S/u

function stripCodeFences(rawMessage: string) {
  return rawMessage.replace(/```[\s\S]*?```/gu, '')
}

function stripThinkingMarkup(rawMessage: string) {
  return splitThinkingContent(rawMessage).content
}

function ensureTrailingSentencePunctuation(text: string) {
  const trimmedText = text.trim()
  if (trimmedText.length === 0) {
    return ''
  }

  return /[.!?]$/u.test(trimmedText) ? trimmedText : `${trimmedText}.`
}

function summarizeTouchedFilesForDescription(touchedFiles: readonly string[]) {
  if (touchedFiles.length === 0) {
    return 'Update project files included in this commit'
  }

  if (touchedFiles.length === 1) {
    return `Update ${touchedFiles[0]}`
  }

  const topFiles = touchedFiles.slice(0, 3).join(', ')
  const remainingCount = touchedFiles.length - Math.min(touchedFiles.length, 3)
  if (remainingCount <= 0) {
    return `Update ${topFiles}`
  }

  return `Update ${topFiles} and ${remainingCount} more file${remainingCount === 1 ? '' : 's'}`
}

function normalizeDescriptionPoint(rawValue: string) {
  const withoutBullets = rawValue.replace(/^[-*]\s+/u, '')
  const withoutInlineLabel = withoutBullets.replace(/^(what|why|description|details)\s*[:：]\s*/iu, '')
  const withoutMarkdown = withoutInlineLabel.replace(/[`*_#>]/gu, '')
  const normalizedWhitespace = withoutMarkdown.replace(/\s+/gu, ' ').trim()
  if (normalizedWhitespace.length === 0) {
    return ''
  }

  if (/merge requests?/iu.test(normalizedWhitespace)) {
    return ''
  }

  return ensureTrailingSentencePunctuation(normalizedWhitespace)
}

function buildStructuredCommitDescription(input: {
  fallbackTouchedFiles: readonly string[]
  normalizedPoints: readonly string[]
}) {
  const fallbackLine = ensureTrailingSentencePunctuation(
    summarizeTouchedFilesForDescription(input.fallbackTouchedFiles),
  )
  const descriptionPoints = input.normalizedPoints.slice(0, 4)
  if (descriptionPoints.length === 0) {
    return `- ${fallbackLine}`
  }

  return descriptionPoints.map((point) => `- ${point}`).join('\n')
}

export function extractCommitSubjectLine(rawMessage: string) {
  return stripThinkingMarkup(stripCodeFences(rawMessage))
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? ''
}

export function normalizeGeneratedCommitMessage(rawMessage: string) {
  const firstLine = extractCommitSubjectLine(rawMessage)

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

export function buildFallbackCommitDescription(touchedFiles: readonly string[]) {
  return buildStructuredCommitDescription({
    fallbackTouchedFiles: touchedFiles,
    normalizedPoints: [],
  })
}

export function buildFallbackCommitMessageWithDescription(touchedFiles: readonly string[]) {
  return `${buildFallbackCommitMessage(touchedFiles)}\n\n${buildFallbackCommitDescription(touchedFiles)}`
}

export function normalizeGeneratedCommitMessageWithDescription(
  rawMessage: string,
  touchedFiles: readonly string[],
) {
  const subject = normalizeGeneratedCommitMessage(rawMessage)
  if (subject.length === 0) {
    return buildFallbackCommitMessageWithDescription(touchedFiles)
  }

  const rawLines = stripThinkingMarkup(stripCodeFences(rawMessage)).split(/\r?\n/u)
  const firstNonEmptyLineIndex = rawLines.findIndex((line) => line.trim().length > 0)
  const bodyLines = firstNonEmptyLineIndex >= 0 ? rawLines.slice(firstNonEmptyLineIndex + 1) : []
  const normalizedPoints = bodyLines
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => normalizeDescriptionPoint(line))
    .filter((line) => line.length > 0)

  const description = buildStructuredCommitDescription({
    fallbackTouchedFiles: touchedFiles,
    normalizedPoints,
  })

  return `${subject}\n\n${description}`
}
