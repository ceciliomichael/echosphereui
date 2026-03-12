import { promises as fs } from 'node:fs'
import {
  ensureFileParentDirectory,
  parseToolArguments,
  readRequiredString,
  readRequiredText,
  resolveToolPath,
  toDisplayPath,
} from './filesystemToolUtils'
import type { OpenAICompatibleToolDefinition } from '../toolTypes'
import { OpenAICompatibleToolError } from '../toolTypes'

export const writeTool: OpenAICompatibleToolDefinition = {
  executionMode: 'path-exclusive',
  name: 'write',
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const absolutePath = readRequiredString(argumentsValue, 'absolute_path')
    const content = readRequiredText(argumentsValue, 'content', true)
    const { normalizedTargetPath, relativePath } = resolveToolPath(context.agentContextRootPath, absolutePath)
    let oldContent: string | null = null

    try {
      const targetStats = await fs.stat(normalizedTargetPath)
      if (targetStats.isDirectory()) {
        throw new OpenAICompatibleToolError('absolute_path must point to a file for write.', {
          absolutePath: normalizedTargetPath,
        })
      }

      oldContent = await fs.readFile(normalizedTargetPath, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }

    await ensureFileParentDirectory(normalizedTargetPath)
    await fs.writeFile(normalizedTargetPath, content, 'utf8')

    const contentChanged = oldContent !== content
    const operation =
      oldContent === null ? 'create' : contentChanged ? 'overwrite' : 'noop'
    const message =
      operation === 'create'
        ? `Created ${toDisplayPath(relativePath)} successfully.`
        : operation === 'overwrite'
          ? `Overwrote ${toDisplayPath(relativePath)} successfully.`
          : `Confirmed ${toDisplayPath(relativePath)} already matched the requested content.`

    return {
      contentChanged,
      endLineNumber: content.split('\n').length,
      message,
      newContent: content,
      oldContent,
      ok: true,
      operation,
      path: toDisplayPath(relativePath),
      startLineNumber: 1,
      targetKind: 'file',
    }
  },
  tool: {
    function: {
      description:
        'Create or fully overwrite a file inside the locked thread root. If the target file\'s parent directories do not exist, this tool automatically creates the missing path (for example, writing to src/components/example.txt will create src/components first).',
      name: 'write',
      parameters: {
        additionalProperties: false,
        properties: {
          absolute_path: {
            description:
              'Absolute file path to create or overwrite. Missing parent directories are created automatically.',
            type: 'string',
          },
          content: {
            description: 'The full file content to write.',
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
