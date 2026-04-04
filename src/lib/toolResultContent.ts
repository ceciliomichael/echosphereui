export interface StructuredToolResultSubject {
  kind?: string
  path?: string
}

export interface StructuredToolResultMetadata {
  arguments?: Record<string, unknown>
  schema: 'echosphere.tool_result/v1'
  semantics?: Record<string, unknown>
  status: 'error' | 'success'
  subject?: StructuredToolResultSubject
  summary: string
  toolCallId: string
  toolName: string
  truncated?: boolean
}

export interface ParsedStructuredToolResultContent {
  body: string | null
  metadata: StructuredToolResultMetadata | null
}

interface StructuredToolResultEnvelope {
  body?: string
  metadata: StructuredToolResultMetadata
  schema: 'echosphere.tool_result/v2'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readSubject(value: unknown): StructuredToolResultSubject | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  const path = typeof value.path === 'string' ? value.path : undefined
  const kind = typeof value.kind === 'string' ? value.kind : undefined
  if (path === undefined && kind === undefined) {
    return undefined
  }

  return {
    ...(kind === undefined ? {} : { kind }),
    ...(path === undefined ? {} : { path }),
  }
}

function isStructuredToolResultMetadata(value: unknown): value is StructuredToolResultMetadata {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.schema === 'echosphere.tool_result/v1' &&
    (value.status === 'success' || value.status === 'error') &&
    typeof value.summary === 'string' &&
    typeof value.toolCallId === 'string' &&
    typeof value.toolName === 'string' &&
    (value.truncated === undefined || typeof value.truncated === 'boolean') &&
    (value.arguments === undefined || isRecord(value.arguments)) &&
    (value.semantics === undefined || isRecord(value.semantics)) &&
    (value.subject === undefined || readSubject(value.subject) !== undefined)
  )
}

function isStructuredToolResultEnvelope(value: unknown): value is StructuredToolResultEnvelope {
  if (!isRecord(value)) {
    return false
  }

  return (
    value.schema === 'echosphere.tool_result/v2' &&
    isStructuredToolResultMetadata(value.metadata) &&
    (value.body === undefined || typeof value.body === 'string')
  )
}

function formatReadToolResultBody(metadata: StructuredToolResultMetadata, body: string | null) {
  const subjectPath = metadata.subject?.path?.trim() ?? ''
  const absolutePath =
    typeof metadata.arguments?.absolute_path === 'string' ? metadata.arguments.absolute_path.trim() : ''
  const bodyText = body?.trim() ?? ''
  const headerLines = ['Read result']

  if (subjectPath.length > 0) {
    headerLines.push(`Path: ${subjectPath}`)
  }

  if (absolutePath.length > 0 && absolutePath !== subjectPath) {
    headerLines.push(`Absolute path: ${absolutePath}`)
  }

  if (metadata.subject?.kind === 'directory') {
    headerLines.push('Type: directory')
  } else if (metadata.subject?.kind === 'file') {
    headerLines.push('Type: file')
  }

  const lineCount = metadata.semantics && typeof metadata.semantics.line_count === 'number' ? metadata.semantics.line_count : null
  const offset = metadata.semantics && typeof metadata.semantics.offset === 'number' ? metadata.semantics.offset : null
  const entryCount =
    metadata.semantics && typeof metadata.semantics.entry_count === 'number' ? metadata.semantics.entry_count : null

  if (typeof lineCount === 'number') {
    headerLines.push(`Line count: ${lineCount}`)
  }

  if (typeof offset === 'number' && offset > 1) {
    headerLines.push(`Offset: ${offset}`)
  }

  if (typeof entryCount === 'number') {
    headerLines.push(`Entry count: ${entryCount}`)
  }

  if (bodyText.length === 0) {
    return headerLines.join('\n')
  }

  return `${headerLines.join('\n')}\n\n${bodyText}`
}

function formatListToolResultBody(metadata: StructuredToolResultMetadata, body: string | null) {
  const subjectPath = metadata.subject?.path?.trim() ?? ''
  const absolutePath =
    typeof metadata.arguments?.absolute_path === 'string' ? metadata.arguments.absolute_path.trim() : ''
  const bodyText = body?.trim() ?? ''
  const headerLines = ['List result']

  if (absolutePath.length > 0) {
    headerLines.push(`Absolute path: ${absolutePath}`)
  }

  if (subjectPath.length > 0 && subjectPath !== absolutePath) {
    headerLines.push(`Relative path: ${subjectPath}`)
  }

  if (metadata.subject?.kind === 'directory') {
    headerLines.push('Type: directory')
  } else if (metadata.subject?.kind === 'file') {
    headerLines.push('Type: file')
  }

  const count =
    metadata.semantics && typeof metadata.semantics.count === 'number' ? metadata.semantics.count : null

  if (typeof count === 'number') {
    headerLines.push(`Entry count: ${count}`)
  }

  if (bodyText.length === 0) {
    return headerLines.join('\n')
  }

  return `${headerLines.join('\n')}\n\n${bodyText}`
}

export function formatStructuredToolResultContent(
  metadata: StructuredToolResultMetadata,
  body?: string | null,
) {
  // `body` is the model-facing text. If it is omitted, the summary becomes the fallback.
  const envelope: StructuredToolResultEnvelope = {
    ...(typeof body === 'string' && body.length > 0 ? { body } : {}),
    metadata,
    schema: 'echosphere.tool_result/v2',
  }

  return JSON.stringify(envelope, null, 2)
}

export function parseStructuredToolResultContent(content: string): ParsedStructuredToolResultContent {
  try {
    const parsedContent = JSON.parse(content) as unknown
    if (isStructuredToolResultEnvelope(parsedContent)) {
      return {
        body: parsedContent.body ?? null,
        metadata: parsedContent.metadata,
      }
    }
  } catch {
    // Invalid JSON means this is not a structured tool result envelope.
  }

  return {
    body: null,
    metadata: null,
  }
}

export function getToolResultModelContent(content: string) {
  // This is the final text that gets replayed to the model when history is rebuilt.
  const parsedContent = parseStructuredToolResultContent(content)
  if (parsedContent.metadata?.toolName === 'read') {
    return formatReadToolResultBody(parsedContent.metadata, parsedContent.body)
  }

  if (parsedContent.metadata?.toolName === 'list') {
    return formatListToolResultBody(parsedContent.metadata, parsedContent.body)
  }

  if (parsedContent.body) {
    return parsedContent.body
  }

  if (parsedContent.metadata?.summary.trim().length) {
    return parsedContent.metadata.summary.trim()
  }

  return content.trim()
}
