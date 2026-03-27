import type { OpenAICompatibleToolDefinition } from '../../toolTypes'
import { OpenAICompatibleToolError } from '../../toolTypes'
import { parseToolArguments } from '../filesystemToolUtils'
import { getToolDescription } from '../descriptionCatalog'
import { applyPatchText, type ApplyPatchChange } from './patchEngine'

const TOOL_DESCRIPTION = getToolDescription('apply_patch')

interface ApplyPatchOperationResult extends Record<string, unknown> {
  addedPaths: string[]
  changeCount: number
  changes: ApplyPatchChange[]
  contentChanged: boolean
  deletedPaths: string[]
  message: string
  modifiedPaths: string[]
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
  const addedPaths = changes.filter((change) => change.kind === 'add').map((change) => change.fileName)
  const modifiedPaths = changes.filter((change) => change.kind === 'update').map((change) => change.fileName)
  const deletedPaths = changes.filter((change) => change.kind === 'delete').map((change) => change.fileName)
  const changedPaths = [...addedPaths, ...modifiedPaths, ...deletedPaths]

  if (changedPaths.length === 0) {
    return {
      addedPaths,
      deletedPaths,
      message: 'Patch applied with no file changes.',
      modifiedPaths,
      path: '.',
      targetKind: 'workspace' as const,
    }
  }

  if (changedPaths.length === 1) {
    const singleChange = changes[0]
    const verb = singleChange.kind === 'add' ? 'Created' : singleChange.kind === 'delete' ? 'Deleted' : 'Updated'
    return {
      addedPaths,
      deletedPaths,
      message: `${verb} ${singleChange.fileName} successfully.`,
      modifiedPaths,
      path: singleChange.fileName,
      targetKind: 'file' as const,
    }
  }

  return {
    addedPaths,
    deletedPaths,
    message: `Applied patch to ${changedPaths.length} files successfully.`,
    modifiedPaths,
    path: '.',
    targetKind: 'workspace' as const,
  }
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
    const result = await applyPatchText(patch, context.agentContextRootPath)
    const { addedPaths, deletedPaths, message, modifiedPaths, path, targetKind } = summarizeChanges(result.changes)
    const contentChanged = result.changes.length > 0

    return {
      addedPaths,
      changeCount: result.changes.length,
      changes: result.changes,
      contentChanged,
      deletedPaths,
      message,
      modifiedPaths,
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
              'A patch string using the *** Begin Patch / *** End Patch format. File paths may be relative to the workspace root or absolute paths inside the workspace. Include exact current file context and enough surrounding lines to anchor each change.',
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
