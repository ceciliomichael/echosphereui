import type { StructuredToolResultMetadata } from '../../../src/lib/toolResultContent'
import type { OpenAICompatibleToolCall } from './toolTypes'
import {
  filterUndefinedEntries,
  inferFenceLanguage,
  parseArguments,
  readBoolean,
  readListEntries,
  readNumber,
  readString,
} from './toolResultSupport'

function buildArgumentsSummary(toolName: string, argumentsText: string) {
  const argumentsValue = parseArguments(argumentsText)
  if (!argumentsValue) {
    return undefined
  }

  if (toolName === 'list') {
    return {
      absolute_path: readString(argumentsValue.absolute_path) ?? undefined,
      limit: readNumber(argumentsValue.limit) ?? undefined,
    }
  }

  if (toolName === 'read') {
    return {
      absolute_path: readString(argumentsValue.absolute_path) ?? undefined,
      max_lines: readNumber(argumentsValue.max_lines) ?? undefined,
      start_line: readNumber(argumentsValue.start_line) ?? undefined,
    }
  }

  if (toolName === 'glob') {
    return {
      absolute_path: readString(argumentsValue.absolute_path) ?? undefined,
      max_results: readNumber(argumentsValue.max_results) ?? undefined,
      pattern: readString(argumentsValue.pattern) ?? undefined,
    }
  }

  if (toolName === 'grep') {
    return {
      absolute_path: readString(argumentsValue.absolute_path) ?? undefined,
      case_sensitive: readBoolean(argumentsValue.case_sensitive),
      is_regex: readBoolean(argumentsValue.is_regex),
      max_results: readNumber(argumentsValue.max_results) ?? undefined,
      pattern: readString(argumentsValue.pattern) ?? undefined,
    }
  }

  if (toolName === 'write') {
    return {
      absolute_path: readString(argumentsValue.absolute_path) ?? undefined,
    }
  }

  if (toolName === 'edit') {
    return {
      absolute_path: readString(argumentsValue.absolute_path) ?? undefined,
      replace_all: readBoolean(argumentsValue.replace_all),
    }
  }

  return undefined
}

function buildSuccessSummary(toolName: string, semanticResult: Record<string, unknown>) {
  const subjectPath = readString(semanticResult.path) ?? 'unknown'
  const truncated = readBoolean(semanticResult.truncated)

  if (toolName === 'list') {
    const entryCount = readNumber(semanticResult.entryCount) ?? readListEntries(semanticResult.entries).length
    return `Listed ${subjectPath} with ${entryCount} visible entr${entryCount === 1 ? 'y' : 'ies'}${truncated ? ' (truncated)' : ''}.`
  }

  if (toolName === 'read') {
    const startLine = readNumber(semanticResult.startLine) ?? 1
    const endLine = readNumber(semanticResult.endLine) ?? startLine
    return `Read ${subjectPath} lines ${startLine}-${endLine}${truncated ? ' (truncated)' : ''}.`
  }

  if (toolName === 'glob') {
    const matchCount = readNumber(semanticResult.matchCount) ?? 0
    const pattern = readString(semanticResult.pattern) ?? '*'
    return `Found ${matchCount} path match${matchCount === 1 ? '' : 'es'} for ${pattern} in ${subjectPath}${truncated ? ' (truncated)' : ''}.`
  }

  if (toolName === 'grep') {
    const matchCount = readNumber(semanticResult.matchCount) ?? 0
    const pattern = readString(semanticResult.pattern) ?? ''
    return `Found ${matchCount} search hit${matchCount === 1 ? '' : 's'} for ${pattern} in ${subjectPath}${truncated ? ' (truncated)' : ''}.`
  }

  if (toolName === 'write' || toolName === 'edit') {
    return readString(semanticResult.message) ?? 'Tool completed successfully.'
  }

  return 'Tool completed successfully.'
}

function buildSubject(toolName: string, semanticResult: Record<string, unknown>) {
  const subjectPath = readString(semanticResult.path)
  if (!subjectPath) {
    return undefined
  }

  const defaultKind =
    toolName === 'list' ? 'directory' : toolName === 'glob' || toolName === 'grep' ? 'path' : 'file'
  return {
    kind: readString(semanticResult.targetKind) ?? defaultKind,
    path: subjectPath,
  }
}

function buildSuccessSemantics(toolName: string, semanticResult: Record<string, unknown>) {
  const sharedSemantics = { authoritative: true }

  if (toolName === 'list') {
    return filterUndefinedEntries({
      ...sharedSemantics,
      entry_count: readNumber(semanticResult.entryCount) ?? readListEntries(semanticResult.entries).length,
      total_visible_entry_count: readNumber(semanticResult.totalVisibleEntryCount) ?? undefined,
    })
  }

  if (toolName === 'read') {
    return filterUndefinedEntries({
      ...sharedSemantics,
      end_line: readNumber(semanticResult.endLine) ?? undefined,
      language: inferFenceLanguage(readString(semanticResult.path) ?? ''),
      line_count: readNumber(semanticResult.lineCount) ?? undefined,
      start_line: readNumber(semanticResult.startLine) ?? undefined,
    })
  }

  if (toolName === 'glob') {
    return filterUndefinedEntries({
      ...sharedSemantics,
      match_count: readNumber(semanticResult.matchCount) ?? undefined,
      pattern: readString(semanticResult.pattern) ?? undefined,
      total_match_count: readNumber(semanticResult.totalMatchCount) ?? undefined,
    })
  }

  if (toolName === 'grep') {
    return filterUndefinedEntries({
      ...sharedSemantics,
      match_count: readNumber(semanticResult.matchCount) ?? undefined,
      pattern: readString(semanticResult.pattern) ?? undefined,
    })
  }

  if (toolName === 'write') {
    const operation = readString(semanticResult.operation) ?? undefined
    return filterUndefinedEntries({
      ...sharedSemantics,
      content_changed: readBoolean(semanticResult.contentChanged),
      end_line_number: readNumber(semanticResult.endLineNumber) ?? undefined,
      mutation_applied: operation === 'create' || operation === 'overwrite',
      operation,
      start_line_number: readNumber(semanticResult.startLineNumber) ?? undefined,
      target_exists_after_call: true,
      workspace_effect:
        operation === 'create'
          ? 'file_created'
          : operation === 'overwrite'
            ? 'file_overwritten'
            : operation === 'noop'
              ? 'file_already_matched'
              : undefined,
    })
  }

  if (toolName === 'edit') {
    const operation = readString(semanticResult.operation) ?? undefined
    return filterUndefinedEntries({
      ...sharedSemantics,
      content_changed: readBoolean(semanticResult.contentChanged),
      end_line_number: readNumber(semanticResult.endLineNumber) ?? undefined,
      mutation_applied: operation !== 'noop',
      operation,
      replacement_count: readNumber(semanticResult.replacementCount) ?? undefined,
      start_line_number: readNumber(semanticResult.startLineNumber) ?? undefined,
      target_exists_after_call: true,
      workspace_effect: operation === 'noop' ? 'file_already_matched' : 'file_edited',
    })
  }

  return {}
}

export function buildSuccessMetadata(
  toolCall: OpenAICompatibleToolCall,
  semanticResult: Record<string, unknown>,
): StructuredToolResultMetadata {
  const argumentsSummary = buildArgumentsSummary(toolCall.name, toolCall.argumentsText)
  const subject = buildSubject(toolCall.name, semanticResult)
  const semantics = buildSuccessSemantics(toolCall.name, semanticResult)

  return {
    ...(argumentsSummary === undefined ? {} : { arguments: filterUndefinedEntries(argumentsSummary) }),
    schema: 'echosphere.tool_result/v1',
    ...(Object.keys(semantics).length === 0 ? {} : { semantics }),
    status: 'success',
    ...(subject === undefined ? {} : { subject }),
    summary: buildSuccessSummary(toolCall.name, semanticResult),
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    ...(readBoolean(semanticResult.truncated) ? { truncated: true } : {}),
  }
}

export function buildFailureMetadata(
  toolCall: OpenAICompatibleToolCall,
  errorMessage: string,
  details?: Record<string, unknown>,
): StructuredToolResultMetadata {
  const argumentsSummary = buildArgumentsSummary(toolCall.name, toolCall.argumentsText)
  const semantics = filterUndefinedEntries({
    authoritative: true,
    ...(details ? { details } : {}),
    error_message: errorMessage,
  })

  return {
    ...(argumentsSummary === undefined ? {} : { arguments: filterUndefinedEntries(argumentsSummary) }),
    schema: 'echosphere.tool_result/v1',
    ...(Object.keys(semantics).length === 0 ? {} : { semantics }),
    status: 'error',
    summary: errorMessage,
    toolCallId: toolCall.id,
    toolName: toolCall.name,
  }
}
