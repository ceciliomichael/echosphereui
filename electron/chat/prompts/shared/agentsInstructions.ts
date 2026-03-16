import { promises as fs } from 'node:fs'
import path from 'node:path'

interface BuildSharedAgentsInstructionsInput {
  agentContextRootPath: string
}

const PROJECT_DOC_SEPARATOR = '\n\n--- project-doc ---\n\n'
const PROJECT_DOC_MAX_BYTES = 64 * 1024
const PROJECT_ROOT_MARKERS = ['.git']
const PROJECT_DOC_CANDIDATE_FILENAMES = ['AGENTS.override.md', 'AGENTS.md'] as const

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

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function resolveProjectRoot(agentContextRootPath: string) {
  let cursor = path.resolve(agentContextRootPath)

  while (true) {
    for (const marker of PROJECT_ROOT_MARKERS) {
      if (await pathExists(path.join(cursor, marker))) {
        return cursor
      }
    }

    const parentPath = path.dirname(cursor)
    if (parentPath === cursor) {
      return path.resolve(agentContextRootPath)
    }

    cursor = parentPath
  }
}

function buildSearchDirectories(projectRootPath: string, targetPath: string) {
  const normalizedRoot = path.resolve(projectRootPath)
  const normalizedTarget = path.resolve(targetPath)
  if (normalizedRoot === normalizedTarget) {
    return [normalizedTarget]
  }

  const directories: string[] = []
  let cursor = normalizedTarget
  while (true) {
    directories.push(cursor)
    if (cursor === normalizedRoot) {
      break
    }

    const parentPath = path.dirname(cursor)
    if (parentPath === cursor) {
      return [normalizedTarget]
    }

    cursor = parentPath
  }

  directories.reverse()
  return directories
}

async function discoverProjectDocPaths(agentContextRootPath: string) {
  const projectRootPath = await resolveProjectRoot(agentContextRootPath)
  const searchDirectories = buildSearchDirectories(projectRootPath, agentContextRootPath)
  const docPaths: string[] = []

  for (const directoryPath of searchDirectories) {
    for (const candidateFileName of PROJECT_DOC_CANDIDATE_FILENAMES) {
      const candidatePath = path.join(directoryPath, candidateFileName)
      try {
        const stat = await fs.stat(candidatePath)
        if (stat.isFile()) {
          docPaths.push(candidatePath)
          break
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          continue
        }

        throw error
      }
    }
  }

  return docPaths
}

async function readProjectDocContent(agentContextRootPath: string) {
  const projectDocPaths = await discoverProjectDocPaths(agentContextRootPath)
  if (projectDocPaths.length === 0) {
    return null
  }

  let remainingBytes = PROJECT_DOC_MAX_BYTES
  const segments: string[] = []

  for (const docPath of projectDocPaths) {
    if (remainingBytes <= 0) {
      break
    }

    const fileContent = await fs.readFile(docPath, 'utf8')
    const normalizedContent = normalizeAgentsOverrideContent(fileContent)
    if (!normalizedContent) {
      continue
    }

    const normalizedBytes = Buffer.byteLength(normalizedContent, 'utf8')
    if (normalizedBytes > remainingBytes) {
      const truncatedContent = Buffer.from(normalizedContent, 'utf8')
        .subarray(0, remainingBytes)
        .toString('utf8')
        .trim()
      if (truncatedContent.length > 0) {
        segments.push(truncatedContent)
      }
      break
    }

    segments.push(normalizedContent)
    remainingBytes -= normalizedBytes
  }

  if (segments.length === 0) {
    return null
  }

  return segments.join(PROJECT_DOC_SEPARATOR)
}

export async function buildSharedAgentsInstructions({
  agentContextRootPath,
}: BuildSharedAgentsInstructionsInput) {
  const agentsFileContent = await readProjectDocContent(agentContextRootPath)
  if (!agentsFileContent) {
    return null
  }

  return [
    '<user_instructions>',
    '## Project Overrides',
    agentsFileContent,
    '</user_instructions>',
  ].join('\n')
}
