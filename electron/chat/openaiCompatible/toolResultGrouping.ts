import { parseStructuredToolResultContent } from '../../../src/lib/toolResultContent'

export function buildCodexGroupedToolResultContent(toolContents: string[]) {
  if (toolContents.length === 0) {
    return null
  }

  const toolSummaryLines: string[] = []
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
  const toolSummarySection =
    toolSummaryLines.length > 0 ? ['Acknowledged tool result summaries:', ...toolSummaryLines].join('\n') : null

  return [
    'Authoritative tool results from the immediately preceding tool calls. For each mutated path, the latest successful mutation below is the current workspace state.',
    ...(toolSummarySection ? [toolSummarySection] : []),
    ...(mutationStateSummary ? [mutationStateSummary] : []),
    ...toolContents,
  ].join('\n\n')
}
