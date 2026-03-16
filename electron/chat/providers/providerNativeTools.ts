import type { Tool as AnthropicTool } from '@anthropic-ai/sdk/resources/messages'
import { FunctionCallingConfigMode, type FunctionDeclaration, type Tool as GoogleTool } from '@google/genai/web'
import type { ChatMode } from '../../../src/types/chat'
import { getOpenAICompatibleToolDefinitions } from '../openaiCompatible/toolRegistry'

function readOpenAIFunctionDefinition(toolDefinition: ReturnType<typeof getOpenAICompatibleToolDefinitions>[number]) {
  if (toolDefinition.tool.type !== 'function') {
    return null
  }

  return toolDefinition.tool.function
}

function ensureToolInputSchema(value: unknown): AnthropicTool['input_schema'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      additionalProperties: false,
      properties: {},
      type: 'object',
    }
  }

  const record = value as Record<string, unknown>
  return {
    ...record,
    type: 'object',
  }
}

function parseArgumentsToObject(argumentsText: string) {
  try {
    const parsedValue = JSON.parse(argumentsText) as unknown
    if (typeof parsedValue === 'object' && parsedValue !== null && !Array.isArray(parsedValue)) {
      return parsedValue as Record<string, unknown>
    }
  } catch {
    return {}
  }

  return {}
}

export function buildAnthropicToolDefinitions(chatMode: ChatMode) {
  const toolDefinitions: AnthropicTool[] = []

  for (const toolDefinition of getOpenAICompatibleToolDefinitions(chatMode)) {
    const functionDefinition = readOpenAIFunctionDefinition(toolDefinition)
    if (!functionDefinition) {
      continue
    }

    toolDefinitions.push({
      description: functionDefinition.description ?? '',
      input_schema: ensureToolInputSchema(functionDefinition.parameters),
      name: functionDefinition.name,
    })
  }

  return toolDefinitions
}

export function buildGoogleToolDefinitions(chatMode: ChatMode) {
  const functionDeclarations: FunctionDeclaration[] = []

  for (const toolDefinition of getOpenAICompatibleToolDefinitions(chatMode)) {
    const functionDefinition = readOpenAIFunctionDefinition(toolDefinition)
    if (!functionDefinition) {
      continue
    }

    functionDeclarations.push({
      description: functionDefinition.description ?? '',
      name: functionDefinition.name,
      parametersJsonSchema: ensureToolInputSchema(functionDefinition.parameters),
    })
  }

  const tools: GoogleTool[] = []
  if (functionDeclarations.length > 0) {
    tools.push({
      functionDeclarations,
    })
  }

  return tools
}

export function toGoogleFunctionCallingMode(forceToolChoice: 'none' | 'required' | undefined) {
  if (forceToolChoice === 'none') {
    return FunctionCallingConfigMode.NONE
  }

  if (forceToolChoice === 'required') {
    return FunctionCallingConfigMode.ANY
  }

  return FunctionCallingConfigMode.AUTO
}

export function parseToolArgumentsTextToObject(argumentsText: string) {
  return parseArgumentsToObject(argumentsText)
}
