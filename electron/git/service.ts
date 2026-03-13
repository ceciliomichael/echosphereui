import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'
import type {
  CheckoutGitBranchInput,
  CreateGitBranchInput,
  GitBranchState,
  GitCommitInput,
  GitCommitResult,
  GitDiffSnapshot,
  GitFileStageInput,
  GitFileStageResult,
  GitFileDiff,
  GitStatusResult,
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
    defaultBranch: null,
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

async function readDefaultBranch(repoRootPath: string) {
  try {
    const { stdout } = await runGit(['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], repoRootPath)
    const remoteHeadRef = stdout.trim()
    const prefix = 'origin/'
    if (!remoteHeadRef.startsWith(prefix)) {
      return null
    }

    const defaultBranch = remoteHeadRef.slice(prefix.length).trim()
    return defaultBranch.length > 0 ? defaultBranch : null
  } catch {
    return null
  }
}

function normalizeForGitPathspec(filePath: string) {
  return normalizeGitFilePath(filePath).replace(/^\/+/, '')
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

interface ChangedFileSets {
  allChangedFiles: string[]
  stagedFileSet: Set<string>
  unstagedFileSet: Set<string>
  untrackedFileSet: Set<string>
}

async function readChangedFileSets(repoRootPath: string): Promise<ChangedFileSets> {
  const [unstagedResult, stagedResult, untrackedResult] = await Promise.all([
    runGit(['diff', '--name-only', '-z', '--', '.'], repoRootPath).catch(() => ({ stdout: '' })),
    runGit(['diff', '--name-only', '-z', '--cached', '--', '.'], repoRootPath).catch(() => ({ stdout: '' })),
    runGit(['ls-files', '--others', '--exclude-standard', '-z', '--', '.'], repoRootPath).catch(() => ({ stdout: '' })),
  ])

  const unstagedFiles = splitNullDelimitedOutput(unstagedResult.stdout)
  const stagedFiles = splitNullDelimitedOutput(stagedResult.stdout)
  const untrackedFiles = splitNullDelimitedOutput(untrackedResult.stdout)

  const stagedFileSet = new Set(stagedFiles.map((filePath) => normalizeGitFilePath(filePath)))
  const unstagedFileSet = new Set(unstagedFiles.map((filePath) => normalizeGitFilePath(filePath)))
  const untrackedFileSet = new Set(untrackedFiles.map((filePath) => normalizeGitFilePath(filePath)))
  const allChangedFiles = Array.from(new Set([...unstagedFileSet, ...stagedFileSet, ...untrackedFileSet]))

  return {
    allChangedFiles,
    stagedFileSet,
    unstagedFileSet,
    untrackedFileSet,
  }
}

async function buildGitFileDiff(
  repoRootPath: string,
  filePath: string,
  changedFileSets: Omit<ChangedFileSets, 'allChangedFiles'>,
): Promise<GitFileDiff | null> {
  const [oldContent, newContent] = await Promise.all([
    readHeadFile(repoRootPath, filePath),
    readWorkingTreeFile(repoRootPath, filePath),
  ])

  if (newContent === null) {
    return null
  }

  const normalizedFilePath = normalizeGitFilePath(filePath)
  return {
    fileName: normalizedFilePath,
    isStaged: changedFileSets.stagedFileSet.has(normalizedFilePath),
    isUnstaged: changedFileSets.unstagedFileSet.has(normalizedFilePath),
    isUntracked: changedFileSets.untrackedFileSet.has(normalizedFilePath),
    newContent,
    oldContent,
  }
}

export async function getGitBranchState(workspacePath: string): Promise<GitBranchState> {
  const repoRootPath = await resolveRepositoryRoot(workspacePath)
  if (!repoRootPath) {
    return createEmptyBranchState()
  }

  const [branchState, branches, defaultBranch] = await Promise.all([
    readCurrentBranch(repoRootPath),
    readLocalBranches(repoRootPath),
    readDefaultBranch(repoRootPath),
  ])

  return {
    branches,
    currentBranch: branchState.currentBranch,
    defaultBranch,
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

  const changedFileSets = await readChangedFileSets(repoRootPath)
  const fileDiffs = (
    await Promise.all(
      changedFileSets.allChangedFiles.map((filePath) =>
        buildGitFileDiff(repoRootPath, filePath, {
          stagedFileSet: changedFileSets.stagedFileSet,
          untrackedFileSet: changedFileSets.untrackedFileSet,
          unstagedFileSet: changedFileSets.unstagedFileSet,
        }),
      ),
    )
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

export async function getGitStatus(workspacePath: string): Promise<GitStatusResult> {
  const repoRootPath = await resolveRepositoryRoot(workspacePath)
  if (!repoRootPath) {
    return {
      addedLineCount: 0,
      changedFileCount: 0,
      hasRepository: false,
      removedLineCount: 0,
      stagedFileCount: 0,
      unstagedFileCount: 0,
      untrackedFileCount: 0,
    }
  }

  const [stagedResult, unstagedResult, untrackedResult] = await Promise.all([
    runGit(['diff', '--cached', '--name-only', '-z', '--', '.'], repoRootPath).catch(() => ({ stdout: '' })),
    runGit(['diff', '--name-only', '-z', '--', '.'], repoRootPath).catch(() => ({ stdout: '' })),
    runGit(['ls-files', '--others', '--exclude-standard', '-z', '--', '.'], repoRootPath).catch(() => ({ stdout: '' })),
  ])

  const stagedFiles = splitNullDelimitedOutput(stagedResult.stdout)
  const unstagedFiles = splitNullDelimitedOutput(unstagedResult.stdout)
  const untrackedFiles = splitNullDelimitedOutput(untrackedResult.stdout)
  const allChangedFiles = new Set([...stagedFiles, ...unstagedFiles, ...untrackedFiles])

  let addedLineCount = 0
  let removedLineCount = 0

  try {
    const [stagedNumstat, unstagedNumstat] = await Promise.all([
      runGit(['diff', '--cached', '--numstat', '--', '.'], repoRootPath).catch(() => ({ stdout: '' })),
      runGit(['diff', '--numstat', '--', '.'], repoRootPath).catch(() => ({ stdout: '' })),
    ])

    const processedFiles = new Set<string>()

    for (const numstatOutput of [stagedNumstat.stdout, unstagedNumstat.stdout]) {
      for (const line of numstatOutput.split(/\r?\n/)) {
        const trimmedLine = line.trim()
        if (trimmedLine.length === 0) {
          continue
        }

        const parts = trimmedLine.split(/\t/)
        if (parts.length < 3) {
          continue
        }

        const fileName = parts[2]
        if (processedFiles.has(fileName)) {
          continue
        }

        processedFiles.add(fileName)
        const added = parseInt(parts[0], 10)
        const removed = parseInt(parts[1], 10)

        if (!isNaN(added)) {
          addedLineCount += added
        }

        if (!isNaN(removed)) {
          removedLineCount += removed
        }
      }
    }
  } catch {
    // numstat calculation is best-effort
  }

  return {
    addedLineCount,
    changedFileCount: allChangedFiles.size,
    hasRepository: true,
    removedLineCount,
    stagedFileCount: stagedFiles.length,
    unstagedFileCount: unstagedFiles.length,
    untrackedFileCount: untrackedFiles.length,
  }
}

async function isTrackedGitFile(repoRootPath: string, filePath: string) {
  try {
    await runGit(['ls-files', '--error-unmatch', '--', filePath], repoRootPath)
    return true
  } catch {
    return false
  }
}

export async function discardGitFileChanges(input: GitFileStageInput): Promise<GitFileStageResult> {
  const workspacePath = input.workspacePath.trim()
  if (workspacePath.length === 0) {
    throw new Error('Workspace path is required.')
  }

  const repoRootPath = await resolveRepositoryRoot(workspacePath)
  if (!repoRootPath) {
    throw new Error('No git repository was found for this workspace.')
  }

  const filePath = await resolveAndValidateGitFilePath(repoRootPath, input.filePath)
  const absoluteFilePath = path.resolve(repoRootPath, filePath)

  try {
    if (await isTrackedGitFile(repoRootPath, filePath)) {
      await runGit(['restore', '--worktree', '--source=HEAD', '--', filePath], repoRootPath).catch(async () => {
        await runGit(['checkout', '--', filePath], repoRootPath)
      })
    } else {
      await fs.rm(absoluteFilePath, {
        force: true,
        recursive: true,
      })
    }
  } catch (error) {
    if (isGitUnavailable(error)) {
      throw new Error('Git is not available in the current environment.')
    }

    throw new Error(`Failed to discard file changes: ${getErrorMessage(error)}`)
  }

  return {
    filePath,
    success: true,
  }
}

export async function stageGitFile(input: GitFileStageInput): Promise<GitFileStageResult> {
  const workspacePath = input.workspacePath.trim()
  if (workspacePath.length === 0) {
    throw new Error('Workspace path is required.')
  }

  const repoRootPath = await resolveRepositoryRoot(workspacePath)
  if (!repoRootPath) {
    throw new Error('No git repository was found for this workspace.')
  }

  const filePath = await resolveAndValidateGitFilePath(repoRootPath, input.filePath)

  try {
    await runGit(['add', '--', filePath], repoRootPath)
  } catch (error) {
    if (isGitUnavailable(error)) {
      throw new Error('Git is not available in the current environment.')
    }

    throw new Error(`Failed to stage file: ${getErrorMessage(error)}`)
  }

  return {
    filePath,
    success: true,
  }
}

export async function unstageGitFile(input: GitFileStageInput): Promise<GitFileStageResult> {
  const workspacePath = input.workspacePath.trim()
  if (workspacePath.length === 0) {
    throw new Error('Workspace path is required.')
  }

  const repoRootPath = await resolveRepositoryRoot(workspacePath)
  if (!repoRootPath) {
    throw new Error('No git repository was found for this workspace.')
  }

  const filePath = await resolveAndValidateGitFilePath(repoRootPath, input.filePath)

  try {
    await runGit(['restore', '--staged', '--', filePath], repoRootPath)
  } catch (error) {
    try {
      await runGit(['reset', '--', filePath], repoRootPath)
    } catch (fallbackError) {
      if (isGitUnavailable(fallbackError)) {
        throw new Error('Git is not available in the current environment.')
      }

      throw new Error(`Failed to unstage file: ${getErrorMessage(fallbackError)}`)
    }

    if (isGitUnavailable(error)) {
      throw new Error('Git is not available in the current environment.')
    }
  }

  return {
    filePath,
    success: true,
  }
}

async function getRemoteUrl(repoRootPath: string): Promise<string | null> {
  try {
    const { stdout } = await runGit(['remote', 'get-url', 'origin'], repoRootPath)
    return stdout.trim() || null
  } catch {
    return null
  }
}

function remoteUrlToHttpsBase(remoteUrl: string): string | null {
  // SSH format: git@github.com:user/repo.git
  const sshMatch = remoteUrl.match(/^git@([^:]+):(.+?)(?:\.git)?$/)
  if (sshMatch) {
    return `https://${sshMatch[1]}/${sshMatch[2]}`
  }

  // HTTPS format: https://github.com/user/repo.git
  const httpsMatch = remoteUrl.match(/^https?:\/\/(.+?)(?:\.git)?$/)
  if (httpsMatch) {
    return `https://${httpsMatch[1]}`
  }

  return null
}

async function resolveAndValidateGitFilePath(repoRootPath: string, rawFilePath: string) {
  const normalizedFilePath = normalizeForGitPathspec(rawFilePath.trim())
  if (normalizedFilePath.length === 0) {
    throw new Error('File path is required.')
  }

  const absoluteFilePath = path.resolve(repoRootPath, normalizedFilePath)
  if (!isWithinRepository(repoRootPath, absoluteFilePath)) {
    throw new Error('Invalid file path for this repository.')
  }

  return normalizedFilePath
}

async function openExternalUrl(url: string): Promise<void> {
  try {
    const electronModule = await import('electron')
    const shellApi = electronModule?.shell
    if (shellApi && typeof shellApi.openExternal === 'function') {
      await shellApi.openExternal(url)
    }
  } catch {
    // Best effort: opening a browser is optional and unavailable in non-Electron runtimes (tests/CLI).
  }
}

async function readStagedDiffText(repoRootPath: string) {
  const { stdout } = await runGit(['diff', '--cached', '--no-color', '--unified=3', '--', '.'], repoRootPath)
  return stdout
}

async function readStagedNumstatText(repoRootPath: string) {
  const { stdout } = await runGit(['diff', '--cached', '--numstat', '--', '.'], repoRootPath)
  return stdout
}

export async function gitCommit(input: GitCommitInput): Promise<GitCommitResult> {
  const workspacePath = input.workspacePath.trim()
  if (workspacePath.length === 0) {
    throw new Error('Workspace path is required.')
  }

  const repoRootPath = await resolveRepositoryRoot(workspacePath)
  if (!repoRootPath) {
    throw new Error('No git repository was found for this workspace.')
  }

  // Stage all changes if requested
  if (input.includeUnstaged) {
    try {
      await runGit(['add', '-A'], repoRootPath)
    } catch (error) {
      throw new Error(`Failed to stage changes: ${getErrorMessage(error)}`)
    }
  }

  const trimmedMessage = input.message.trim()
  const effectiveCommitMessage =
    trimmedMessage.length > 0
      ? trimmedMessage
      : await (async () => {
          const { generateCommitMessageFromDiff } = await import('./commitMessageGenerator')
          return generateCommitMessageFromDiff({
            diffText: await readStagedDiffText(repoRootPath),
            numstatText: await readStagedNumstatText(repoRootPath),
            selection:
              input.providerId && input.modelId
                ? {
                    modelId: input.modelId,
                    providerId: input.providerId,
                    reasoningEffort: input.reasoningEffort ?? 'medium',
                  }
                : null,
          })
        })()

  // Commit
  const commitArgs = ['commit']
  commitArgs.push('-m', effectiveCommitMessage)

  let commitHash = ''
  try {
    await runGit(commitArgs, repoRootPath)
    const { stdout } = await runGit(['rev-parse', '--short', 'HEAD'], repoRootPath)
    commitHash = stdout.trim()
  } catch (error) {
    throw new Error(`Failed to commit: ${getErrorMessage(error)}`)
  }

  // Push if needed
  if (input.action === 'commit-and-push' || input.action === 'commit-and-create-pr') {
    try {
      const { stdout: branchStdout } = await runGit(['symbolic-ref', '--short', 'HEAD'], repoRootPath)
      const currentBranch = branchStdout.trim()

      await runGit(['push', '-u', 'origin', currentBranch], repoRootPath)

      // Open PR creation page if requested
      if (input.action === 'commit-and-create-pr') {
        const remoteUrl = await getRemoteUrl(repoRootPath)
        if (remoteUrl) {
          const httpsBase = remoteUrlToHttpsBase(remoteUrl)
          if (httpsBase) {
            const prUrl = `${httpsBase}/compare/${encodeURIComponent(currentBranch)}?expand=1`
            void openExternalUrl(prUrl)
          }
        }
      }
    } catch (error) {
      if (isGitUnavailable(error)) {
        throw new Error('Git is not available in the current environment.')
      }

      throw new Error(`Committed successfully but failed to push: ${getErrorMessage(error)}`)
    }
  }

  return {
    commitHash,
    message: effectiveCommitMessage,
    success: true,
  }
}
