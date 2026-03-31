import type { OpenAICompatibleToolDefinition } from '../../toolTypes'
import { OpenAICompatibleToolError } from '../../toolTypes'
import { parseToolArguments } from '../filesystemToolUtils'
import { getToolDescription } from '../descriptionCatalog'
import { applyPatchText, PatchApplicationError, type ApplyPatchChange } from './patchEngine'

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

function normalizeArguments(argumentsValue: Record<string, unknown>) {
  const patch = typeof argumentsValue.patch === 'string' ? argumentsValue.patch : null
  const input = typeof argumentsValue.input === 'string' ? argumentsValue.input : null
  const patchText = patch ?? input
  if (typeof patchText !== 'string' || patchText.trim().length === 0) {
    throw new OpenAICompatibleToolError('patch must be a non-empty patch string.', {
      fieldName: 'patch',
    })
  }

  return { patch: patchText }
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
    const { patch } = normalizeArguments(argumentsValue)
    let result: Awaited<ReturnType<typeof applyPatchText>>

    try {
      result = await applyPatchText(patch, context.agentContextRootPath)
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
              'A patch string using the *** Begin Patch / *** End Patch format that updates existing files only. File paths may be relative to the workspace root or absolute paths inside the workspace. Copy the exact current file text, include 3 to 8 unique surrounding lines, and avoid generic anchors like "import {" or "function".',
            type: 'string',
          },
        },
        required: ['patch'],
        type: 'object',
      },
    },
    type: 'function',
  },
}
