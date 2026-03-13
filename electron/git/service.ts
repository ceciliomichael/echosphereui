import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type {
  CheckoutGitBranchInput,
  CreateGitBranchInput,
  GitBranchState,
  GitDiffSnapshot,
  GitFileDiff,
} from '../../src/types/chat'

const execFileAsync = promisify(execFile)
const GIT_EXECUTION_OPTIONS = {
  encoding: 'utf8' as const,
  maxBuffer: 1024 * 1024,
  windowsHide: true,
}

interface GitCommandError extends Error {
  code?: number | string
  stderr?: string
  stdout?: string
}

function createEmptyBranchState(): GitBranchState {
  return {
    branches: [],
    currentBranch: null,
    hasRepository: false,
    isDetachedHead: false,
    repoRootPath: null,
  }
}

function getErrorMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return 'Unknown git error.'
  }

  const commandError = error as GitCommandError
  return [commandError.stderr, commandError.message, commandError.stdout].find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? 'Unknown git error.'
}

function isGitUnavailable(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const commandError = error as GitCommandError
  const message = getErrorMessage(commandError).toLowerCase()
  return commandError.code === 'ENOENT' || message.includes("'git' is not recognized") || message.includes('command not found')
}

function isRepositoryMissing(error: unknown) {
  return getErrorMessage(error).toLowerCase().includes('not a git repository')
}

async function runGit(args: string[], cwd: string) {
  return execFileAsync('git', args, {
    ...GIT_EXECUTION_OPTIONS,
    cwd,
  })
}

async function runGitBuffer(args: string[], cwd: string) {
  return execFileAsync('git', args, {
    ...GIT_EXECUTION_OPTIONS,
    cwd,
    encoding: 'buffer',
  })
}

async function validateBranchName(branchName: string, repoRootPath: string) {
  try {
    await runGit(['check-ref-format', '--branch', branchName], repoRootPath)
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}

async function resolveRepositoryRoot(workspacePath: string) {
  const normalizedWorkspacePath = workspacePath.trim()
  if (normalizedWorkspacePath.length === 0) {
    return null
  }

  try {
    const { stdout } = await runGit(['rev-parse', '--show-toplevel'], normalizedWorkspacePath)
    const repoRootPath = stdout.trim()
    return repoRootPath.length > 0 ? repoRootPath : null
  } catch (error) {
    if (isRepositoryMissing(error) || isGitUnavailable(error)) {
      return null
    }

    throw error
  }
}

async function readCurrentBranch(repoRootPath: string) {
  try {
    const { stdout } = await runGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], repoRootPath)
    const branchName = stdout.trim()
    return {
      currentBranch: branchName.length > 0 ? branchName : null,
      isDetachedHead: false,
    }
  } catch {
    // `symbolic-ref` fails when HEAD is detached. In "unborn" repos (no commits yet),
    // `rev-parse HEAD` can also fail, so treat that as "no current commit".
  }

  try {
    const { stdout } = await runGit(['rev-parse', '--short', 'HEAD'], repoRootPath)
    const detachedHeadSha = stdout.trim()
    return {
      currentBranch: detachedHeadSha.length > 0 ? `detached@${detachedHeadSha}` : null,
      isDetachedHead: true,
    }
  } catch {
    return {
      currentBranch: null,
      isDetachedHead: false,
    }
  }
}

async function readLocalBranches(repoRootPath: string) {
  const { stdout } = await runGit(
    ['for-each-ref', '--format=%(refname:short)', '--sort=-committerdate', 'refs/heads'],
    repoRootPath,
  )

  return stdout
    .split(/\r?\n/)
    .map((branchName) => branchName.trim())
    .filter((branchName) => branchName.length > 0)
}

function splitNullDelimitedOutput(output: string) {
  return output.split('\0').map((value) => value.trim()).filter((value) => value.length > 0)
}

function isBinaryContent(content: Buffer) {
  return content.includes(0)
}

function normalizeGitFilePath(filePath: string) {
  return filePath.replace(/\\/g, '/')
}

function isWithinRepository(repoRootPath: string, candidatePath: string) {
  const normalizedRepoRoot = path.resolve(repoRootPath)
  const normalizedCandidate = path.resolve(candidatePath)
  return normalizedCandidate === normalizedRepoRoot || normalizedCandidate.startsWith(`${normalizedRepoRoot}${path.sep}`)
}

async function readWorkingTreeFile(repoRootPath: string, filePath: string) {
  const absoluteFilePath = path.resolve(repoRootPath, filePath)
  if (!isWithinRepository(repoRootPath, absoluteFilePath)) {
    return null
  }

  try {
    const fileContent = await fs.readFile(absoluteFilePath)
    if (isBinaryContent(fileContent)) {
      return null
    }

    return fileContent.toString('utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return ''
    }

    throw error
  }
}

async function readHeadFile(repoRootPath: string, filePath: string) {
  try {
    const { stdout } = await runGitBuffer(['show', `HEAD:${normalizeGitFilePath(filePath)}`], repoRootPath)
    const fileContent = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout)
    if (isBinaryContent(fileContent)) {
      return null
    }

    return fileContent.toString('utf8')
  } catch {
    return null
  }
}

async function listChangedFiles(repoRootPath: string) {
  const [unstagedResult, stagedResult, untrackedResult] = await Promise.all([
    runGit(['diff', '--name-only', '-z', '--', '.'], repoRootPath).catch(() => ({ stdout: '' })),
    runGit(['diff', '--name-only', '-z', '--cached', '--', '.'], repoRootPath).catch(() => ({ stdout: '' })),
    runGit(['ls-files', '--others', '--exclude-standard', '-z', '--', '.'], repoRootPath).catch(() => ({ stdout: '' })),
  ])

  return Array.from(
    new Set([
      ...splitNullDelimitedOutput(unstagedResult.stdout),
      ...splitNullDelimitedOutput(stagedResult.stdout),
      ...splitNullDelimitedOutput(untrackedResult.stdout),
    ]),
  )
}

async function buildGitFileDiff(repoRootPath: string, filePath: string): Promise<GitFileDiff | null> {
  const [oldContent, newContent] = await Promise.all([
    readHeadFile(repoRootPath, filePath),
    readWorkingTreeFile(repoRootPath, filePath),
  ])

  if (newContent === null) {
    return null
  }

  return {
    fileName: normalizeGitFilePath(filePath),
    newContent,
    oldContent,
  }
}

export async function getGitBranchState(workspacePath: string): Promise<GitBranchState> {
  const repoRootPath = await resolveRepositoryRoot(workspacePath)
  if (!repoRootPath) {
    return createEmptyBranchState()
  }

  const [branchState, branches] = await Promise.all([
    readCurrentBranch(repoRootPath),
    readLocalBranches(repoRootPath),
  ])

  return {
    branches,
    currentBranch: branchState.currentBranch,
    hasRepository: true,
    isDetachedHead: branchState.isDetachedHead,
    repoRootPath,
  }
}

export async function getGitDiffSnapshot(workspacePath: string): Promise<GitDiffSnapshot> {
  const repoRootPath = await resolveRepositoryRoot(workspacePath)
  if (!repoRootPath) {
    return {
      fileDiffs: [],
      hasRepository: false,
    }
  }

  const changedFiles = await listChangedFiles(repoRootPath)
  const fileDiffs = (
    await Promise.all(changedFiles.map((filePath) => buildGitFileDiff(repoRootPath, filePath)))
  ).filter((fileDiff): fileDiff is GitFileDiff => fileDiff !== null)

  return {
    fileDiffs,
    hasRepository: true,
  }
}

export async function checkoutGitBranch(input: CheckoutGitBranchInput): Promise<GitBranchState> {
  const workspacePath = input.workspacePath.trim()
  const branchName = input.branchName.trim()

  if (workspacePath.length === 0) {
    throw new Error('Workspace path is required.')
  }

  if (branchName.length === 0) {
    throw new Error('Branch name is required.')
  }

  const repoRootPath = await resolveRepositoryRoot(workspacePath)
  if (!repoRootPath) {
    throw new Error('No git repository was found for this workspace.')
  }

  try {
    await runGit(['checkout', '--quiet', branchName], repoRootPath)
  } catch (error) {
    if (isGitUnavailable(error)) {
      throw new Error('Git is not available in the current environment.')
    }

    throw new Error(getErrorMessage(error))
  }

  return getGitBranchState(repoRootPath)
}

export async function createAndCheckoutGitBranch(input: CreateGitBranchInput): Promise<GitBranchState> {
  const workspacePath = input.workspacePath.trim()
  const branchName = input.branchName.trim()

  if (workspacePath.length === 0) {
    throw new Error('Workspace path is required.')
  }

  if (branchName.length === 0) {
    throw new Error('Branch name is required.')
  }

  const repoRootPath = await resolveRepositoryRoot(workspacePath)
  if (!repoRootPath) {
    throw new Error('No git repository was found for this workspace.')
  }

  await validateBranchName(branchName, repoRootPath)

  try {
    await runGit(['checkout', '--quiet', '-b', branchName], repoRootPath)
  } catch (error) {
    if (isGitUnavailable(error)) {
      throw new Error('Git is not available in the current environment.')
    }

    throw new Error(getErrorMessage(error))
  }

  return getGitBranchState(repoRootPath)
}
