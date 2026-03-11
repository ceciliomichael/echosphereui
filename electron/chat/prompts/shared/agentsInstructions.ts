import { promises as fs } from 'node:fs'
import path from 'node:path'

interface BuildSharedAgentsInstructionsInput {
  agentContextRootPath: string
}

async function readAgentsFileContent(agentContextRootPath: string) {
  const agentsFilePath = path.join(agentContextRootPath, 'AGENTS.md')

  try {
    const fileStats = await fs.stat(agentsFilePath)
    if (!fileStats.isFile()) {
      return null
    }

    const fileContent = await fs.readFile(agentsFilePath, 'utf8')
    const normalizedContent = fileContent.trim()
    return normalizedContent.length > 0 ? normalizedContent : null
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
    '## Custom Instructions',
    '- The built-in system prompt remains the highest-priority instruction source.',
    '- The following project-level custom instructions come from AGENTS.md in the locked root and have second priority.',
    '<user_instructions>',
    agentsFileContent,
    '</user_instructions>',
  ].join('\n')
}
