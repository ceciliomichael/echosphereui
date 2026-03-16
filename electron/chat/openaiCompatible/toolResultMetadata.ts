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
      end_line: readNumber(argumentsValue.end_line) ?? undefined,
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
    const content = readString(argumentsValue.content)
    return {
      absolute_path: readString(argumentsValue.absolute_path) ?? undefined,
      content_length: content?.length ?? undefined,
    }
  }

  if (toolName === 'edit') {
    const edits = Array.isArray(argumentsValue.edits) ? argumentsValue.edits : []
    return {
      edit_count: edits.length || undefined,
    }
  }

  if (toolName === 'exec_command') {
    return {
      cmd: readString(argumentsValue.cmd) ?? undefined,
      max_output_tokens: readNumber(argumentsValue.max_output_tokens) ?? undefined,
      shell: readString(argumentsValue.shell) ?? undefined,
      tty: readBoolean(argumentsValue.tty),
      workdir: readString(argumentsValue.workdir) ?? undefined,
      yield_time_ms: readNumber(argumentsValue.yield_time_ms) ?? undefined,
    }
  }

  if (toolName === 'write_stdin') {
    const chars = readString(argumentsValue.chars)
    return {
      chars_length: chars?.length ?? undefined,
      max_output_tokens: readNumber(argumentsValue.max_output_tokens) ?? undefined,
      session_id: readNumber(argumentsValue.session_id) ?? undefined,
      yield_time_ms: readNumber(argumentsValue.yield_time_ms) ?? undefined,
    }
  }

  if (toolName === 'update_plan') {
    const planId = readString(argumentsValue.plan)
    const stepCount = Array.isArray(argumentsValue.steps) ? argumentsValue.steps.length : undefined
    return {
      plan: planId ?? undefined,
      step_count: stepCount,
    }
  }

  if (toolName === 'ready_implement') {
    return {
      no_label: readString(argumentsValue.no_label) ?? undefined,
      prompt: readString(argumentsValue.prompt) ?? undefined,
      yes_label: readString(argumentsValue.yes_label) ?? undefined,
    }
  }

  if (toolName === 'ask_question') {
    const options = Array.isArray(argumentsValue.options)
      ? argumentsValue.options.filter((option): option is Record<string, unknown> => typeof option === 'object' && option !== null)
      : []
    return {
      allow_custom_answer: readBoolean(argumentsValue.allow_custom_answer),
      option_count: options.length,
      question: readString(argumentsValue.question) ?? undefined,
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
    const totalLineCount = readNumber(semanticResult.totalLineCount)
    const remainingLineCount = readNumber(semanticResult.remainingLineCount)
    return `Read ${subjectPath} lines ${startLine}-${endLine}${totalLineCount !== null ? ` of ${totalLineCount}` : ''}${truncated ? ` (truncated${remainingLineCount !== null ? `, ${remainingLineCount} lines remaining` : ''})` : ''}.`
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

  if (toolName === 'write') {
    const subjectPath = readString(semanticResult.path) ?? 'unknown'
    const contentChanged = readBoolean(semanticResult.contentChanged)
    if (contentChanged === false) {
      return readString(semanticResult.message) ?? `Write completed with no content change for ${subjectPath}.`
    }

    return `Created ${subjectPath}. The reported file content now reflects the current workspace state.`
  }

  if (toolName === 'edit') {
    const operation = readString(semanticResult.operation) ?? 'edit'
    const subjectPath = readString(semanticResult.path) ?? 'unknown'
    const contentChanged = readBoolean(semanticResult.contentChanged)
    const hasCurrentContent = typeof semanticResult.newContent === 'string'

    if (operation === 'noop' || contentChanged === false) {
      return readString(semanticResult.message) ?? `Edit completed with no content change for ${subjectPath}.`
    }

    if (hasCurrentContent) {
      return `Applied edits to ${subjectPath}. The current workspace state for this path is included below and should be treated as authoritative.`
    }

    return 'Applied edits successfully. Treat the reported changed paths as the current workspace state.'
  }

  if (toolName === 'exec_command') {
    const executionMode = readString(semanticResult.executionMode) ?? 'full'
    const sessionId = readNumber(semanticResult.processId)
    const exitCode = readNumber(semanticResult.exitCode)
    if (sessionId !== null) {
      return `Started terminal command in ${executionMode} mode with session ${sessionId}.`
    }

    return `Executed terminal command in ${executionMode} mode${exitCode !== null ? ` (exit code ${exitCode})` : ''}.`
  }

  if (toolName === 'write_stdin') {
    const sessionId = readNumber(semanticResult.sessionId)
    const nextProcessId = readNumber(semanticResult.processId)
    const exitCode = readNumber(semanticResult.exitCode)
    if (nextProcessId !== null) {
      return `Updated terminal session ${sessionId ?? nextProcessId}; session is still running.`
    }

    return `Updated terminal session ${sessionId ?? 'unknown'}${exitCode !== null ? ` (exit code ${exitCode})` : ''}.`
  }

  if (toolName === 'update_plan') {
    const planId = readString(semanticResult.planId) ?? 'default'
    const completedStepCount = readNumber(semanticResult.completedStepCount) ?? 0
    const totalStepCount = readNumber(semanticResult.totalStepCount) ?? completedStepCount
    const allStepsCompleted = readBoolean(semanticResult.allStepsCompleted)
    const operation = readString(semanticResult.operation)
    if (operation === 'noop') {
      return `Plan ${planId} unchanged (${completedStepCount}/${totalStepCount} steps completed).`
    }
    return allStepsCompleted
      ? `Plan ${planId} is complete (${completedStepCount}/${totalStepCount} steps).`
      : `Plan ${planId} updated (${completedStepCount}/${totalStepCount} steps completed).`
  }

  if (toolName === 'ready_implement') {
    const selectedOptionLabel = readString(semanticResult.selectedOptionLabel)
    const answerText = readString(semanticResult.answerText)
    if (selectedOptionLabel) {
      return `Implementation decision received: ${selectedOptionLabel}.`
    }

    if (answerText) {
      return `Implementation decision received: ${answerText}.`
    }

    return 'Implementation decision received.'
  }

  if (toolName === 'ask_question') {
    const answerText = readString(semanticResult.answerText)
    if (answerText) {
      return `User answered planning question: ${answerText}.`
    }

    return 'User answered planning question.'
  }

  return 'Tool completed successfully.'
}

function buildSubject(toolName: string, semanticResult: Record<string, unknown>) {
  const subjectPath = readString(semanticResult.path)
  if (!subjectPath) {
    return undefined
  }

  if (toolName === 'write_stdin' && subjectPath === '.') {
    return undefined
  }

  const defaultKind =
    toolName === 'list'
      ? 'directory'
      : toolName === 'glob' || toolName === 'grep'
        ? 'path'
        : toolName === 'exec_command'
          ? 'directory'
          : toolName === 'write_stdin'
            ? 'terminal'
            : 'file'
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
      has_more_lines: readBoolean(semanticResult.hasMoreLines),
      language: inferFenceLanguage(readString(semanticResult.path) ?? ''),
      max_read_line_count: readNumber(semanticResult.maxReadLineCount) ?? undefined,
      next_end_line: readNumber(semanticResult.nextEndLine) ?? undefined,
      next_start_line: readNumber(semanticResult.nextStartLine) ?? undefined,
      line_count: readNumber(semanticResult.lineCount) ?? undefined,
      remaining_line_count: readNumber(semanticResult.remainingLineCount) ?? undefined,
      start_line: readNumber(semanticResult.startLine) ?? undefined,
      total_line_count: readNumber(semanticResult.totalLineCount) ?? undefined,
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
    const addedPaths = Array.isArray(semanticResult.addedPaths)
      ? semanticResult.addedPaths.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : []
    const modifiedPaths = Array.isArray(semanticResult.modifiedPaths)
      ? semanticResult.modifiedPaths.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : []
    const deletedPaths = Array.isArray(semanticResult.deletedPaths)
      ? semanticResult.deletedPaths.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : []
    const totalChangedPaths = addedPaths.length + modifiedPaths.length + deletedPaths.length
    const operation = readString(semanticResult.operation) ?? 'write'
    return filterUndefinedEntries({
      ...sharedSemantics,
      added_path_count: addedPaths.length,
      content_changed: readBoolean(semanticResult.contentChanged),
      deleted_path_count: deletedPaths.length,
      mutation_applied: totalChangedPaths > 0 || readBoolean(semanticResult.contentChanged),
      modified_path_count: modifiedPaths.length,
      operation,
      target_exists_after_call: true,
      workspace_effect: totalChangedPaths > 0 || readBoolean(semanticResult.contentChanged) ? 'files_edited' : 'file_already_matched',
    })
  }

  if (toolName === 'edit') {
    const addedPaths = Array.isArray(semanticResult.addedPaths)
      ? semanticResult.addedPaths.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : []
    const modifiedPaths = Array.isArray(semanticResult.modifiedPaths)
      ? semanticResult.modifiedPaths.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : []
    const deletedPaths = Array.isArray(semanticResult.deletedPaths)
      ? semanticResult.deletedPaths.filter((value): value is string => typeof value === 'string' && value.length > 0)
      : []
    const totalChangedPaths = addedPaths.length + modifiedPaths.length + deletedPaths.length
    const operation = readString(semanticResult.operation) ?? 'edit'
    const contentChanged = readBoolean(semanticResult.contentChanged)
    return filterUndefinedEntries({
      ...sharedSemantics,
      added_path_count: addedPaths.length,
      content_changed: contentChanged,
      deleted_path_count: deletedPaths.length,
      mutation_applied: totalChangedPaths > 0 || contentChanged,
      modified_path_count: modifiedPaths.length,
      operation,
      target_exists_after_call: true,
      workspace_effect: totalChangedPaths > 0 || contentChanged ? 'files_edited' : 'file_already_matched',
    })
  }

  if (toolName === 'exec_command') {
    const processId = readNumber(semanticResult.processId)
    return filterUndefinedEntries({
      ...sharedSemantics,
      command_running: processId !== null,
      end_line_number: undefined,
      exit_code: readNumber(semanticResult.exitCode) ?? undefined,
      mutation_applied: false,
      operation: readString(semanticResult.operation) ?? undefined,
      output_token_count: readNumber(semanticResult.originalTokenCount) ?? undefined,
      process_id: processId ?? undefined,
      start_line_number: undefined,
      target_exists_after_call: true,
      working_directory: readString(semanticResult.path) ?? undefined,
      workspace_effect: 'no_file_change',
    })
  }

  if (toolName === 'write_stdin') {
    const processId = readNumber(semanticResult.processId)
    return filterUndefinedEntries({
      ...sharedSemantics,
      command_running: processId !== null,
      end_line_number: undefined,
      exit_code: readNumber(semanticResult.exitCode) ?? undefined,
      mutation_applied: false,
      operation: readString(semanticResult.operation) ?? undefined,
      output_token_count: readNumber(semanticResult.originalTokenCount) ?? undefined,
      process_id: processId ?? undefined,
      session_id: readNumber(semanticResult.sessionId) ?? undefined,
      start_line_number: undefined,
      target_exists_after_call: true,
      workspace_effect: 'no_file_change',
    })
  }

  if (toolName === 'ready_implement') {
    return filterUndefinedEntries({
      ...sharedSemantics,
      answer_text: readString(semanticResult.answerText) ?? undefined,
      next_chat_mode: readString(semanticResult.nextChatMode) ?? undefined,
      operation: readString(semanticResult.operation) ?? 'ready_implement',
      selected_option_id: readString(semanticResult.selectedOptionId) ?? undefined,
      selected_option_label: readString(semanticResult.selectedOptionLabel) ?? undefined,
      workspace_effect: 'no_file_change',
    })
  }

  if (toolName === 'ask_question') {
    return filterUndefinedEntries({
      ...sharedSemantics,
      allow_custom_answer: readBoolean(semanticResult.allowCustomAnswer),
      answer_text: readString(semanticResult.answerText) ?? undefined,
      operation: readString(semanticResult.operation) ?? 'ask_question',
      selected_option_id: readString(semanticResult.selectedOptionId) ?? undefined,
      selected_option_label: readString(semanticResult.selectedOptionLabel) ?? undefined,
      used_custom_answer: readBoolean(semanticResult.usedCustomAnswer),
      workspace_effect: 'no_file_change',
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
