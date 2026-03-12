import { editTool } from './tools/editTool'
import { globTool } from './tools/globTool'
import { grepTool } from './tools/grepTool'
import { listTool } from './tools/listTool'
import { readTool } from './tools/readTool'
import { writeTool } from './tools/writeTool'

const toolRegistry = [listTool, readTool, globTool, grepTool, writeTool, editTool] as const

export function getOpenAICompatibleToolDefinitions() {
  return [...toolRegistry]
}

export function getOpenAICompatibleToolDefinition(toolName: string) {
  return toolRegistry.find((toolDefinition) => toolDefinition.name === toolName) ?? null
}
