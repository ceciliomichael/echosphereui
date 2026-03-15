import { promises as fs } from 'node:fs'
import { createReadStream } from 'node:fs'
import readline from 'node:readline'
import {
  parseToolArguments,
  readOptionalBoundedPositiveInteger,
  readOptionalPositiveInteger,
  readRequiredString,
  resolveToolPath,
  toDisplayPath,
} from '../filesystemToolUtils'
import { getToolDescription } from '../descriptionCatalog'
import type { OpenAICompatibleToolDefinition } from '../../toolTypes'
import { OpenAICompatibleToolError } from '../../toolTypes'

const DEFAULT_READ_LINE_COUNT = 500
const MAX_READ_LINE_COUNT = 500
const TOOL_DESCRIPTION = getToolDescription('read')

interface ReadSliceResult {
  lineCount: number
  selectedLines: string[]
}

async function readFileSliceByLine(absolutePath: string, startLine: number, lineLimit: number): Promise<ReadSliceResult> {
  const selectedLines: string[] = []
  let lineCount = 0

  const fileStream = createReadStream(absolutePath, { encoding: 'utf8' })
  const lineReader = readline.createInterface({
    crlfDelay: Infinity,
    input: fileStream,
  })

  try {
    for await (const line of lineReader) {
      lineCount += 1
      if (lineCount < startLine) {
        continue
      }
      if (selectedLines.length < lineLimit) {
        selectedLines.push(line)
      }
    }
  } finally {
    lineReader.close()
    fileStream.destroy()
  }

  return {
    lineCount,
    selectedLines,
  }
}

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
    const boundedLineCountFromRange =
      requestedLineCountFromRange === undefined
        ? undefined
        : Math.min(requestedLineCountFromRange, MAX_READ_LINE_COUNT)

    const hasMaxLines = argumentsValue.max_lines !== undefined
    const requestedLineCount =
      boundedLineCountFromRange === undefined
        ? maxLines
        : hasMaxLines
          ? Math.min(boundedLineCountFromRange, maxLines)
          : boundedLineCountFromRange
    const { normalizedTargetPath, relativePath } = resolveToolPath(context.agentContextRootPath, absolutePath)
    const fileStat = await fs.stat(normalizedTargetPath).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new OpenAICompatibleToolError('The requested file does not exist.', {
          absolutePath: normalizedTargetPath,
        })
      }
      throw error
    })
    if (!fileStat.isFile()) {
      throw new OpenAICompatibleToolError('absolute_path must point to a file for read.', {
        absolutePath: normalizedTargetPath,
      })
    }

    const { lineCount: totalLineCount, selectedLines } = await readFileSliceByLine(
      normalizedTargetPath,
      startLine,
      requestedLineCount,
    ).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === 'EISDIR') {
        throw new OpenAICompatibleToolError('absolute_path must point to a file for read.', {
          absolutePath: normalizedTargetPath,
        })
      }
      throw error
    })

    if (totalLineCount < startLine) {
      return {
        content: '',
        endLine: Math.max(startLine - 1, 0),
        hasMoreLines: false,
        lineCount: 0,
        maxReadLineCount: MAX_READ_LINE_COUNT,
        nextEndLine: null,
        nextStartLine: null,
        ok: true,
        path: toDisplayPath(relativePath),
        remainingLineCount: 0,
        startLine,
        targetKind: 'file',
        totalLineCount,
        truncated: false,
      }
    }

    const safeStartLine = startLine
    const safeEndLine = safeStartLine + selectedLines.length - 1
    const hasMoreLines = safeEndLine < totalLineCount
    const remainingLineCount = hasMoreLines ? totalLineCount - safeEndLine : 0
    const nextStartLine = hasMoreLines ? safeEndLine + 1 : null
    const nextEndLine = hasMoreLines ? Math.min(totalLineCount, safeEndLine + maxLines) : null

    return {
      content: selectedLines.join('\n'),
      endLine: safeEndLine,
      hasMoreLines,
      lineCount: selectedLines.length,
      maxReadLineCount: MAX_READ_LINE_COUNT,
      nextEndLine,
      nextStartLine,
      ok: true,
      path: toDisplayPath(relativePath),
      remainingLineCount,
      startLine: safeStartLine,
      targetKind: 'file',
      totalLineCount,
      truncated: hasMoreLines,
    }
  },
  tool: {
    function: {
      description: TOOL_DESCRIPTION,
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
              'Optional 1-based inclusive ending line. With start_line, the requested size is end_line - start_line + 1. If the requested range exceeds 500 lines, the tool automatically returns at most 500 lines.',
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

