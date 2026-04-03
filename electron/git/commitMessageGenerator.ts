import type { ChatProviderId, ReasoningEffort } from '../../src/types/chat'
import { buildFallbackCommitMessageWithDescription } from './commitMessageFormatting'

const MAX_PROMPT_DIFF_LINES = 420
const MAX_PROMPT_DIFF_CHARS = 18_000

interface ActiveModelSelection {
  modelId: string
  providerId: ChatProviderId
  reasoningEffort: ReasoningEffort
}

interface GenerateCommitMessageInput {
  diffText: string
  numstatText: string
  selection: ActiveModelSelection | null
}

interface CommitMessagePromptContext {
  promptText: string
  touchedFiles: string[]
}

function truncateDiffForPrompt(diffText: string) {
  const normalizedDiffText = diffText.trim()
  if (normalizedDiffText.length === 0) {
    return '(No textual diff available. Use metadata only.)'
  }

  const diffLines = normalizedDiffText.split(/\r?\n/u)
  const truncatedLines = diffLines.slice(0, MAX_PROMPT_DIFF_LINES)
  let truncatedDiff = truncatedLines.join('\n')
  if (truncatedDiff.length > MAX_PROMPT_DIFF_CHARS) {
    truncatedDiff = truncatedDiff.slice(0, MAX_PROMPT_DIFF_CHARS)
  }

  if (truncatedLines.length < diffLines.length || truncatedDiff.length < normalizedDiffText.length) {
    return `${truncatedDiff}\n\n...[diff truncated for prompt size]`
  }

  return truncatedDiff
}

function extractTouchedFilesFromDiff(diffText: string) {
  const filePaths = new Set<string>()
  for (const line of diffText.split(/\r?\n/u)) {
    if (!line.startsWith('diff --git a/')) {
      continue
    }

    const match = /^diff --git a\/(.+?) b\/(.+)$/u.exec(line)
    if (!match) {
      continue
    }

    filePaths.add(match[2])
  }

  return Array.from(filePaths)
}

function buildCommitMessagePrompt(input: { diffText: string; numstatText: string }): CommitMessagePromptContext {
  const touchedFiles = extractTouchedFilesFromDiff(input.diffText)
  const diffSnippet = truncateDiffForPrompt(input.diffText)
  const topFiles = touchedFiles.slice(0, 12)
  const fileList = topFiles.length > 0 ? topFiles.join('\n') : '(none detected)'
  const normalizedNumstat = input.numstatText.trim().length > 0 ? input.numstatText.trim() : '(unavailable)'

  const promptText = [
    'Generate the best possible commit message for this staged diff.',
    'Focus on user-visible behavior, bug fixes, architecture, and tests that actually changed.',
    'Return a subject plus short body with clear implementation context.',
    '',
    'Staged numstat:',
    normalizedNumstat,
    '',
    'Touched files (top):',
    fileList,
    '',
    'Unified diff excerpt:',
    diffSnippet,
  ].join('\n')

  return {
    promptText,
    touchedFiles,
  }
}

export async function generateCommitMessageFromDiff(input: GenerateCommitMessageInput) {
  const promptContext = buildCommitMessagePrompt({
    diffText: input.diffText,
    numstatText: input.numstatText,
  })

  void input.selection
  void promptContext.promptText

  return buildFallbackCommitMessageWithDescription(promptContext.touchedFiles)
}
