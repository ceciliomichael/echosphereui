import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

const WORKSPACE_INSTRUCTIONS_REPO_PATH = 'AGENTS.md'

function resolveWorkspaceInstructionsPath() {
  const appRoot = process.env.APP_ROOT?.trim()
  const searchRoots = [appRoot, process.cwd()].filter((value): value is string => Boolean(value))

  for (const root of searchRoots) {
    const candidatePath = path.join(root, WORKSPACE_INSTRUCTIONS_REPO_PATH)
    if (existsSync(candidatePath)) {
      return candidatePath
    }
  }

  return null
}

function readWorkspaceInstructionsContent() {
  const sourcePath = resolveWorkspaceInstructionsPath()
  if (sourcePath) {
    return readFileSync(sourcePath, 'utf8')
  }

  throw new Error('Unable to load workspace instructions from AGENTS.md')
}

let cachedWorkspaceInstructionsBlock: string | null = null

export function buildWorkspaceInstructionsBlock() {
  if (cachedWorkspaceInstructionsBlock) {
    return cachedWorkspaceInstructionsBlock
  }

  const content = readWorkspaceInstructionsContent()
  cachedWorkspaceInstructionsBlock = [
    '<user_specific_instructions>',
    content,
    '</user_specific_instructions>',
  ].join('\n')

  return cachedWorkspaceInstructionsBlock
}
