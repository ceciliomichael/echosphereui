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

export const writeTool: OpenAICompatibleToolDefinition = {
  name: 'write',
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const absolutePath = readRequiredString(argumentsValue, 'absolute_path')
    const content = readRequiredText(argumentsValue, 'content', true)
    const { normalizedTargetPath, relativePath } = resolveToolPath(context.agentContextRootPath, absolutePath)

    await ensureFileParentDirectory(normalizedTargetPath)
    await fs.writeFile(normalizedTargetPath, content, 'utf8')

    return {
      endLineNumber: content.split('\n').length,
      message: `Created ${toDisplayPath(relativePath)} successfully.`,
      newContent: content,
      ok: true,
      path: toDisplayPath(relativePath),
      startLineNumber: 1,
    }
  },
  tool: {
    function: {
      description: 'Create or fully overwrite a file inside the locked thread root.',
      name: 'write',
      parameters: {
        additionalProperties: false,
        properties: {
          absolute_path: {
            description: 'Absolute file path to create or overwrite.',
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
