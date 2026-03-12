import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { CheckoutGitBranchInput, CreateGitBranchInput, GitBranchState } from '../../src/types/chat'

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
  const { stdout } = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], repoRootPath)
  const currentReference = stdout.trim()
  if (currentReference === 'HEAD') {
    const { stdout: detachedHeadOutput } = await runGit(['rev-parse', '--short', 'HEAD'], repoRootPath)
    const detachedHeadSha = detachedHeadOutput.trim()
    return {
      currentBranch: detachedHeadSha.length > 0 ? `detached@${detachedHeadSha}` : null,
      isDetachedHead: true,
    }
  }

  return {
    currentBranch: currentReference.length > 0 ? currentReference : null,
    isDetachedHead: false,
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
