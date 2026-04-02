import nodePath from 'node:path'
import type { OpenAICompatibleToolDefinition } from '../../toolTypes'
import { OpenAICompatibleToolError } from '../../toolTypes'
import { parseToolArguments } from '../filesystemToolUtils'
import { getToolDescription } from '../descriptionCatalog'
import { captureWorkspaceCheckpointFileState } from '../../../../workspace/checkpoints'
import {
  applyPatchText,
  PatchApplicationError,
  type ApplyPatchChange,
  type ApplyPatchLineRange,
} from './patchEngine'

const TOOL_DESCRIPTION = getToolDescription('apply_patch')

interface ApplyPatchOperationResult extends Record<string, unknown> {
  changes: ApplyPatchChange[]
  contentChanged: boolean
  message: string
  ok: true
  operation: 'apply_patch'
  path: string
  targetKind: 'file' | 'workspace'
}

interface NormalizedApplyPatchArguments {
  lineRanges?: ApplyPatchLineRange[]
  patch: string
}

function readLineRanges(argumentsValue: Record<string, unknown>) {
  const rawLineRanges = argumentsValue.line_ranges
  if (rawLineRanges === undefined) {
    return undefined
  }

  if (!Array.isArray(rawLineRanges)) {
    throw new OpenAICompatibleToolError('line_ranges must be an array when provided.', {
      fieldName: 'line_ranges',
    })
  }

  const lineRanges: ApplyPatchLineRange[] = []
  for (const [index, rawRange] of rawLineRanges.entries()) {
    if (typeof rawRange !== 'object' || rawRange === null || Array.isArray(rawRange)) {
      throw new OpenAICompatibleToolError('Each line_ranges entry must be an object with path, start_line, and end_line.', {
        fieldName: `line_ranges[${index}]`,
      })
    }

    const pathValue = (rawRange as Record<string, unknown>).path
    const startLineValue = (rawRange as Record<string, unknown>).start_line
    const endLineValue = (rawRange as Record<string, unknown>).end_line

    if (typeof pathValue !== 'string' || pathValue.trim().length === 0) {
      throw new OpenAICompatibleToolError('line_ranges[].path must be a non-empty string.', {
        fieldName: `line_ranges[${index}].path`,
      })
    }

    if (typeof startLineValue !== 'number' || !Number.isInteger(startLineValue) || startLineValue < 1) {
      throw new OpenAICompatibleToolError('line_ranges[].start_line must be a positive integer.', {
        fieldName: `line_ranges[${index}].start_line`,
      })
    }

    if (typeof endLineValue !== 'number' || !Number.isInteger(endLineValue) || endLineValue < 1) {
      throw new OpenAICompatibleToolError('line_ranges[].end_line must be a positive integer.', {
        fieldName: `line_ranges[${index}].end_line`,
      })
    }

    if (endLineValue < startLineValue) {
      throw new OpenAICompatibleToolError('line_ranges[].end_line must be greater than or equal to start_line.', {
        fieldName: `line_ranges[${index}]`,
      })
    }

    lineRanges.push({
      endLine: endLineValue,
      path: pathValue.trim(),
      startLine: startLineValue,
    })
  }

  return lineRanges
}

function normalizeArguments(argumentsValue: Record<string, unknown>) {
  const patch = typeof argumentsValue.patch === 'string' ? argumentsValue.patch : null
  const input = typeof argumentsValue.input === 'string' ? argumentsValue.input : null
  const patchText = patch ?? input
  if (typeof patchText !== 'string' || patchText.trim().length === 0) {
    throw new OpenAICompatibleToolError('patch must be a non-empty patch string.', {
      fieldName: 'patch',
    })
  }

  return {
    lineRanges: readLineRanges(argumentsValue),
    patch: patchText,
  } satisfies NormalizedApplyPatchArguments
}

function summarizeChanges(changes: ApplyPatchChange[]) {
  if (changes.length === 0) {
    return {
      message: 'Patch applied with no file changes.',
      path: '.',
      targetKind: 'workspace' as const,
    }
  }

  if (changes.length === 1) {
    const singleChange = changes[0]
    const verb = singleChange.kind === 'add' ? 'Created' : singleChange.kind === 'delete' ? 'Deleted' : 'Updated'
    return {
      message: `${verb} ${singleChange.fileName} successfully.`,
      path: singleChange.fileName,
      targetKind: 'file' as const,
    }
  }

  return {
    message: `Applied patch to ${changes.length} files successfully.`,
    path: '.',
    targetKind: 'workspace' as const,
  }
}

function toPatchToolError(error: unknown) {
  if (error instanceof PatchApplicationError) {
    return new OpenAICompatibleToolError(error.message, error.details)
  }

  if (error instanceof Error) {
    const details =
      typeof (error as { details?: unknown }).details === 'object' &&
      (error as { details?: unknown }).details !== null &&
      !Array.isArray((error as { details?: unknown }).details)
        ? ((error as { details?: Record<string, unknown> }).details ?? undefined)
        : undefined

    return new OpenAICompatibleToolError(error.message, details)
  }

  return new OpenAICompatibleToolError('Patch application failed.')
}

export const applyPatchTool: OpenAICompatibleToolDefinition = {
  executionMode: 'exclusive',
  name: 'apply_patch',
  parseArguments(argumentsText) {
    const parsed = parseToolArguments(argumentsText)
    return normalizeArguments(parsed)
  },
  async execute(argumentsValue, context): Promise<ApplyPatchOperationResult> {
    const { lineRanges, patch } = normalizeArguments(argumentsValue)
    let result: Awaited<ReturnType<typeof applyPatchText>>

    try {
      result = await applyPatchText(patch, context.agentContextRootPath, {
        beforeCommit: async (changes) => {
          if (!context.workspaceCheckpointId) {
            return
          }

          const capturedPaths = new Set<string>()
          for (const change of changes) {
            const checkpointCandidates = [change.fileName, change.sourcePath]
            for (const candidatePath of checkpointCandidates) {
              if (!candidatePath || capturedPaths.has(candidatePath)) {
                continue
              }

              capturedPaths.add(candidatePath)
              await captureWorkspaceCheckpointFileState(
                context.workspaceCheckpointId,
                nodePath.resolve(context.agentContextRootPath, candidatePath),
              )
            }
          }
        },
        lineRanges,
      })
    } catch (error) {
      throw toPatchToolError(error)
    }

    const { message, path, targetKind } = summarizeChanges(result.changes)
    const contentChanged = result.changes.length > 0

    return {
      changes: result.changes,
      contentChanged,
      message,
      ok: true,
      operation: 'apply_patch',
      path,
      targetKind,
    }
  },
  tool: {
    function: {
      description: TOOL_DESCRIPTION,
      name: 'apply_patch',
      parameters: {
        additionalProperties: false,
        properties: {
          patch: {
            description:
              'A patch string using the *** Begin Patch / *** End Patch format that updates existing files only. File paths may be relative to the workspace root or absolute paths inside the workspace. Copy the exact current file text, include 3 to 8 unique surrounding lines, and avoid generic anchors like "import {" or "function". If read output line prefixes like "12|" are present, they are stripped from hunk lines before patching.',
            type: 'string',
          },
          line_ranges: {
            description:
              'Optional list of per-file line windows that constrain where hunks can match. Use paths from patch headers and 1-based inclusive line numbers.',
            items: {
              additionalProperties: false,
              properties: {
                end_line: {
                  minimum: 1,
                  type: 'integer',
                },
                path: {
                  type: 'string',
                },
                start_line: {
                  minimum: 1,
                  type: 'integer',
                },
              },
              required: ['path', 'start_line', 'end_line'],
              type: 'object',
            },
            type: 'array',
          },
        },
        required: ['patch'],
        type: 'object',
      },
    },
    type: 'function',
  },
}
