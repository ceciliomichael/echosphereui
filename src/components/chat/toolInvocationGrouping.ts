import type { ToolInvocationTrace } from '../../types/chat'

interface ToolInvocationSummaryCounts {
  listCount: number
  commandCount: number
  fileCount: number
  searchCount: number
}

function pluralize(count: number, singular: string) {
  if (count === 1) {
    return `${count} ${singular}`
  }

  if (singular === 'search') {
    return `${count} searches`
  }

  return `${count} ${singular}s`
}

function shouldExcludeFromSummary(toolName: string) {
  return toolName === 'apply' || toolName === 'apply_patch'
}

function classifyInvocation(toolName: string): keyof ToolInvocationSummaryCounts | null {
  if (toolName === 'list') {
    return 'listCount'
  }

  if (toolName === 'glob' || toolName === 'grep' || toolName === 'search_query' || toolName === 'image_query') {
    return 'searchCount'
  }

  if (
    toolName === 'run_terminal' ||
    toolName === 'get_terminal_output' ||
    toolName === 'exec_command' ||
    toolName === 'write_stdin' ||
    toolName.includes('terminal')
  ) {
    return 'commandCount'
  }

  if (toolName === 'read') {
    return 'fileCount'
  }

  return null
}

function normalizeToolLabel(toolName: string) {
  return toolName.replace(/_/g, ' ')
}

export function buildToolInvocationGroupSummary(
  invocations: readonly ToolInvocationTrace[],
  summaryVerbOverride?: 'Exploring' | 'Explored',
) {
  const hasActiveInvocation = invocations.some(
    (invocation) => invocation.state === 'running' || invocation.decisionRequest !== undefined,
  )
  const counts: ToolInvocationSummaryCounts = {
    listCount: 0,
    commandCount: 0,
    fileCount: 0,
    searchCount: 0,
  }
  const otherToolCounts = new Map<string, number>()

  for (const invocation of invocations) {
    if (shouldExcludeFromSummary(invocation.toolName)) {
      continue
    }

    const classifiedBucket = classifyInvocation(invocation.toolName)
    if (classifiedBucket) {
      counts[classifiedBucket] += 1
      continue
    }

    const label = normalizeToolLabel(invocation.toolName)
    otherToolCounts.set(label, (otherToolCounts.get(label) ?? 0) + 1)
  }

  const summaryParts: string[] = []
  if (counts.listCount > 0) {
    summaryParts.push(pluralize(counts.listCount, 'list'))
  }
  if (counts.searchCount > 0) {
    summaryParts.push(pluralize(counts.searchCount, 'search'))
  }
  if (counts.commandCount > 0) {
    summaryParts.push(`ran ${pluralize(counts.commandCount, 'command')}`)
  }
  if (counts.fileCount > 0) {
    summaryParts.push(pluralize(counts.fileCount, 'file'))
  }

  for (const [toolLabel, count] of otherToolCounts) {
    summaryParts.push(pluralize(count, toolLabel))
  }

  const summaryVerb = summaryVerbOverride ?? (hasActiveInvocation ? 'Exploring' : 'Explored')
  return summaryParts.length > 0 ? `${summaryVerb} ${summaryParts.join(', ')}` : `${summaryVerb} actions`
}
