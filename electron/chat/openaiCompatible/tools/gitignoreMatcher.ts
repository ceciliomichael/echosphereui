import { promises as fs } from 'node:fs'
import path from 'node:path'
import ignore from 'ignore'

interface GitignoreMatcherEntry {
  basePath: string
  matcher: ignore.Ignore
}

function toPosixRelativePath(fromPath: string, toPath: string) {
  return path.relative(fromPath, toPath).split(path.sep).join('/')
}

async function loadGitignoreMatcher(basePath: string) {
  const gitignorePath = path.join(basePath, '.gitignore')

  try {
    const gitignoreContent = await fs.readFile(gitignorePath, 'utf8')
    if (gitignoreContent.trim().length === 0) {
      return null
    }

    return {
      basePath,
      matcher: ignore().add(gitignoreContent),
    } satisfies GitignoreMatcherEntry
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null
    }

    throw error
  }
}

export async function loadGitignoreMatchers(rootPath: string, directoryPath: string) {
  const normalizedRootPath = path.resolve(rootPath)
  const normalizedDirectoryPath = path.resolve(directoryPath)
  const relativeDirectoryPath = path.relative(normalizedRootPath, normalizedDirectoryPath)
  const directorySegments =
    relativeDirectoryPath.length === 0 ? [] : relativeDirectoryPath.split(path.sep).filter((segment) => segment.length > 0)

  const candidatePaths = [normalizedRootPath]
  for (let index = 0; index < directorySegments.length; index += 1) {
    candidatePaths.push(path.join(normalizedRootPath, ...directorySegments.slice(0, index + 1)))
  }

  const matcherEntries = await Promise.all(candidatePaths.map((candidatePath) => loadGitignoreMatcher(candidatePath)))
  return matcherEntries.filter((entry): entry is GitignoreMatcherEntry => entry !== null)
}

export function isGitignored(
  targetPath: string,
  isDirectory: boolean,
  matcherEntries: readonly GitignoreMatcherEntry[],
) {
  let isIgnored = false

  for (const matcherEntry of matcherEntries) {
    const relativePath = toPosixRelativePath(matcherEntry.basePath, targetPath)
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath) || relativePath.length === 0) {
      continue
    }

    const candidatePath = isDirectory ? `${relativePath}/` : relativePath
    const result = matcherEntry.matcher.checkIgnore(candidatePath)
    if (result.ignored) {
      isIgnored = true
      continue
    }

    if (result.unignored) {
      isIgnored = false
    }
  }

  return isIgnored
}

export function shouldAlwaysShowEntry(entryName: string) {
  return entryName.toLowerCase().startsWith('.env')
}
