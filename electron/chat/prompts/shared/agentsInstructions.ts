import { promises as fs } from 'node:fs'
import path from 'node:path'

interface BuildSharedAgentsInstructionsInput {
  agentContextRootPath: string
}

const PROJECT_DOC_SEPARATOR = '\n\n--- project-doc ---\n\n'
const PROJECT_DOC_MAX_BYTES = 64 * 1024
const PROJECT_ROOT_MARKERS = ['.git']
const PROJECT_DOC_SPECS = [
  {
    filename: 'AGENTS.md',
    sourceLabel: 'AGENTS.md',
    sectionTag: 'user_instructions',
  },
  {
    filename: 'DESIGN.md',
    sourceLabel: 'DESIGN.md',
    sectionTag: 'preferred_design_guidelines',
  },
] as const

function normalizeProjectDocContent(fileContent: string) {
  const withPreferredDesignGuidelines = fileContent.replace(
    /<preferred_styling_everytime\b[^>]*>([\s\S]*?)<\/preferred_styling_everytime>/giu,
    (_match, innerContent: string) => {
      const normalizedInnerContent = innerContent.trim()
      if (normalizedInnerContent.length === 0) {
        return ''
      }

      return [
        '<preferred_design_guidelines>',
        normalizedInnerContent,
        '</preferred_design_guidelines>',
      ].join('\n')
    },
  )
  const withoutDirectiveTags = withPreferredDesignGuidelines.replace(
    /<\/?SYSTEM_INSTRUCTIONS_DIRECTIVE\b[^>]*>/giu,
    '',
  )
  const withoutInstructionTags = withoutDirectiveTags.replace(
    /<\/?INSTRUCTIONS>/giu,
    '',
  )
  const normalizedContent = withoutInstructionTags.trim()
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

  let parentPath = path.dirname(cursor)
  while (parentPath !== cursor) {
    for (const marker of PROJECT_ROOT_MARKERS) {
      if (await pathExists(path.join(cursor, marker))) {
        return cursor
      }
    }

    cursor = parentPath
    parentPath = path.dirname(cursor)
  }

  return path.resolve(agentContextRootPath)
}

function buildSearchDirectories(projectRootPath: string, targetPath: string) {
  const normalizedRoot = path.resolve(projectRootPath)
  const normalizedTarget = path.resolve(targetPath)
  if (normalizedRoot === normalizedTarget) {
    return [normalizedTarget]
  }

  const directories: string[] = []
  let cursor = normalizedTarget
  let parentPath = path.dirname(cursor)
  while (parentPath !== cursor) {
    directories.push(cursor)
    if (cursor === normalizedRoot) {
      break
    }

    cursor = parentPath
    parentPath = path.dirname(cursor)
  }

  directories.reverse()
  return directories
}

type ProjectDocSpec = (typeof PROJECT_DOC_SPECS)[number]

async function discoverProjectDocPaths(agentContextRootPath: string, docFilename: string) {
  const projectRootPath = await resolveProjectRoot(agentContextRootPath)
  const searchDirectories = buildSearchDirectories(projectRootPath, agentContextRootPath)
  const docPaths: string[] = []

  for (const directoryPath of searchDirectories) {
    const candidatePath = path.join(directoryPath, docFilename)
    try {
      const stat = await fs.stat(candidatePath)
      if (stat.isFile()) {
        docPaths.push(candidatePath)
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue
      }

      throw error
    }
  }

  return docPaths
}

async function readProjectDocContent(agentContextRootPath: string, docFilename: string) {
  const projectDocPaths = await discoverProjectDocPaths(agentContextRootPath, docFilename)
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
    const normalizedContent = normalizeProjectDocContent(fileContent)
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

async function buildProjectDocSection(agentContextRootPath: string, spec: ProjectDocSpec) {
  const content = await readProjectDocContent(agentContextRootPath, spec.filename)
  if (!content) {
    return null
  }

  return [
    `<${spec.sectionTag}>`,
    `## ${spec.sourceLabel}`,
    content,
    `</${spec.sectionTag}>`,
  ].join('\n')
}

export async function buildSharedAgentsInstructions({
  agentContextRootPath,
}: BuildSharedAgentsInstructionsInput) {
  const sections = await Promise.all(
    PROJECT_DOC_SPECS.map((spec) => buildProjectDocSection(agentContextRootPath, spec)),
  )

  const filteredSections = sections.filter((section): section is string => section !== null)
  if (filteredSections.length === 0) {
    return null
  }

  return filteredSections.join('\n\n')
}
