import path from 'node:path'
import { toDisplayPath } from './filesystemToolUtils'
import { OpenAICompatibleToolError } from '../toolTypes'
import type { TerminalSessionPollResult } from './terminalSessionManager'

export const DEFAULT_EXEC_COMMAND_YIELD_TIME_MS = 10_000
export const DEFAULT_WRITE_STDIN_YIELD_TIME_MS = 250

function readFiniteNumber(value: unknown, fieldName: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new OpenAICompatibleToolError(`${fieldName} must be a finite number when provided.`, {
      fieldName,
      receivedValue: value,
    })
  }

  return value
}

export function readOptionalStringValue(input: Record<string, unknown>, fieldName: string) {
  const value = input[fieldName]
  if (value === undefined) {
    return undefined
  }

  if (typeof value !== 'string') {
    throw new OpenAICompatibleToolError(`${fieldName} must be a string when provided.`, {
      fieldName,
      receivedType: typeof value,
    })
  }

  const normalizedValue = value.trim()
  return normalizedValue.length > 0 ? normalizedValue : undefined
}

export function readOptionalBooleanValue(
  input: Record<string, unknown>,
  fieldName: string,
  defaultValue: boolean,
) {
  const value = input[fieldName]
  if (value === undefined) {
    return defaultValue
  }

  if (typeof value !== 'boolean') {
    throw new OpenAICompatibleToolError(`${fieldName} must be a boolean when provided.`, {
      fieldName,
      receivedType: typeof value,
    })
  }

  return value
}

export function readOptionalPositiveIntegerValue(
  input: Record<string, unknown>,
  fieldName: string,
): number | undefined {
  const value = input[fieldName]
  if (value === undefined) {
    return undefined
  }

  const numericValue = readFiniteNumber(value, fieldName)
  if (!Number.isInteger(numericValue) || numericValue < 1) {
    throw new OpenAICompatibleToolError(`${fieldName} must be a positive integer when provided.`, {
      fieldName,
      receivedValue: value,
    })
  }

  return numericValue
}

export function readOptionalNonNegativeIntegerValue(
  input: Record<string, unknown>,
  fieldName: string,
  defaultValue: number,
) {
  const value = input[fieldName]
  if (value === undefined) {
    return defaultValue
  }

  const numericValue = readFiniteNumber(value, fieldName)
  if (!Number.isInteger(numericValue) || numericValue < 0) {
    throw new OpenAICompatibleToolError(`${fieldName} must be a non-negative integer when provided.`, {
      fieldName,
      receivedValue: value,
    })
  }

  return numericValue
}

export function resolveTerminalWorkingDirectory(agentContextRootPath: string, rawWorkdir?: string) {
  if (!rawWorkdir) {
    return path.resolve(agentContextRootPath)
  }

  if (path.isAbsolute(rawWorkdir)) {
    return path.resolve(rawWorkdir)
  }

  return path.resolve(agentContextRootPath, rawWorkdir)
}

export function toTerminalWorkingDirectoryDisplayPath(agentContextRootPath: string, absoluteWorkdir: string) {
  const normalizedRootPath = path.resolve(agentContextRootPath)
  const normalizedWorkdir = path.resolve(absoluteWorkdir)
  const relativePath = path.relative(normalizedRootPath, normalizedWorkdir)
  const isInsideRoot = !relativePath.startsWith('..') && !path.isAbsolute(relativePath)

  if (!isInsideRoot) {
    return normalizedWorkdir.replace(/\\/g, '/')
  }

  return toDisplayPath(relativePath.length > 0 ? relativePath : '.')
}

export function formatTerminalToolOutput(result: TerminalSessionPollResult) {
  return result.output
}
