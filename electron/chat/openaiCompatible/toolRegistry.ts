import type { ChatMode } from '../../../src/types/chat'
import { applyPatchTool } from './tools/apply-patch/index'
import { askQuestionTool } from './tools/ask-question/index'
import { execCommandTool } from './tools/exec-command/index'
import { globTool } from './tools/glob/index'
import { grepTool } from './tools/grep/index'
import { listTool } from './tools/list/index'
import { readTool } from './tools/read/index'
import { readyImplementTool } from './tools/ready-implement/index'
import { writeTool } from './tools/write/index'
import { writeStdinTool } from './tools/write-stdin/index'

const agentToolRegistry = [
  listTool,
  readTool,
  globTool,
  grepTool,
  applyPatchTool,
  writeTool,
  execCommandTool,
  writeStdinTool,
] as const

const planToolRegistry = [
  listTool,
  readTool,
  globTool,
  grepTool,
  askQuestionTool,
  readyImplementTool,
] as const

function getToolRegistry(chatMode: ChatMode) {
  if (chatMode === 'plan') {
    return planToolRegistry
  }

  return agentToolRegistry
}

export function getOpenAICompatibleToolDefinitions(chatMode: ChatMode = 'agent') {
  return [...getToolRegistry(chatMode)]
}

export function getOpenAICompatibleToolDefinition(
  toolName: string,
  chatMode: ChatMode = 'agent',
) {
  return getToolRegistry(chatMode).find((toolDefinition) => toolDefinition.name === toolName) ?? null
}
