import { promises as fs } from 'node:fs'
import path from 'node:path'
import { OpenAICompatibleToolError } from '../toolTypes'

export function parseToolArguments(argumentsText: string) {
  if (argumentsText.trim().length === 0) {
    return {}
  }

  let parsedValue: unknown
  try {
    parsedValue = JSON.parse(argumentsText)
  } catch (error) {
    throw new OpenAICompatibleToolError('Tool arguments must be valid JSON.', {
      argumentsText,
      parseError: error instanceof Error ? error.message : 'Unknown JSON parse error.',
    })
  }

  if (typeof parsedValue !== 'object' || parsedValue === null || Array.isArray(parsedValue)) {
    throw new OpenAICompatibleToolError('Tool arguments must be a JSON object.', {
      argumentsText,
    })
  }

  return parsedValue as Record<string, unknown>
}

export function readRequiredString(input: Record<string, unknown>, fieldName: string, allowEmpty = false) {
  const rawValue = input[fieldName]
  if (typeof rawValue !== 'string') {
    throw new OpenAICompatibleToolError(`${fieldName} must be a non-empty string.`, {
      fieldName,
    })
  }

  if (!allowEmpty && rawValue.trim().length === 0) {
    throw new OpenAICompatibleToolError(`${fieldName} must be a non-empty string.`, {
      fieldName,
    })
  }

  return allowEmpty ? rawValue : rawValue.trim()
}

export function readRequiredText(input: Record<string, unknown>, fieldName: string, allowEmpty = false) {
  const rawValue = input[fieldName]
  if (typeof rawValue !== 'string') {
    throw new OpenAICompatibleToolError(`${fieldName} must be a string.`, {
      fieldName,
    })
  }

  if (!allowEmpty && rawValue.length === 0) {
    throw new OpenAICompatibleToolError(`${fieldName} must not be empty.`, {
      fieldName,
    })
  }

  return rawValue
}

export function readOptionalBoolean(input: Record<string, unknown>, fieldName: string, defaultValue = false) {
  const rawValue = input[fieldName]
  if (rawValue === undefined) {
    return defaultValue
  }

  if (typeof rawValue !== 'boolean') {
    throw new OpenAICompatibleToolError(`${fieldName} must be a boolean when provided.`, {
      fieldName,
      receivedType: typeof rawValue,
    })
  }

  return rawValue
}

export function readOptionalPositiveInteger(
  input: Record<string, unknown>,
  fieldName: string,
  defaultValue: number,
) {
  const rawValue = input[fieldName]
  if (rawValue === undefined) {
    return defaultValue
  }

  if (typeof rawValue !== 'number' || !Number.isInteger(rawValue) || rawValue < 1) {
    throw new OpenAICompatibleToolError(`${fieldName} must be a positive integer when provided.`, {
      fieldName,
      receivedValue: rawValue,
    })
  }

  return rawValue
}

export function readOptionalBoundedPositiveInteger(
  input: Record<string, unknown>,
  fieldName: string,
  defaultValue: number,
  maxValue: number,
) {
  const value = readOptionalPositiveInteger(input, fieldName, defaultValue)
  if (value > maxValue) {
    throw new OpenAICompatibleToolError(`${fieldName} must be less than or equal to ${maxValue}.`, {
      fieldName,
      maxValue,
      receivedValue: value,
    })
  }

  return value
}

export function resolveToolPath(agentContextRootPath: string, absolutePath: string) {
  const normalizedRootPath = path.resolve(agentContextRootPath)
  const normalizedTargetPath = path.isAbsolute(absolutePath)
    ? path.resolve(absolutePath)
    : path.resolve(normalizedRootPath, absolutePath)
  const relativePath = path.relative(normalizedRootPath, normalizedTargetPath)
  const escapesRoot = relativePath.startsWith('..') || path.isAbsolute(relativePath)

  if (escapesRoot) {
    throw new OpenAICompatibleToolError('absolute_path must stay inside the locked root directory.', {
      absolutePath: normalizedTargetPath,
      agentContextRootPath: normalizedRootPath,
    })
  }

  return {
    normalizedRootPath,
    normalizedTargetPath,
    relativePath: relativePath || '.',
  }
}

export async function readTextFile(absolutePath: string) {
  try {
    return await fs.readFile(absolutePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new OpenAICompatibleToolError('The requested path does not exist.', {
        absolutePath,
      })
    }

    throw error
  }
}

export async function ensureFileParentDirectory(absolutePath: string) {
  await fs.mkdir(path.dirname(absolutePath), { recursive: true })
}

export function normalizeLineEndings(input: string) {
  return input.replace(/\r\n/g, '\n')
}

export function toDisplayPath(input: string) {
  if (input === '.') {
    return '.'
  }

  return input.replace(/\\/g, '/')
}
