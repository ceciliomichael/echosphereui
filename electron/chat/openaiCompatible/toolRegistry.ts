import { execCommandTool } from './tools/exec-command/index'
import { globTool } from './tools/glob/index'
import { grepTool } from './tools/grep/index'
import { listTool } from './tools/list/index'
import { patchTool } from './tools/patch/index'
import { readTool } from './tools/read/index'
import { writeTool } from './tools/write/index'
import { writeStdinTool } from './tools/write-stdin/index'

const toolRegistry = [listTool, readTool, globTool, grepTool, patchTool, writeTool, execCommandTool, writeStdinTool] as const

export function getOpenAICompatibleToolDefinitions() {
  return [...toolRegistry]
}

export function getOpenAICompatibleToolDefinition(toolName: string) {
  return toolRegistry.find((toolDefinition) => toolDefinition.name === toolName) ?? null
}
