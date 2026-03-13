import { randomUUID } from 'node:crypto'
import type { ChatCompletionCreateParamsNonStreaming, ChatCompletionMessageParam } from 'openai/resources/chat/completions/completions'
import type { ChatProviderId, ReasoningEffort } from '../../src/types/chat'
import {
  anthropicModelSupportsReasoningEffort,
  buildAnthropicClient,
  loadAnthropicProviderConfig,
  resolveAnthropicModelId,
  toAnthropicReasoningEffort,
} from '../chat/providers/anthropicShared'
import {
  buildGoogleClient,
  googleModelSupportsReasoningEffort,
  loadGoogleProviderConfig,
  resolveGoogleModelId,
  toGoogleThinkingLevel,
} from '../chat/providers/googleShared'
import {
  buildOpenAIClient,
  isUnsupportedReasoningEffortError,
  loadOpenAIProviderConfig,
  OPENAI_MAX_RETRIES,
  OPENAI_REQUEST_TIMEOUT_MS,
  readTextLikeValue,
} from '../chat/providers/openaiShared'
import { buildFallbackCommitMessage, normalizeGeneratedCommitMessage } from './commitMessageFormatting'

const CODEX_RESPONSES_URL = 'https://chatgpt.com/backend-api/codex/responses'
const CODEX_VERSION_HEADER = '0.101.0'
const CODEX_USER_AGENT = 'codex_cli_rs/0.101.0 (Windows; x86_64)'
const CODEX_ORIGINATOR = 'codex_cli_rs'
const MAX_PROMPT_DIFF_LINES = 420
const MAX_PROMPT_DIFF_CHARS = 18_000
const COMMIT_MESSAGE_SYSTEM_PROMPT = [
  'You are an expert software engineer writing git commit messages.',
  'Write one strong Conventional Commit subject line only.',
  'Requirements:',
  '- Use format: type(scope?): concise imperative summary',
  '- Prefer one of: feat, fix, refactor, perf, docs, test, build, ci, chore',
  '- Keep it specific to the diff, no generic wording',
  '- Maximum 72 characters',
  '- No body, no markdown, no quotes, no backticks',
  '- Output exactly one line',
].join('\n')

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

function buildCodexHeaders(accessToken: string, accountId: string) {
  return {
    Accept: 'text/event-stream',
    Authorization: `Bearer ${accessToken}`,
    'Chatgpt-Account-Id': accountId,
    'Content-Type': 'application/json',
    Originator: CODEX_ORIGINATOR,
    Session_id: randomUUID(),
    'User-Agent': CODEX_USER_AGENT,
    Version: CODEX_VERSION_HEADER,
  }
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
    'Generate the best possible commit subject for this staged diff.',
    'Focus on user-visible behavior, bug fixes, architecture, or tests that actually changed.',
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

async function generateWithOpenAIChatCompletion(
  providerId: 'openai' | 'openai-compatible',
  selection: ActiveModelSelection,
  promptText: string,
) {
  const providerConfig = await loadOpenAIProviderConfig(providerId)
  const client = buildOpenAIClient(providerConfig)
  const messages: ChatCompletionMessageParam[] = [
    {
      content: COMMIT_MESSAGE_SYSTEM_PROMPT,
      role: 'system',
    },
    {
      content: promptText,
      role: 'user',
    },
  ]
  const requestOptions = {
    maxRetries: OPENAI_MAX_RETRIES,
    timeout: OPENAI_REQUEST_TIMEOUT_MS,
  }

  const buildRequest = (includeReasoningEffort: boolean): ChatCompletionCreateParamsNonStreaming => {
    const payload: ChatCompletionCreateParamsNonStreaming = {
      max_tokens: 120,
      messages,
      model: selection.modelId,
      store: false,
      stream: false,
      temperature: 0.2,
    }

    if (includeReasoningEffort) {
      payload.reasoning_effort = selection.reasoningEffort
    }

    return payload
  }

  try {
    const completion = await client.chat.completions.create(buildRequest(true), requestOptions)
    return readTextLikeValue(completion.choices[0]?.message?.content) ?? ''
  } catch (error) {
    if (!isUnsupportedReasoningEffortError(error)) {
      throw error
    }

    const completion = await client.chat.completions.create(buildRequest(false), requestOptions)
    return readTextLikeValue(completion.choices[0]?.message?.content) ?? ''
  }
}

async function generateWithAnthropic(selection: ActiveModelSelection, promptText: string) {
  const providerConfig = await loadAnthropicProviderConfig()
  const client = buildAnthropicClient(providerConfig)
  const resolvedModelId = resolveAnthropicModelId(selection.modelId)
  const supportsReasoningEffort = anthropicModelSupportsReasoningEffort(resolvedModelId)
  const response = await client.messages.create({
    max_tokens: 180,
    messages: [
      {
        content: promptText,
        role: 'user',
      },
    ],
    model: resolvedModelId,
    ...(supportsReasoningEffort
      ? {
          output_config: {
            effort: toAnthropicReasoningEffort(selection.reasoningEffort),
          },
          thinking: {
            type: 'adaptive' as const,
          },
        }
      : {}),
    system: COMMIT_MESSAGE_SYSTEM_PROMPT,
    temperature: 0.2,
  })

  return response.content
    .filter((block): block is Extract<typeof block, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

async function generateWithGoogle(selection: ActiveModelSelection, promptText: string) {
  const providerConfig = await loadGoogleProviderConfig()
  const client = buildGoogleClient(providerConfig)
  const resolvedModelId = resolveGoogleModelId(selection.modelId)
  const supportsReasoningEffort = googleModelSupportsReasoningEffort(resolvedModelId)
  const response = await client.models.generateContent({
    config: {
      systemInstruction: COMMIT_MESSAGE_SYSTEM_PROMPT,
      temperature: 0.2,
      ...(supportsReasoningEffort
        ? {
            thinkingConfig: {
              thinkingLevel: toGoogleThinkingLevel(selection.reasoningEffort),
            },
          }
        : {}),
    },
    contents: [
      {
        parts: [{ text: promptText }],
        role: 'user',
      },
    ],
    model: resolvedModelId,
  })

  if (typeof response.text === 'string' && response.text.trim().length > 0) {
    return response.text
  }

  const fallbackText = (response.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('\n')

  return fallbackText
}

async function sendCodexStreamingRequest(
  payload: Record<string, unknown>,
  signal: AbortSignal,
  forceRefresh = false,
) {
  const { forceRefreshCodexAuthData, loadCodexAuthData } = await import('../chat/providers/codexAuth')
  const authData = forceRefresh ? await forceRefreshCodexAuthData() : await loadCodexAuthData()
  const response = await fetch(CODEX_RESPONSES_URL, {
    body: JSON.stringify(payload),
    headers: buildCodexHeaders(authData.tokens.access_token, authData.tokens.account_id),
    method: 'POST',
    signal,
  })

  if (response.status === 401 && !forceRefresh) {
    return sendCodexStreamingRequest(payload, signal, true)
  }

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Codex request failed (${response.status}): ${errorText}`)
  }

  return response
}

async function generateWithCodex(selection: ActiveModelSelection, promptText: string) {
  const { parseSseResponseStream } = await import('../chat/providers/codexSseParser')
  const signal = AbortSignal.timeout(OPENAI_REQUEST_TIMEOUT_MS)
  let streamedText = ''
  const response = await sendCodexStreamingRequest(
    {
      include: ['reasoning.encrypted_content'],
      input: [
        {
          content: [{ text: promptText, type: 'input_text' }],
          role: 'user',
        },
      ],
      instructions: COMMIT_MESSAGE_SYSTEM_PROMPT,
      model: selection.modelId,
      reasoning: {
        effort: selection.reasoningEffort,
        summary: 'auto',
      },
      store: false,
      stream: true,
    },
    signal,
  )

  const turnResult = await parseSseResponseStream(
    response,
    (event) => {
      if (event.type === 'content_delta') {
        streamedText += event.delta
      }
    },
    signal,
  )

  if (turnResult.assistantContent.trim().length > 0) {
    return turnResult.assistantContent
  }

  return streamedText
}

async function generateRawCommitMessage(selection: ActiveModelSelection, promptText: string) {
  if (selection.providerId === 'openai') {
    return generateWithOpenAIChatCompletion('openai', selection, promptText)
  }

  if (selection.providerId === 'openai-compatible') {
    return generateWithOpenAIChatCompletion('openai-compatible', selection, promptText)
  }

  if (selection.providerId === 'anthropic') {
    return generateWithAnthropic(selection, promptText)
  }

  if (selection.providerId === 'google') {
    return generateWithGoogle(selection, promptText)
  }

  return generateWithCodex(selection, promptText)
}

export async function generateCommitMessageFromDiff(input: GenerateCommitMessageInput) {
  const promptContext = buildCommitMessagePrompt({
    diffText: input.diffText,
    numstatText: input.numstatText,
  })

  if (!input.selection) {
    return buildFallbackCommitMessage(promptContext.touchedFiles)
  }

  try {
    const rawModelOutput = await generateRawCommitMessage(input.selection, promptContext.promptText)
    const normalizedMessage = normalizeGeneratedCommitMessage(rawModelOutput)
    if (normalizedMessage.length > 0) {
      return normalizedMessage
    }
  } catch (error) {
    console.warn('Failed to generate AI commit message; using fallback message instead.', error)
  }

  return buildFallbackCommitMessage(promptContext.touchedFiles)
}
