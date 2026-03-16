import { promises as fs } from 'node:fs'
import path from 'node:path'

interface BuildSharedAgentsInstructionsInput {
  agentContextRootPath: string
}

function normalizeAgentsOverrideContent(fileContent: string) {
  const withoutStylingBlock = fileContent.replace(
    /<preferred_styling_everytime\b[\s\S]*?<\/preferred_styling_everytime>/giu,
    '',
  )
  const withoutReservedSystemDirectives = withoutStylingBlock.replace(
    /<SYSTEM_INSTRUCTIONS_DIRECTIVE\b[\s\S]*$/giu,
    '',
  )
  const withoutOrphanedInstructionTags = withoutReservedSystemDirectives.replace(
    /^\s*<\/?INSTRUCTIONS>\s*$/gimu,
    '',
  )
  const normalizedContent = withoutOrphanedInstructionTags.trim()
  return normalizedContent.length > 0 ? normalizedContent : null
}

async function readAgentsFileContent(agentContextRootPath: string) {
  const agentsFilePath = path.join(agentContextRootPath, 'AGENTS.md')

  try {
    const fileStats = await fs.stat(agentsFilePath)
    if (!fileStats.isFile()) {
      return null
    }

    const fileContent = await fs.readFile(agentsFilePath, 'utf8')
    return normalizeAgentsOverrideContent(fileContent)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    throw error
  }
}

export async function buildSharedAgentsInstructions({
  agentContextRootPath,
}: BuildSharedAgentsInstructionsInput) {
  const agentsFileContent = await readAgentsFileContent(agentContextRootPath)
  if (!agentsFileContent) {
    return null
  }

  return [
    '<user_instructions>',
    agentsFileContent,
    '</user_instructions>',
  ].join('\n')
}
