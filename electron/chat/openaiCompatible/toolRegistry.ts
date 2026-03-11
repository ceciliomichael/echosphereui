import { getCurrentTimeTool } from './tools/getCurrentTimeTool'

const toolRegistry = [getCurrentTimeTool] as const

export function getOpenAICompatibleToolDefinitions() {
  return [...toolRegistry]
}

export function getOpenAICompatibleToolDefinition(toolName: string) {
  return toolRegistry.find((toolDefinition) => toolDefinition.name === toolName) ?? null
}
