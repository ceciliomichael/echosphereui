import { promises as fs } from 'node:fs'
import path from 'node:path'
import { OpenAICompatibleToolError } from '../toolTypes'

const RIPGREP_EXECUTABLE_NAME_BY_PLATFORM: Record<NodeJS.Platform, string> = {
  aix: 'rg',
  android: 'rg',
  darwin: 'rg',
  freebsd: 'rg',
  haiku: 'rg',
  linux: 'rg',
  openbsd: 'rg',
  sunos: 'rg',
  win32: 'rg.exe',
  cygwin: 'rg.exe',
  netbsd: 'rg',
}

interface RipgrepBinaryPathContext {
  appRootPath?: string
  currentWorkingDirectory?: string
  platform?: NodeJS.Platform
  resourcesPath?: string
}

function getRipgrepExecutableName(platform: NodeJS.Platform) {
  return RIPGREP_EXECUTABLE_NAME_BY_PLATFORM[platform] ?? 'rg'
}

function removeDuplicatePaths(paths: readonly string[]) {
  const uniquePaths = new Set<string>()

  for (const candidatePath of paths) {
    uniquePaths.add(path.resolve(candidatePath))
  }

  return Array.from(uniquePaths)
}

export function getRipgrepBinaryCandidatePaths(context: RipgrepBinaryPathContext = {}) {
  const platform = context.platform ?? process.platform
  const executableName = getRipgrepExecutableName(platform)
  const resourcesPath =
    typeof context.resourcesPath === 'string' && context.resourcesPath.trim().length > 0
      ? context.resourcesPath.trim()
      : typeof process.resourcesPath === 'string' && process.resourcesPath.trim().length > 0
        ? process.resourcesPath.trim()
        : undefined
  const appRootPath =
    typeof context.appRootPath === 'string' && context.appRootPath.trim().length > 0
      ? context.appRootPath.trim()
      : typeof process.env.APP_ROOT === 'string' && process.env.APP_ROOT.trim().length > 0
        ? process.env.APP_ROOT.trim()
        : undefined
  const currentWorkingDirectory =
    typeof context.currentWorkingDirectory === 'string' && context.currentWorkingDirectory.trim().length > 0
      ? context.currentWorkingDirectory.trim()
      : process.cwd()

  const candidatePaths = [
    resourcesPath ? path.join(resourcesPath, 'ripgrep', executableName) : null,
    appRootPath ? path.join(appRootPath, 'node_modules', '@vscode', 'ripgrep', 'bin', executableName) : null,
    path.join(currentWorkingDirectory, 'node_modules', '@vscode', 'ripgrep', 'bin', executableName),
  ].filter((value): value is string => value !== null)

  return removeDuplicatePaths(candidatePaths)
}

export async function resolveRipgrepBinaryPath(context: RipgrepBinaryPathContext = {}) {
  const candidatePaths = getRipgrepBinaryCandidatePaths(context)

  for (const candidatePath of candidatePaths) {
    try {
      const candidateStats = await fs.stat(candidatePath)
      if (candidateStats.isFile()) {
        return candidatePath
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        continue
      }

      throw error
    }
  }

  throw new OpenAICompatibleToolError(
    'Bundled ripgrep binary is unavailable. Reinstall dependencies for development or reinstall the packaged app.',
    {
      candidatePaths,
    },
  )
}
