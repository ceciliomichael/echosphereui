import { getToolResultModelContent, parseStructuredToolResultContent, type StructuredToolResultMetadata } from '../../../src/lib/toolResultContent'

const TERMINAL_REPLAY_MAX_BODY_CHARACTERS = 1_600
const INSPECTION_REPLAY_MAX_BODY_CHARACTERS = Number.MAX_SAFE_INTEGER
const MUTATION_REPLAY_MAX_BODY_CHARACTERS = Number.MAX_SAFE_INTEGER
const DEFAULT_REPLAY_MAX_BODY_CHARACTERS = Number.MAX_SAFE_INTEGER
const RAW_TOOL_CONTENT_MAX_CHARACTERS = Number.MAX_SAFE_INTEGER

function isTerminalToolName(toolName: string) {
  return toolName === 'run_terminal' || toolName === 'get_terminal_output'
}

function buildTerminalSessionReplayKey(metadata: StructuredToolResultMetadata) {
  const semantics = metadata.semantics

  const sessionId = typeof semantics?.session_id === 'number' ? semantics.session_id : null
  const processId = typeof semantics?.process_id === 'number' ? semantics.process_id : null
  const terminalSessionIdentifier = sessionId ?? processId
  if (terminalSessionIdentifier !== null) {
    return `terminal:${terminalSessionIdentifier}`
  }

  const toolCallId = typeof metadata.toolCallId === 'string' ? metadata.toolCallId : null
  if (toolCallId) {
    return `tool:${toolCallId}`
  }

  return `tool:${metadata.toolCallId}`
}

function buildTerminalBodyReplaySnippet(body: string | null) {
  if (typeof body !== 'string' || body.length === 0) {
    return null
  }

  if (body.length <= TERMINAL_REPLAY_MAX_BODY_CHARACTERS) {
    return body
  }

  const clippedBody = body.slice(0, TERMINAL_REPLAY_MAX_BODY_CHARACTERS)
  return [
    clippedBody,
    '',
    '[terminal replay context clipped to reduce context growth; request a fresh poll if more output is needed]',
  ].join('\n')
}

function resolveReplayBodyCharacterLimit(toolName: string) {
  if (toolName === 'run_terminal' || toolName === 'get_terminal_output') {
    return TERMINAL_REPLAY_MAX_BODY_CHARACTERS
  }

  if (toolName === 'list' || toolName === 'read' || toolName === 'glob' || toolName === 'grep') {
    return INSPECTION_REPLAY_MAX_BODY_CHARACTERS
  }

  if (toolName === 'write' || toolName === 'edit' || toolName === 'apply_patch' || toolName === 'file_change') {
    return MUTATION_REPLAY_MAX_BODY_CHARACTERS
  }

  return DEFAULT_REPLAY_MAX_BODY_CHARACTERS
}

function buildClippedReplaySnippet(
  body: string | null,
  maxCharacters: number,
  notice = '[tool replay context clipped to reduce context growth]',
) {
  if (typeof body !== 'string' || body.length === 0) {
    return null
  }

  if (body.length <= maxCharacters) {
    return body
  }

  return [body.slice(0, maxCharacters), '', notice].join('\n')
}

function buildRawToolContentReplaySnippet(toolContent: string) {
  const cleanedToolContent = getToolResultModelContent(toolContent)
  if (cleanedToolContent.length <= RAW_TOOL_CONTENT_MAX_CHARACTERS) {
    return cleanedToolContent
  }

  return [
    cleanedToolContent.slice(0, RAW_TOOL_CONTENT_MAX_CHARACTERS),
    '',
    '[legacy tool replay context clipped to reduce context growth]',
  ].join('\n')
}

interface GroupedToolResultContentItem {
  body: string
  metadata: StructuredToolResultMetadata | null
}

function buildCompactedToolContent(metadata: StructuredToolResultMetadata, body: string | null): GroupedToolResultContentItem {
  const compactedBody = isTerminalToolName(metadata.toolName)
    ? buildTerminalBodyReplaySnippet(body)
    : buildClippedReplaySnippet(body, resolveReplayBodyCharacterLimit(metadata.toolName))

  return {
    body: compactedBody ?? '',
    metadata,
  }
}

function buildReplayKeyForToolContent(metadata: StructuredToolResultMetadata) {
  if (isTerminalToolName(metadata.toolName)) {
    return buildTerminalSessionReplayKey(metadata)
  }

  const subjectPath = metadata.subject?.path ?? '.'
  const semantics = metadata.semantics
  if (metadata.toolName === 'glob' || metadata.toolName === 'grep') {
    const pattern = typeof semantics?.pattern === 'string' ? semantics.pattern : ''
    return `${metadata.toolName}:${subjectPath}:${pattern}`
  }

  if (metadata.toolName === 'list' || metadata.toolName === 'read') {
    if (metadata.toolName === 'read') {
      const startLine = typeof semantics?.start_line === 'number' ? semantics.start_line : null
      const endLine = typeof semantics?.end_line === 'number' ? semantics.end_line : null
      const totalLineCount = typeof semantics?.total_line_count === 'number' ? semantics.total_line_count : null
      return `${metadata.toolName}:${subjectPath}:${startLine ?? 'unknown'}:${endLine ?? 'unknown'}:${totalLineCount ?? 'unknown'}`
    }

    return `${metadata.toolName}:${subjectPath}`
  }

  if (metadata.toolName === 'write' || metadata.toolName === 'edit') {
    return `mutation:${subjectPath}`
  }

  if (metadata.toolName === 'apply_patch') {
    const changedPaths = Array.isArray(semantics?.changed_paths)
      ? semantics.changed_paths.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : []
    if (changedPaths.length > 0) {
      return `apply_patch:${changedPaths.slice().sort().join('|')}`
    }

    return `apply_patch:${subjectPath}`
  }

  if (metadata.toolName === 'file_change') {
    return `file_change:${subjectPath}`
  }

  return `${metadata.toolName}:${metadata.toolCallId}`
}

export function buildCodexGroupedToolResultContent(toolContents: string[]) {
  if (toolContents.length === 0) {
    return null
  }

  const replayToolContentByKey = new Map<string, GroupedToolResultContentItem>()
  let unknownToolContentCounter = 0

  for (const toolContent of toolContents) {
    const parsedResult = parseStructuredToolResultContent(toolContent)
    const metadata = parsedResult.metadata
    if (!metadata) {
      unknownToolContentCounter += 1
      replayToolContentByKey.set(`legacy:${unknownToolContentCounter}`, {
        body: buildRawToolContentReplaySnippet(toolContent),
        metadata: null,
      })
      continue
    }

    const compactedToolContent = buildCompactedToolContent(metadata, parsedResult.body)
    const replayKey = buildReplayKeyForToolContent(metadata)
    if (replayToolContentByKey.has(replayKey)) {
      replayToolContentByKey.delete(replayKey)
    }
    replayToolContentByKey.set(replayKey, compactedToolContent)
  }
  const replayToolContents = Array.from(replayToolContentByKey.values())

  return JSON.stringify({
    schema: 'echosphere.tool_result_group/v1',
    toolResults: replayToolContents,
  }, null, 2)
}
