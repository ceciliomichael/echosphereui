import { parseStructuredToolResultContent } from '../../../src/lib/toolResultContent'

export function buildCodexGroupedToolResultContent(toolContents: string[]) {
  if (toolContents.length === 0) {
    return null
  }

  const toolSummaryLines: string[] = []
  const latestInspectionStateByKey = new Map<string, string>()
  const latestMutationStateByPath = new Map<string, { operation: string | null; path: string; toolName: string }>()

  for (const toolContent of toolContents) {
    const parsedResult = parseStructuredToolResultContent(toolContent)
    const metadata = parsedResult.metadata
    if (!metadata) {
      continue
    }

    const toolSummary = metadata.summary.trim()
    if (toolSummary.length > 0) {
      const statusPrefix = metadata.status === 'success' ? 'success' : 'failure'
      toolSummaryLines.push(`- ${metadata.toolName} ${statusPrefix}: ${toolSummary}`)
    }

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
        if (startLine !== null && endLine !== null) {
          inspectionStateLine = `- ${subjectPath} was last read at lines ${startLine}-${endLine}.`
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
      if (entry.operation === 'create') {
        return `- ${entry.path} now exists in the workspace after a successful write create.`
      }

      if (entry.operation === 'overwrite') {
        return `- ${entry.path} now reflects the latest successful write content.`
      }

      if (entry.operation === 'noop') {
        return `- ${entry.path} already matched the requested write content and remains unchanged.`
      }
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
      ? ['Latest acknowledged inspection state. Reuse these observations before repeating the same inspection call:', ...latestInspectionStateByKey.values()].join('\n')
      : null
  const toolSummarySection =
    toolSummaryLines.length > 0 ? ['Acknowledged tool result summaries:', ...toolSummaryLines].join('\n') : null

  return [
    'Authoritative tool results from the immediately preceding tool calls. For each mutated path, the latest successful mutation below is the current workspace state. Reuse the latest inspection state below before repeating the same inspection tool call.',
    ...(toolSummarySection ? [toolSummarySection] : []),
    ...(inspectionStateSummary ? [inspectionStateSummary] : []),
    ...(mutationStateSummary ? [mutationStateSummary] : []),
    ...toolContents,
  ].join('\n\n')
}
