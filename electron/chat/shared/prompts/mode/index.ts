import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { ChatMode } from '../../../../../src/types/chat'
import { buildWorkspaceInstructionsBlock } from '../workspaceInstructions'

const PROMPT_REPO_PATH = 'electron/chat/shared/prompts/mode'
const MODE_PROMPT_PATHS: Record<ChatMode, string> = {
  agent: 'agent/prompt.md',
  plan: 'plan/prompt.md',
}
const MARKDOWN_PROMPT_PATH = 'markdown/prompt.md'

function readPromptFile(relativePath: string) {
  const appRoot = process.env.APP_ROOT?.trim()
  const searchRoots = [appRoot, process.cwd()].filter((value): value is string => Boolean(value))

  for (const root of searchRoots) {
    const candidatePath = path.join(root, PROMPT_REPO_PATH, relativePath)
    if (existsSync(candidatePath)) {
      return readFileSync(candidatePath, 'utf8').trim()
    }
  }

  throw new Error(`Unable to load chat prompt file: ${relativePath}`)
}

const cachedPrompts: Partial<Record<ChatMode, string>> = {}
let cachedMarkdownPrompt: string | null = null

function getModePrompt(chatMode: ChatMode) {
  const cachedPrompt = cachedPrompts[chatMode]
  if (cachedPrompt) {
    return cachedPrompt
  }

  const prompt = readPromptFile(MODE_PROMPT_PATHS[chatMode])
  cachedPrompts[chatMode] = prompt
  return prompt
}

function getMarkdownPrompt() {
  if (cachedMarkdownPrompt !== null) {
    return cachedMarkdownPrompt
  }

  cachedMarkdownPrompt = readPromptFile(MARKDOWN_PROMPT_PATH)
  return cachedMarkdownPrompt
}

export function buildChatModeSystemPrompt(chatMode: ChatMode, workspaceRootPath: string) {
  return `${getModePrompt(chatMode)}\n\n${getMarkdownPrompt()}\n\n${buildWorkspaceInstructionsBlock()}\n\nWorkspace root: ${workspaceRootPath}`
}
