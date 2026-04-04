import { promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const RIPGREP_EXECUTABLE_NAME = process.platform === 'win32' ? 'rg.exe' : 'rg'

let ripgrepCommandCandidatesPromise: Promise<string[]> | null = null

class RipgrepBinaryNotFoundError extends Error {
  attemptedCommands: string[]

  constructor(attemptedCommands: string[], failures: string[]) {
    const failureSummary = failures.length > 0 ? ` Errors: ${failures.join(' | ')}` : ''
    super(`Ripgrep binary is unavailable. Tried: ${attemptedCommands.join(', ') || 'no candidate paths'}.${failureSummary}`)
    this.attemptedCommands = attemptedCommands
    this.name = 'RipgrepBinaryNotFoundError'
  }
}

interface ResolveRipgrepCommandCandidatesOptions {
  currentWorkingDirectory?: string | null
  includePathLookup?: boolean
  isPackagedApp?: boolean
  executablePath?: string | null
  moduleCandidatePaths?: string[]
  pathExistsImpl?: typeof pathExists
  resourcesPath?: string | null
}

function normalizeRipgrepCandidatePath(candidatePath: string) {
  const trimmedPath = candidatePath.trim()
  if (trimmedPath.length === 0) {
    return trimmedPath
  }

  const repairedScopedModulePath = trimmedPath
    .replace(/^node_modules(?=@[^\\/]+)/u, `node_modules${path.sep}`)
    .replace(/([\\/])node_modules(?=@[^\\/]+)/gu, `$1node_modules${path.sep}`)

  return path.normalize(repairedScopedModulePath)
}

function toUniquePaths(candidatePaths: Array<string | null | undefined>) {
  const seenPaths = new Set<string>()
  const uniquePaths: string[] = []

  for (const candidatePath of candidatePaths) {
    if (!candidatePath) {
      continue
    }

    const normalizedPath = normalizeRipgrepCandidatePath(candidatePath)
    if (normalizedPath.length === 0 || seenPaths.has(normalizedPath)) {
      continue
    }

    seenPaths.add(normalizedPath)
    uniquePaths.push(normalizedPath)
  }

  return uniquePaths
}

async function pathExists(candidatePath: string) {
  try {
    await fs.access(candidatePath)
    return true
  } catch {
    return false
  }
}

function resetRipgrepCommandCandidatesCache() {
  ripgrepCommandCandidatesPromise = null
}

function normalizePackagedResourcesRoot(candidatePath: string) {
  const normalizedCandidatePath = path.normalize(candidatePath.trim())
  if (normalizedCandidatePath.length === 0) {
    return normalizedCandidatePath
  }

  const baseName = path.basename(normalizedCandidatePath).toLowerCase()
  if (baseName === 'app.asar' || baseName === 'app.asar.unpacked') {
    return path.dirname(normalizedCandidatePath)
  }

  return normalizedCandidatePath
}

function resolvePackagedResourceRoots(options: Pick<ResolveRipgrepCommandCandidatesOptions, 'executablePath' | 'resourcesPath'> = {}) {
  const candidateRoots = toUniquePaths([
    options.resourcesPath,
    typeof process.resourcesPath === 'string' && process.resourcesPath.trim().length > 0 ? process.resourcesPath : null,
  ])

  const executablePath =
    options.executablePath ?? (typeof process.execPath === 'string' && process.execPath.trim().length > 0 ? process.execPath : null)
  if (executablePath) {
    candidateRoots.push(path.join(path.dirname(path.normalize(executablePath)), 'resources'))
  }

  return toUniquePaths(candidateRoots.map(normalizePackagedResourcesRoot))
}

function resolveRipgrepModuleCandidatePaths() {
  const candidatePaths: Array<string | null | undefined> = []

  try {
    const ripgrepModule = require('@vscode/ripgrep') as { rgPath?: string }
    if (typeof ripgrepModule.rgPath === 'string' && ripgrepModule.rgPath.trim().length > 0) {
      candidatePaths.push(ripgrepModule.rgPath)
    }
  } catch {
    // Ignore and continue with other resolution strategies.
  }

  try {
    const ripgrepPackageJsonPath = require.resolve('@vscode/ripgrep/package.json')
    candidatePaths.push(path.join(path.dirname(ripgrepPackageJsonPath), 'bin', RIPGREP_EXECUTABLE_NAME))
  } catch {
    // Ignore and continue with other resolution strategies.
  }

  return toUniquePaths(candidatePaths)
}

async function buildRipgrepCommandCandidates(options: ResolveRipgrepCommandCandidatesOptions = {}) {
  const isPackagedApp = options.isPackagedApp ?? (typeof process.defaultApp === 'boolean' ? !process.defaultApp : false)
  const currentWorkingDirectory =
    options.currentWorkingDirectory ?? (typeof process.cwd === 'function' ? process.cwd() : null)
  const pathExistsImpl = options.pathExistsImpl ?? pathExists
  const moduleCandidatePaths = toUniquePaths(options.moduleCandidatePaths ?? resolveRipgrepModuleCandidatePaths())
  const bundledCandidatePaths = toUniquePaths(
    resolvePackagedResourceRoots({
      executablePath: options.executablePath,
      resourcesPath: options.resourcesPath,
    }).flatMap((resourcesRoot) => [
      path.join(resourcesRoot, 'ripgrep', RIPGREP_EXECUTABLE_NAME),
      path.join(resourcesRoot, 'app.asar.unpacked', 'ripgrep', RIPGREP_EXECUTABLE_NAME),
      path.join(resourcesRoot, 'app.asar.unpacked', 'node_modules', '@vscode', 'ripgrep', 'bin', RIPGREP_EXECUTABLE_NAME),
    ]),
  )
  const developmentCandidatePaths = toUniquePaths([
    ...moduleCandidatePaths,
    currentWorkingDirectory
      ? path.join(currentWorkingDirectory, 'node_modules', '@vscode', 'ripgrep', 'bin', RIPGREP_EXECUTABLE_NAME)
      : null,
  ])
  const candidatePaths = isPackagedApp
    ? [...bundledCandidatePaths, ...developmentCandidatePaths]
    : [...developmentCandidatePaths, ...bundledCandidatePaths]
  const availablePaths: string[] = []

  for (const candidatePath of candidatePaths) {
    if (await pathExistsImpl(candidatePath)) {
      availablePaths.push(candidatePath)
    }
  }

  if (options.includePathLookup === false) {
    return availablePaths
  }

  return toUniquePaths([...availablePaths, RIPGREP_EXECUTABLE_NAME])
}

async function resolveRipgrepCommandCandidates() {
  if (!ripgrepCommandCandidatesPromise) {
    ripgrepCommandCandidatesPromise = buildRipgrepCommandCandidates()
  }

  return ripgrepCommandCandidatesPromise
}

function isRetryableRipgrepSpawnError(error: unknown): error is NodeJS.ErrnoException {
  if (!(error instanceof Error)) {
    return false
  }

  const code = (error as NodeJS.ErrnoException).code
  return code === 'ENOENT' || code === 'EACCES'
}

export async function runRipgrepWithCandidates(
  args: string[],
  cwd: string,
  candidateCommands: string[],
  spawnImpl: typeof spawn = spawn,
) {
  const attemptedCommands: string[] = []
  const failures: string[] = []

  for (const candidateCommand of candidateCommands) {
    attemptedCommands.push(candidateCommand)

    try {
      const result = await new Promise<{ exitCode: number; stderr: string; stdout: string }>((resolve, reject) => {
        const child = spawnImpl(candidateCommand, args, {
          cwd,
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })

        let stdout = ''
        let stderr = ''

        child.stdout.on('data', (chunk: Buffer | string) => {
          stdout += chunk.toString()
        })
        child.stderr.on('data', (chunk: Buffer | string) => {
          stderr += chunk.toString()
        })
        child.on('error', reject)
        child.on('close', (code) => {
          resolve({
            exitCode: code ?? 1,
            stderr,
            stdout,
          })
        })
      })

      return result
    } catch (error) {
      if (isRetryableRipgrepSpawnError(error)) {
        failures.push(`${candidateCommand}: ${error.code}`)
        continue
      }

      throw error
    }
  }

  throw new RipgrepBinaryNotFoundError(attemptedCommands, failures)
}

export async function runRipgrep(args: string[], cwd: string) {
  try {
    return await runRipgrepWithCandidates(args, cwd, await resolveRipgrepCommandCandidates())
  } catch (error) {
    if (!(error instanceof RipgrepBinaryNotFoundError)) {
      throw error
    }

    resetRipgrepCommandCandidatesCache()
    return runRipgrepWithCandidates(args, cwd, await resolveRipgrepCommandCandidates())
  }
}

export const __testOnly = {
  buildRipgrepCommandCandidates,
  normalizeRipgrepCandidatePath,
  runRipgrepWithCandidates,
}
