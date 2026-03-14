import { promises as fs } from 'node:fs'
import {
  parseToolArguments,
  readOptionalBoundedPositiveInteger,
  readOptionalPositiveInteger,
  readRequiredString,
  resolveToolPath,
  toDisplayPath,
} from './filesystemToolUtils'
import type { OpenAICompatibleToolDefinition } from '../toolTypes'
import { OpenAICompatibleToolError } from '../toolTypes'

const DEFAULT_READ_LINE_COUNT = 500
const MAX_READ_LINE_COUNT = 500

export const readTool: OpenAICompatibleToolDefinition = {
  executionMode: 'parallel',
  name: 'read',
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const absolutePath = readRequiredString(argumentsValue, 'absolute_path')
    const startLine = readOptionalPositiveInteger(argumentsValue, 'start_line', 1)
    const maxLines = readOptionalBoundedPositiveInteger(
      argumentsValue,
      'max_lines',
      DEFAULT_READ_LINE_COUNT,
      MAX_READ_LINE_COUNT,
    )
    const hasEndLine = argumentsValue.end_line !== undefined
    const endLine = hasEndLine ? readOptionalPositiveInteger(argumentsValue, 'end_line', startLine) : undefined

    if (endLine !== undefined && endLine < startLine) {
      throw new OpenAICompatibleToolError('end_line must be greater than or equal to start_line.', {
        endLine,
        startLine,
      })
    }

    const requestedLineCountFromRange = endLine === undefined ? undefined : endLine - startLine + 1
    if (requestedLineCountFromRange !== undefined && requestedLineCountFromRange > MAX_READ_LINE_COUNT) {
      const maxEndLineForStart = startLine + MAX_READ_LINE_COUNT - 1
      throw new OpenAICompatibleToolError(
        `Requested range must include at most ${MAX_READ_LINE_COUNT} lines. Line ranges are inclusive, so for start_line=${startLine} the maximum end_line is ${maxEndLineForStart}.`,
        {
        endLine,
        maxAllowedLines: MAX_READ_LINE_COUNT,
        maxEndLineForStart,
        requestedLineCount: requestedLineCountFromRange,
        startLine,
        },
      )
    }

    const hasMaxLines = argumentsValue.max_lines !== undefined
    const requestedLineCount =
      requestedLineCountFromRange === undefined
        ? maxLines
        : hasMaxLines
          ? Math.min(requestedLineCountFromRange, maxLines)
          : requestedLineCountFromRange
    const { normalizedTargetPath, relativePath } = resolveToolPath(context.agentContextRootPath, absolutePath)
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
    const safeEndLine = Math.min(lines.length || safeStartLine, safeStartLine + requestedLineCount - 1)
    const selectedLines = lines.slice(safeStartLine - 1, safeEndLine)

    return {
      content: selectedLines.join('\n'),
      endLine: safeEndLine,
      lineCount: selectedLines.length,
      ok: true,
      path: toDisplayPath(relativePath),
      startLine: safeStartLine,
      targetKind: 'file',
      truncated: safeEndLine < lines.length,
    }
  },
  tool: {
    function: {
      description:
        'Read file content from an absolute path inside the locked thread root. You can request a specific inclusive line range with start_line and end_line.',
      name: 'read',
      parameters: {
        additionalProperties: false,
        properties: {
          absolute_path: {
            description: 'Absolute file path to read.',
            type: 'string',
          },
          max_lines: {
            description:
              'Optional line cap (1-500). If start_line/end_line is also provided, returned lines are limited by both constraints.',
            maximum: 500,
            minimum: 1,
            type: 'integer',
          },
          end_line: {
            description:
              'Optional 1-based inclusive ending line. With start_line, the requested size is end_line - start_line + 1 and must be <= 500. Example: start_line=500,end_line=999 is valid (500 lines); end_line=1000 is invalid (501 lines).',
            minimum: 1,
            type: 'integer',
          },
          start_line: {
            description:
              'Optional 1-based starting line (inclusive). Use with end_line for an explicit range; range size is inclusive.',
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
