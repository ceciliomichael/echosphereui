import { promises as fs } from 'node:fs'
import { ensureFileParentDirectory, parseToolArguments, readRequiredString, readRequiredText, resolveToolPath } from './filesystemToolUtils'
import type { OpenAICompatibleToolDefinition } from '../toolTypes'

export const writeTool: OpenAICompatibleToolDefinition = {
  name: 'write',
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const absolutePath = readRequiredString(argumentsValue, 'absolute_path')
    const content = readRequiredText(argumentsValue, 'content', true)
    const { normalizedTargetPath } = resolveToolPath(context.agentContextRootPath, absolutePath)

    await ensureFileParentDirectory(normalizedTargetPath)
    await fs.writeFile(normalizedTargetPath, content, 'utf8')

    return {
      absolutePath: normalizedTargetPath,
      bytesWritten: Buffer.byteLength(content, 'utf8'),
      ok: true,
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
