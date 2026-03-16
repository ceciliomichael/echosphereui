import { editTool } from './tools/edit/index'
import { execCommandTool } from './tools/exec-command/index'
import { globTool } from './tools/glob/index'
import { grepTool } from './tools/grep/index'
import { listTool } from './tools/list/index'
import { readTool } from './tools/read/index'
import { updatePlanTool } from './tools/update-plan/index'
import { writeTool } from './tools/write/index'
import { writeStdinTool } from './tools/write-stdin/index'

const toolRegistry = [
  updatePlanTool,
  listTool,
  readTool,
  globTool,
  grepTool,
  writeTool,
  editTool,
  execCommandTool,
  writeStdinTool,
] as const

export function getOpenAICompatibleToolDefinitions() {
  return [...toolRegistry]
}

export function getOpenAICompatibleToolDefinition(toolName: string) {
  return toolRegistry.find((toolDefinition) => toolDefinition.name === toolName) ?? null
}
