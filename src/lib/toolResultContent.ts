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

const TOOL_RESULT_START = '<tool_result>'
const TOOL_RESULT_END = '</tool_result>'
const TOOL_RESULT_BODY_START = '<tool_result_body>'
const TOOL_RESULT_BODY_END = '</tool_result_body>'

function ensureSentenceEnding(text: string) {
  const trimmedText = text.trim()
  if (trimmedText.length === 0) {
    return trimmedText
  }

  const lastCharacter = trimmedText.at(-1)
  if (lastCharacter === '.' || lastCharacter === '!' || lastCharacter === '?') {
    return trimmedText
  }

  return `${trimmedText}.`
}

function buildMutationAcknowledgement(metadata: StructuredToolResultMetadata) {
  if (metadata.status !== 'success') {
    return null
  }

  if (metadata.toolName !== 'edit' && metadata.toolName !== 'apply_patch') {
    return null
  }

  const subjectPath = metadata.subject?.path
  const operation = typeof metadata.semantics?.operation === 'string' ? metadata.semantics.operation : null
  if (typeof subjectPath !== 'string' || subjectPath.trim().length === 0) {
    return null
  }

  if (operation === 'noop') {
    return `Acknowledged workspace state: ${subjectPath} already matched the requested ${metadata.toolName} outcome and remains unchanged.`
  }

  if (metadata.toolName === 'apply_patch') {
    return `Acknowledged workspace state: ${subjectPath} was patched successfully and now reflects the applied changes. Trust this result as the current workspace state for that path.`
  }

  return `Acknowledged workspace state: ${subjectPath} was edited successfully and now reflects the applied changes. Trust this result as the current workspace state for that path.`
}

function buildGeneralSuccessAcknowledgement(metadata: StructuredToolResultMetadata) {
  if (metadata.status !== 'success') {
    return null
  }

  if (typeof metadata.summary !== 'string' || metadata.summary.trim().length === 0) {
    return null
  }

  if (metadata.toolName === 'list') {
    return `Acknowledged directory inspection result: ${ensureSentenceEnding(metadata.summary)}`
  }

  if (metadata.toolName === 'read') {
    return `Acknowledged file read result: ${ensureSentenceEnding(metadata.summary)}`
  }

  if (metadata.toolName === 'glob') {
    return `Acknowledged path search result: ${ensureSentenceEnding(metadata.summary)}`
  }

  if (metadata.toolName === 'grep') {
    return `Acknowledged content search result: ${ensureSentenceEnding(metadata.summary)}`
  }

  return `Acknowledged tool result: ${ensureSentenceEnding(metadata.summary)}`
}

function buildToolResultPreamble(metadata: StructuredToolResultMetadata) {
  const mutationAcknowledgement = buildMutationAcknowledgement(metadata)
  if (mutationAcknowledgement) {
    return `${mutationAcknowledgement} The structured block below is authoritative.`
  }

  if (metadata.status === 'error') {
    return `Acknowledged tool failure: ${ensureSentenceEnding(metadata.summary)} The structured block below is authoritative.`
  }

  const generalAcknowledgement = buildGeneralSuccessAcknowledgement(metadata)
  if (generalAcknowledgement) {
    return `${generalAcknowledgement} The structured block below is authoritative.`
  }

  return 'Completed tool result. The structured block below is authoritative.'
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

function readBetweenMarkers(input: string, startMarker: string, endMarker: string) {
  const startIndex = input.indexOf(startMarker)
  if (startIndex < 0) {
    return null
  }

  const contentStartIndex = startIndex + startMarker.length
  const endIndex = input.indexOf(endMarker, contentStartIndex)
  if (endIndex < 0) {
    return null
  }

  return input.slice(contentStartIndex, endIndex).trim()
}

export function formatStructuredToolResultContent(
  metadata: StructuredToolResultMetadata,
  body?: string | null,
) {
  const parts = [buildToolResultPreamble(metadata), TOOL_RESULT_START, JSON.stringify(metadata, null, 2), TOOL_RESULT_END]

  if (typeof body === 'string' && body.length > 0) {
    parts.push(TOOL_RESULT_BODY_START, body, TOOL_RESULT_BODY_END)
  }

  return parts.join('\n')
}

export function parseStructuredToolResultContent(content: string): ParsedStructuredToolResultContent {
  const metadataBlock = readBetweenMarkers(content, TOOL_RESULT_START, TOOL_RESULT_END)
  const bodyBlock = readBetweenMarkers(content, TOOL_RESULT_BODY_START, TOOL_RESULT_BODY_END)

  if (!metadataBlock) {
    return {
      body: null,
      metadata: null,
    }
  }

  try {
    const parsedMetadata = JSON.parse(metadataBlock) as unknown
    if (!isStructuredToolResultMetadata(parsedMetadata)) {
      return {
        body: bodyBlock,
        metadata: null,
      }
    }

    return {
      body: bodyBlock,
      metadata: {
        ...parsedMetadata,
        ...(parsedMetadata.subject === undefined ? {} : { subject: readSubject(parsedMetadata.subject) }),
      },
    }
  } catch {
    return {
      body: bodyBlock,
      metadata: null,
    }
  }
}
