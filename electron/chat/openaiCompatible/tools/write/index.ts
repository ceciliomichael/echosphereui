import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { OpenAICompatibleToolDefinition } from '../../toolTypes'
import { OpenAICompatibleToolError } from '../../toolTypes'
import { parseToolArguments, readRequiredString, readRequiredText, resolveToolPath, toDisplayPath } from '../filesystemToolUtils'
import { getToolDescription } from '../descriptionCatalog'
import { captureWorkspaceCheckpointFileState } from '../../../../workspace/checkpoints'

const TOOL_DESCRIPTION = getToolDescription('write')

async function readExistingContent(absolutePath: string) {
  try {
    const fileStats = await fs.stat(absolutePath)
    if (!fileStats.isFile()) {
      throw new OpenAICompatibleToolError('absolute_path must point to a file for write.', {
        absolutePath,
      })
    }

    return {
      exists: true,
      previousContent: await fs.readFile(absolutePath, 'utf8'),
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return {
        exists: false,
        previousContent: null,
      }
    }

    throw error
  }
}

export const writeTool: OpenAICompatibleToolDefinition = {
  executionMode: 'path-exclusive',
  name: 'write',
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const absolutePath = readRequiredString(argumentsValue, 'absolute_path')
    const content = readRequiredText(argumentsValue, 'content')
    const { normalizedTargetPath, relativePath } = resolveToolPath(context.agentContextRootPath, absolutePath)
    const existing = await readExistingContent(normalizedTargetPath)

    if (context.workspaceCheckpointId) {
      await captureWorkspaceCheckpointFileState(context.workspaceCheckpointId, normalizedTargetPath)
    }

    await fs.mkdir(path.dirname(normalizedTargetPath), { recursive: true })
    await fs.writeFile(normalizedTargetPath, content, 'utf8')

    const displayPath = toDisplayPath(relativePath)
    const contentChanged = existing.previousContent !== content

    return {
      addedPaths: existing.exists ? [] : [displayPath],
      contentChanged,
      deletedPaths: [],
      endLineNumber: undefined,
      message: existing.exists
        ? `Wrote ${displayPath} successfully.`
        : `Created ${displayPath} successfully.`,
      modifiedPaths: existing.exists ? [displayPath] : [],
      newContent: content,
      oldContent: existing.previousContent,
      ok: true,
      operation: 'write',
      path: displayPath,
      startLineNumber: undefined,
      targetKind: 'file',
    }
  },
  tool: {
    function: {
      description: TOOL_DESCRIPTION,
      name: 'write',
      parameters: {
        additionalProperties: false,
        properties: {
          absolute_path: {
            description: 'Absolute file path to write.',
            type: 'string',
          },
          content: {
            description: 'Full content to write to the target file.',
            type: 'string',
          },
        },
        required: ['absolute_path', 'content'],
        type: 'object',
      },
    },
    type: 'function',
  },
}

