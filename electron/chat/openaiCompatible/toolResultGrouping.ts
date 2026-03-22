import { parseStructuredToolResultContent, type StructuredToolResultMetadata } from '../../../src/lib/toolResultContent'

const TERMINAL_REPLAY_MAX_BODY_CHARACTERS = 1_600
const INSPECTION_REPLAY_MAX_BODY_CHARACTERS = Number.MAX_SAFE_INTEGER
const MUTATION_REPLAY_MAX_BODY_CHARACTERS = Number.MAX_SAFE_INTEGER
const PLAN_REPLAY_MAX_BODY_CHARACTERS = 700
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

  if (toolName === 'write' || toolName === 'edit' || toolName === 'file_change') {
    return MUTATION_REPLAY_MAX_BODY_CHARACTERS
  }

  if (toolName === 'todo_write') {
    return PLAN_REPLAY_MAX_BODY_CHARACTERS
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
  if (toolContent.length <= RAW_TOOL_CONTENT_MAX_CHARACTERS) {
    return toolContent
  }

  return [
    toolContent.slice(0, RAW_TOOL_CONTENT_MAX_CHARACTERS),
    '',
    '[legacy tool replay context clipped to reduce context growth]',
  ].join('\n')
}

function buildCompactedToolContent(metadata: StructuredToolResultMetadata, body: string | null) {
  const compactedBody = isTerminalToolName(metadata.toolName)
    ? buildTerminalBodyReplaySnippet(body)
    : buildClippedReplaySnippet(body, resolveReplayBodyCharacterLimit(metadata.toolName))
  const metadataJson = JSON.stringify(metadata, null, 2)
  const compactedParts = ['<tool_result>', metadataJson, '</tool_result>']

  if (compactedBody !== null) {
    compactedParts.push('<tool_result_body>', compactedBody, '</tool_result_body>')
  }

  return compactedParts.join('\n')
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

  if (metadata.toolName === 'file_change') {
    return `file_change:${subjectPath}`
  }

  if (metadata.toolName === 'todo_write') {
    const planId = typeof semantics?.plan_id === 'string' ? semantics.plan_id : 'default'
    return `todo_write:${planId}`
  }

  return `${metadata.toolName}:${metadata.toolCallId}`
}

export function buildCodexGroupedToolResultContent(toolContents: string[]) {
  if (toolContents.length === 0) {
    return null
  }

  const toolSummaryLines: string[] = []
  const replayToolContentByKey = new Map<string, string>()
  let unknownToolContentCounter = 0
  const latestInspectionStateByKey = new Map<string, string>()
  const latestMutationStateByPath = new Map<string, { operation: string | null; path: string; toolName: string }>()

  for (const toolContent of toolContents) {
    const parsedResult = parseStructuredToolResultContent(toolContent)
    const metadata = parsedResult.metadata
    if (!metadata) {
      unknownToolContentCounter += 1
      replayToolContentByKey.set(`legacy:${unknownToolContentCounter}`, buildRawToolContentReplaySnippet(toolContent))
      continue
    }

    const toolSummary = metadata.summary.trim()
    if (toolSummary.length > 0) {
      const statusPrefix = metadata.status === 'success' ? 'success' : 'failure'
      toolSummaryLines.push(`- ${metadata.toolName} ${statusPrefix}: ${toolSummary}`)
    }

    const compactedToolContent = buildCompactedToolContent(metadata, parsedResult.body)
    const replayKey = buildReplayKeyForToolContent(metadata)
    if (replayToolContentByKey.has(replayKey)) {
      replayToolContentByKey.delete(replayKey)
    }
    replayToolContentByKey.set(replayKey, compactedToolContent)

    if (metadata.status !== 'success') {
      continue
    }

    if (metadata.toolName === 'list' || metadata.toolName === 'read' || metadata.toolName === 'glob' || metadata.toolName === 'grep') {
      const subjectPath = metadata.subject?.path ?? '.'
      const semantics = metadata.semantics
      const inspectionStateKey =
        metadata.toolName === 'glob' || metadata.toolName === 'grep'
          ? `${metadata.toolName}:${subjectPath}:${typeof semantics?.pattern === 'string' ? semantics.pattern : ''}`
          : `${metadata.toolName}:${subjectPath}`
      let inspectionStateLine = `- ${toolSummary}`

      if (metadata.toolName === 'list') {
        const entryCount = typeof semantics?.entry_count === 'number' ? semantics.entry_count : null
        if (entryCount !== null) {
          inspectionStateLine = `- ${subjectPath} was last listed with ${entryCount} visible entr${entryCount === 1 ? 'y' : 'ies'}.`
        }
      } else if (metadata.toolName === 'read') {
        const startLine = typeof semantics?.start_line === 'number' ? semantics.start_line : null
        const endLine = typeof semantics?.end_line === 'number' ? semantics.end_line : null
        const totalLineCount = typeof semantics?.total_line_count === 'number' ? semantics.total_line_count : null
        const remainingLineCount =
          typeof semantics?.remaining_line_count === 'number' ? semantics.remaining_line_count : null
        const fullyRead = semantics?.fully_read === true
        if (startLine !== null && endLine !== null) {
          inspectionStateLine = fullyRead
            ? `- ${subjectPath} was fully read at lines ${startLine}-${endLine}${totalLineCount !== null ? ` of ${totalLineCount}` : ''}.`
            : `- ${subjectPath} was last read at lines ${startLine}-${endLine}${totalLineCount !== null ? ` of ${totalLineCount}` : ''}${remainingLineCount !== null ? ` (partial, ${remainingLineCount} lines remaining)` : ''}.`
        }
      } else if (metadata.toolName === 'glob') {
        const matchCount = typeof semantics?.match_count === 'number' ? semantics.match_count : null
        const pattern = typeof semantics?.pattern === 'string' ? semantics.pattern : 'the requested pattern'
        if (matchCount !== null) {
          inspectionStateLine = `- ${subjectPath} was last searched for paths matching ${pattern} with ${matchCount} match${matchCount === 1 ? '' : 'es'}.`
        }
      } else if (metadata.toolName === 'grep') {
        const matchCount = typeof semantics?.match_count === 'number' ? semantics.match_count : null
        const pattern = typeof semantics?.pattern === 'string' ? semantics.pattern : 'the requested pattern'
        if (matchCount !== null) {
          inspectionStateLine = `- ${subjectPath} was last content-searched for ${pattern} with ${matchCount} hit${matchCount === 1 ? '' : 's'}.`
        }
      }

      if (latestInspectionStateByKey.has(inspectionStateKey)) {
        latestInspectionStateByKey.delete(inspectionStateKey)
      }

      latestInspectionStateByKey.set(inspectionStateKey, inspectionStateLine)
    }

    if (metadata.toolName !== 'write' && metadata.toolName !== 'edit') {
      continue
    }

    const subjectPath = metadata.subject?.path
    if (typeof subjectPath !== 'string' || subjectPath.trim().length === 0) {
      continue
    }

    const normalizedPath = subjectPath.trim()
    const semantics = metadata.semantics
    const operation =
      semantics && typeof semantics.operation === 'string' && semantics.operation.trim().length > 0
        ? semantics.operation.trim()
        : null

    if (latestMutationStateByPath.has(normalizedPath)) {
      latestMutationStateByPath.delete(normalizedPath)
    }

    latestMutationStateByPath.set(normalizedPath, {
      operation,
      path: normalizedPath,
      toolName: metadata.toolName,
    })
  }

  const latestMutationStateLines = Array.from(latestMutationStateByPath.values()).map((entry) => {
    if (entry.toolName === 'write') {
      return `- ${entry.path} now reflects the latest successful write changes.`
    }

    if (entry.toolName === 'edit') {
      if (entry.operation === 'noop') {
        return `- ${entry.path} already matched the requested edit outcome and remains unchanged.`
      }

      return `- ${entry.path} now reflects the latest successful edit changes.`
    }

    const operationSuffix = entry.operation ? ` (${entry.operation})` : ''
    return `- ${entry.path}: ${entry.toolName}${operationSuffix}`
  })

  const mutationStateSummary =
    latestMutationStateLines.length > 0
      ? ['Latest acknowledged workspace file state:', ...latestMutationStateLines].join('\n')
      : null
  const inspectionStateSummary =
    latestInspectionStateByKey.size > 0
      ? [
          'Latest acknowledged inspection state. Reuse these observations before repeating the same inspection call. A read marked fully read already covers the whole file unless the workspace changed.',
          ...latestInspectionStateByKey.values(),
        ].join('\n')
      : null
  const toolSummarySection =
    toolSummaryLines.length > 0 ? ['Acknowledged tool result summaries:', ...toolSummaryLines].join('\n') : null
  const replayToolContents = Array.from(replayToolContentByKey.values())

  return [
    'Authoritative tool results from the immediately preceding tool calls. For each mutated path, the latest successful mutation below is the current workspace state. Reuse the latest inspection state below before repeating the same inspection tool call.',
    ...(toolSummarySection ? [toolSummarySection] : []),
    ...(inspectionStateSummary ? [inspectionStateSummary] : []),
    ...(mutationStateSummary ? [mutationStateSummary] : []),
    ...replayToolContents,
  ].join('\n\n')
}
