import { editTool } from './tools/editTool'
import { listTool } from './tools/listTool'
import { readTool } from './tools/readTool'
import { writeTool } from './tools/writeTool'

const toolRegistry = [listTool, readTool, writeTool, editTool] as const

export function getOpenAICompatibleToolDefinitions() {
  return [...toolRegistry]
}

export function getOpenAICompatibleToolDefinition(toolName: string) {
  return toolRegistry.find((toolDefinition) => toolDefinition.name === toolName) ?? null
}
