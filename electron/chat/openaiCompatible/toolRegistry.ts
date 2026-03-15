import { patchTool } from './tools/patchTool'
import { execCommandTool } from './tools/execCommandTool'
import { globTool } from './tools/globTool'
import { grepTool } from './tools/grepTool'
import { listTool } from './tools/listTool'
import { readTool } from './tools/readTool'
import { writeStdinTool } from './tools/writeStdinTool'

const toolRegistry = [listTool, readTool, globTool, grepTool, patchTool, execCommandTool, writeStdinTool] as const

export function getOpenAICompatibleToolDefinitions() {
  return [...toolRegistry]
}

export function getOpenAICompatibleToolDefinition(toolName: string) {
  return toolRegistry.find((toolDefinition) => toolDefinition.name === toolName) ?? null
}
