import type { OpenAICompatibleToolDefinition } from '../../toolTypes'
import { OpenAICompatibleToolError } from '../../toolTypes'
import { getToolDescription } from '../descriptionCatalog'
import { parseToolArguments } from '../filesystemToolUtils'
import { pollTerminalSession, writeTerminalSession } from '../terminalSessionManager'
import {
  DEFAULT_WRITE_STDIN_YIELD_TIME_MS,
  formatTerminalToolOutput,
  readOptionalNonNegativeIntegerValue,
  readOptionalPositiveIntegerValue,
} from '../terminalToolSupport'

const TOOL_DESCRIPTION = getToolDescription('write_stdin')

function readSessionId(argumentsValue: Record<string, unknown>) {
  const rawSessionId = argumentsValue.session_id
  if (typeof rawSessionId !== 'number' || !Number.isInteger(rawSessionId) || rawSessionId < 1) {
    throw new OpenAICompatibleToolError('session_id must be a positive integer.', {
      fieldName: 'session_id',
      receivedValue: rawSessionId,
    })
  }

  return rawSessionId
}

function readChars(argumentsValue: Record<string, unknown>) {
  const rawChars = argumentsValue.chars
  if (rawChars === undefined) {
    return ''
  }

  if (typeof rawChars !== 'string') {
    throw new OpenAICompatibleToolError('chars must be a string when provided.', {
      fieldName: 'chars',
      receivedType: typeof rawChars,
    })
  }

  return rawChars
}

export const writeStdinTool: OpenAICompatibleToolDefinition = {
  executionMode: 'exclusive',
  name: 'write_stdin',
  parseArguments: parseToolArguments,
  async execute(argumentsValue, context) {
    const sessionId = readSessionId(argumentsValue)
    const chars = readChars(argumentsValue)
    const yieldTimeMs = readOptionalNonNegativeIntegerValue(
      argumentsValue,
      'yield_time_ms',
      DEFAULT_WRITE_STDIN_YIELD_TIME_MS,
    )
    const maxOutputTokens = readOptionalPositiveIntegerValue(argumentsValue, 'max_output_tokens')

    try {
      await writeTerminalSession(sessionId, {
        chars,
        signal: context.signal,
      })
    } catch (error) {
      if ((error as Error).message === 'aborted') {
        throw new OpenAICompatibleToolError('Tool execution was aborted.')
      }

      throw new OpenAICompatibleToolError((error as Error).message)
    }

    let pollResult
    try {
      pollResult = await pollTerminalSession({
        maxOutputTokens,
        sessionId,
        signal: context.signal,
        yieldTimeMs,
      })
    } catch (error) {
      if ((error as Error).message === 'aborted') {
        throw new OpenAICompatibleToolError('Tool execution was aborted.')
      }

      throw new OpenAICompatibleToolError((error as Error).message)
    }

    if (pollResult.spawnError) {
      throw new OpenAICompatibleToolError(`Terminal session failed: ${pollResult.spawnError}`)
    }

    const formattedOutput = formatTerminalToolOutput(pollResult)
    const message =
      pollResult.processId === null
        ? `Updated session ${sessionId}. Process exited with code ${pollResult.exitCode ?? 1}.`
        : `Updated session ${sessionId}. Session is still running.`

    return {
      chunkId: pollResult.chunkId,
      commandRunning: pollResult.processId !== null,
      exitCode: pollResult.exitCode,
      message,
      ok: true,
      operation: 'write_stdin',
      originalTokenCount: pollResult.originalTokenCount,
      output: formattedOutput,
      path: '.',
      processId: pollResult.processId,
      sessionId,
      targetKind: 'terminal',
      wallTimeMs: pollResult.wallTimeMs,
    }
  },
  tool: {
    function: {
      description: TOOL_DESCRIPTION,
      name: 'write_stdin',
      parameters: {
        additionalProperties: false,
        properties: {
          chars: {
            description: 'Bytes to write to stdin. Provide an empty string to poll output without sending input.',
            type: 'string',
          },
          max_output_tokens: {
            description: 'Maximum number of output tokens to return before truncation.',
            minimum: 1,
            type: 'integer',
          },
          session_id: {
            description: 'Terminal session identifier returned by exec_command.',
            minimum: 1,
            type: 'integer',
          },
          yield_time_ms: {
            description: 'How long to wait for additional output before returning.',
            minimum: 0,
            type: 'integer',
          },
        },
        required: ['session_id'],
        type: 'object',
      },
    },
    type: 'function',
  },
}

