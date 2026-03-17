import path from 'node:path'
import type { Tool as AnthropicTool } from '@anthropic-ai/sdk/resources/messages'
import { FunctionCallingConfigMode, type FunctionDeclaration, type Tool as GoogleTool } from '@google/genai/web'
import type { FunctionTool } from '@mistralai/mistralai/models/components'
import { ToolChoiceEnum } from '@mistralai/mistralai/models/components'
import type { ChatMode } from '../../../src/types/chat'
import type { OpenAICompatibleToolCall } from '../openaiCompatible/toolTypes'
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

export function buildMistralToolDefinitions(chatMode: ChatMode) {
  const tools: FunctionTool[] = []

  for (const toolDefinition of getOpenAICompatibleToolDefinitions(chatMode)) {
    const functionDefinition = readOpenAIFunctionDefinition(toolDefinition)
    if (!functionDefinition) {
      continue
    }

    tools.push({
      type: 'function',
      function: {
        description: functionDefinition.description ?? '',
        name: functionDefinition.name,
        parameters: ensureToolInputSchema(functionDefinition.parameters),
      },
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

export function toMistralToolChoice(forceToolChoice: 'none' | 'required' | undefined) {
  if (forceToolChoice === 'none') {
    return ToolChoiceEnum.None
  }

  if (forceToolChoice === 'required') {
    return ToolChoiceEnum.Required
  }

  return ToolChoiceEnum.Auto
}

export function parseToolArgumentsTextToObject(argumentsText: string) {
  return parseArgumentsToObject(argumentsText)
}

export function normalizeToolCallPaths(toolCall: OpenAICompatibleToolCall, agentContextRootPath: string) {
  const argumentsValue = parseToolArgumentsTextToObject(toolCall.argumentsText)
  const absolutePathValue = argumentsValue.absolute_path
  if (typeof absolutePathValue !== 'string' || absolutePathValue.trim().length === 0 || path.isAbsolute(absolutePathValue)) {
    return toolCall
  }

  const normalizedAbsolutePath = path.resolve(agentContextRootPath, absolutePathValue.trim())
  const normalizedArgumentsValue: Record<string, unknown> = {
    ...argumentsValue,
    absolute_path: normalizedAbsolutePath,
  }

  return {
    ...toolCall,
    argumentsText: JSON.stringify(normalizedArgumentsValue),
  }
}
