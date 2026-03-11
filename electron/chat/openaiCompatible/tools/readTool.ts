import { promises as fs } from 'node:fs'
import { parseToolArguments, readOptionalPositiveInteger, readRequiredString, resolveToolPath } from './filesystemToolUtils'
import type { OpenAICompatibleToolDefinition } from '../toolTypes'
import { OpenAICompatibleToolError } from '../toolTypes'

const DEFAULT_READ_LINE_COUNT = 250

export const readTool: OpenAICompatibleToolDefinition = {
  name: 'read',
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const absolutePath = readRequiredString(argumentsValue, 'absolute_path')
    const startLine = readOptionalPositiveInteger(argumentsValue, 'start_line', 1)
    const maxLines = readOptionalPositiveInteger(argumentsValue, 'max_lines', DEFAULT_READ_LINE_COUNT)
    const { normalizedTargetPath } = resolveToolPath(context.agentContextRootPath, absolutePath)
    const fileContent = await fs.readFile(normalizedTargetPath, 'utf8').catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new OpenAICompatibleToolError('The requested file does not exist.', {
          absolutePath: normalizedTargetPath,
        })
      }

      if ((error as NodeJS.ErrnoException).code === 'EISDIR') {
        throw new OpenAICompatibleToolError('absolute_path must point to a file for read.', {
          absolutePath: normalizedTargetPath,
        })
      }

      throw error
    })

    const normalizedContent = fileContent.replace(/\r\n/g, '\n')
    const lines = normalizedContent.split('\n')
    const safeStartLine = Math.max(1, Math.min(startLine, lines.length || 1))
    const safeEndLine = Math.min(lines.length || safeStartLine, safeStartLine + maxLines - 1)
    const selectedLines = lines.slice(safeStartLine - 1, safeEndLine)

    return {
      absolutePath: normalizedTargetPath,
      content: selectedLines.join('\n'),
      endLine: safeEndLine,
      ok: true,
      startLine: safeStartLine,
      totalLines: lines.length,
      truncated: safeEndLine < lines.length,
    }
  },
  tool: {
    function: {
      description: 'Read file content from an absolute path inside the locked thread root.',
      name: 'read',
      parameters: {
        additionalProperties: false,
        properties: {
          absolute_path: {
            description: 'Absolute file path to read.',
            type: 'string',
          },
          max_lines: {
            description: 'Optional maximum number of lines to return.',
            minimum: 1,
            type: 'integer',
          },
          start_line: {
            description: 'Optional 1-based line number to start reading from.',
            minimum: 1,
            type: 'integer',
          },
        },
        required: ['absolute_path'],
        type: 'object',
      },
    },
    type: 'function',
  },
}
