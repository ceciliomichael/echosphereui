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
  GitHistoryCommitDetailsInput,
  GitHistoryCommitDetailsResult,
  GitHistoryEntry,
  GitHistoryPageInput,
  GitHistoryPageResult,
  GitFileStageInput,
  GitFileStageResult,
  GitFileDiff,
  GitStatusResult,
  GitSyncAction,
  GitSyncInput,
  GitSyncResult,
} from '../../src/types/chat'
import { extractCommitSubjectLine, normalizeGeneratedCommitMessageWithDescription } from './commitMessageFormatting'

const execFileAsync = promisify(execFile)
const GIT_EXECUTION_OPTIONS = {
  encoding: 'utf8' as const,
  maxBuffer: 1024 * 1024,
  windowsHide: true,
}
const GH_EXECUTION_OPTIONS = {
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

async function runGh(args: string[], cwd: string) {
  return execFileAsync('gh', args, {
    ...GH_EXECUTION_OPTIONS,
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

async function hasOriginRemote(repoRootPath: string) {
  try {
    await runGit(['remote', 'get-url', 'origin'], repoRootPath)
    return true
  } catch {
    return false
  }
}

async function fetchOrigin(repoRootPath: string) {
  if (!(await hasOriginRemote(repoRootPath))) {
    return false
  }

  await runGit(['fetch', '--prune', 'origin'], repoRootPath)
  return true
}

async function hasRemoteTrackingBranch(repoRootPath: string, branchName: string) {
  try {
    await runGit(['show-ref', '--verify', '--quiet', `refs/remotes/origin/${branchName}`], repoRootPath)
    return true
  } catch {
    return false
  }
}

async function readCurrentUpstreamBranch(repoRootPath: string) {
  try {
    const { stdout } = await runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], repoRootPath)
    const upstreamBranch = stdout.trim()
    return upstreamBranch.length > 0 ? upstreamBranch : null
  } catch {
    return null
  }
}

function isFastForwardOnlyPullFailure(error: unknown) {
  const normalizedMessage = getErrorMessage(error).toLowerCase()
  return (
    normalizedMessage.includes('not possible to fast-forward') ||
    normalizedMessage.includes('cannot fast-forward') ||
    normalizedMessage.includes('divergent branches')
  )
}

function isWorkingTreeConflictFailure(error: unknown) {
  const normalizedMessage = getErrorMessage(error).toLowerCase()
  return (
    normalizedMessage.includes('would be overwritten by checkout') ||
    normalizedMessage.includes('your local changes to the following files would be overwritten') ||
    normalizedMessage.includes('please commit your changes or stash them')
  )
}

async function syncCheckedOutBranchWithRemote(repoRootPath: string, branchName: string) {
  const hasRemote = await fetchOrigin(repoRootPath)
  if (!hasRemote) {
    return
  }

  let upstreamBranch = await readCurrentUpstreamBranch(repoRootPath)
  if (!upstreamBranch && (await hasRemoteTrackingBranch(repoRootPath, branchName))) {
    await runGit(['branch', '--set-upstream-to', `origin/${branchName}`, branchName], repoRootPath)
    upstreamBranch = `origin/${branchName}`
  }

  if (!upstreamBranch) {
    return
  }

  await runGit(['pull', '--ff-only', '--no-rebase'], repoRootPath)
}

async function readHeadCommitHash(repoRootPath: string) {
  try {
    const { stdout } = await runGit(['rev-parse', 'HEAD'], repoRootPath)
    const commitHash = stdout.trim()
    return commitHash.length > 0 ? commitHash : null
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
    const errorCode = (error as NodeJS.ErrnoException).code
    if (errorCode === 'ENOENT') {
      return ''
    }
    if (errorCode === 'EISDIR' || errorCode === 'EPERM' || errorCode === 'EACCES') {
      // Directory entries (for example gitlinks/submodules) or unreadable files
      // should not fail the entire diff snapshot request.
      return null
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
    await syncCheckedOutBranchWithRemote(repoRootPath, branchName)
  } catch (error) {
    if (isGitUnavailable(error)) {
      throw new Error('Git is not available in the current environment.')
    }

    if (isWorkingTreeConflictFailure(error)) {
      throw new Error(
        'Cannot switch branches because local changes would be overwritten. Commit, stash, or discard changes first.',
      )
    }

    if (isFastForwardOnlyPullFailure(error)) {
      throw new Error(
        `Switched to '${branchName}' but it cannot be fast-forwarded from origin. Resolve divergence (merge/rebase) before continuing.`,
      )
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

function parseDecoratedRefs(refText: string) {
  return refText
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
}

function parseGitHistoryLine(line: string, headHash: string | null): GitHistoryEntry | null {
  const separatorIndex = line.indexOf('\u001f')
  if (separatorIndex < 0) {
    return null
  }

  const graphPrefix = line.slice(0, separatorIndex).replace(/\s+$/u, '')
  const payload = line.slice(separatorIndex + 1)
  const fields = payload.split('\u001f')
  if (fields.length < 8) {
    return null
  }

  const [hash, shortHash, parentIdsRaw, authorName, authoredAt, authoredRelativeTime, subject, refText] = fields
  const normalizedHash = hash.trim()
  if (normalizedHash.length === 0) {
    return null
  }

  const parentIds = parentIdsRaw
    .trim()
    .split(/\s+/)
    .filter((id) => id.length > 0)

  return {
    authorName: authorName.trim(),
    authoredAt: authoredAt.trim(),
    authoredRelativeTime: authoredRelativeTime.trim(),
    graphPrefix,
    hash: normalizedHash,
    isHead: headHash !== null && normalizedHash === headHash,
    parentIds,
    refs: parseDecoratedRefs(refText),
    shortHash: shortHash.trim(),
    subject: subject.trim(),
  }
}

export async function getGitHistoryPage(input: GitHistoryPageInput): Promise<GitHistoryPageResult> {
  const workspacePath = input.workspacePath.trim()
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(500, Math.round(input.limit))) : 200
  const offset = Number.isFinite(input.offset) ? Math.max(0, Math.round(input.offset)) : 0

  if (workspacePath.length === 0) {
    throw new Error('Workspace path is required.')
  }

  const repoRootPath = await resolveRepositoryRoot(workspacePath)
  if (!repoRootPath) {
    return {
      entries: [],
      hasMore: false,
      hasRepository: false,
      headHash: null,
    }
  }

  const headHash = await readHeadCommitHash(repoRootPath)
  const maxEntriesToRead = limit + 1
  const logFormat = '%x1f%H%x1f%h%x1f%P%x1f%an%x1f%aI%x1f%ar%x1f%s%x1f%D'

  let historyStdout = ''
  try {
    const { stdout } = await runGit(
      [
        'log',
        '--graph',
        '--decorate=short',
        '--date=iso-strict',
        '--pretty=format:' + logFormat,
        '--all',
        '--no-color',
        `--skip=${offset}`,
        `-n${maxEntriesToRead}`,
      ],
      repoRootPath,
    )
    historyStdout = stdout
  } catch (error) {
    const message = getErrorMessage(error).toLowerCase()
    if (message.includes('does not have any commits yet')) {
      return {
        entries: [],
        hasMore: false,
        hasRepository: true,
        headHash,
      }
    }

    if (isGitUnavailable(error)) {
      throw new Error('Git is not available in the current environment.')
    }

    throw new Error(`Failed to load git history: ${getErrorMessage(error)}`)
  }

  const parsedEntries = historyStdout
    .split(/\r?\n/u)
    .map((line) => parseGitHistoryLine(line, headHash))
    .filter((entry): entry is GitHistoryEntry => entry !== null)

  return {
    entries: parsedEntries.slice(0, limit),
    hasMore: parsedEntries.length > limit,
    hasRepository: true,
    headHash,
  }
}

export async function getGitHistoryCommitDetails(
  input: GitHistoryCommitDetailsInput,
): Promise<GitHistoryCommitDetailsResult> {
  const workspacePath = input.workspacePath.trim()
  const commitHash = input.commitHash.trim()

  if (workspacePath.length === 0) {
    throw new Error('Workspace path is required.')
  }

  if (commitHash.length === 0) {
    throw new Error('Commit hash is required.')
  }

  const repoRootPath = await resolveRepositoryRoot(workspacePath)
  if (!repoRootPath) {
    return {
      changedFileCount: 0,
      commitHash,
      deletions: 0,
      files: [],
      hasRepository: false,
      insertions: 0,
      messageBody: '',
    }
  }

  try {
    const [{ stdout: filesStdout }, { stdout: bodyStdout }, { stdout: shortStatStdout }] = await Promise.all([
      runGit(
      ['show', '--format=', '--name-status', '--find-renames', '--no-color', '-m', '--first-parent', commitHash],
      repoRootPath,
      ),
      runGit(['log', '-1', '--format=%B', '--no-color', commitHash], repoRootPath),
      runGit(['show', '--format=', '--shortstat', '--no-color', '-m', '--first-parent', commitHash], repoRootPath),
    ])

    const files = filesStdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const [status = 'M', ...pathParts] = line.split(/\t+/u)
        const rawPath = pathParts.at(-1) ?? ''
        return {
          path: normalizeGitFilePath(rawPath.trim()),
          status: status.trim().length > 0 ? status.trim() : 'M',
        }
      })
      .filter((file) => file.path.length > 0)

    const shortStatLine = shortStatStdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.length > 0)

    const filesChangedMatch = /(\d+)\s+files?\s+changed/iu.exec(shortStatLine ?? '')
    const insertionsMatch = /(\d+)\s+insertions?\(\+\)/iu.exec(shortStatLine ?? '')
    const deletionsMatch = /(\d+)\s+deletions?\(-\)/iu.exec(shortStatLine ?? '')
    const changedFileCount = filesChangedMatch ? Number.parseInt(filesChangedMatch[1], 10) : files.length
    const insertions = insertionsMatch ? Number.parseInt(insertionsMatch[1], 10) : 0
    const deletions = deletionsMatch ? Number.parseInt(deletionsMatch[1], 10) : 0

    return {
      changedFileCount,
      commitHash,
      deletions,
      files,
      hasRepository: true,
      insertions,
      messageBody: bodyStdout.trim(),
    }
  } catch (error) {
    if (isGitUnavailable(error)) {
      throw new Error('Git is not available in the current environment.')
    }

    throw new Error(`Failed to load commit details: ${getErrorMessage(error)}`)
  }
}

export async function gitSync(input: GitSyncInput): Promise<GitSyncResult> {
  const workspacePath = input.workspacePath.trim()
  if (workspacePath.length === 0) {
    throw new Error('Workspace path is required.')
  }

  const repoRootPath = await resolveRepositoryRoot(workspacePath)
  if (!repoRootPath) {
    throw new Error('No git repository was found for this workspace.')
  }

  const action: GitSyncAction = input.action
  let branchName = await readSymbolicHeadBranchName(repoRootPath)
  let message = ''

  try {
    if (action === 'fetch-all') {
      await runGit(['fetch', '--all', '--prune'], repoRootPath)
      message = 'Fetched all remotes.'
    } else if (action === 'pull') {
      if (!branchName) {
        throw new Error('Cannot pull from detached HEAD. Checkout a branch first.')
      }

      let upstreamBranch = await readCurrentUpstreamBranch(repoRootPath)
      if (!upstreamBranch && (await hasRemoteTrackingBranch(repoRootPath, branchName))) {
        await runGit(['branch', '--set-upstream-to', `origin/${branchName}`, branchName], repoRootPath)
        upstreamBranch = `origin/${branchName}`
      }

      if (!upstreamBranch) {
        throw new Error(
          `No upstream is configured for '${branchName}'. Push once or set an upstream before pulling.`,
        )
      }

      await runGit(['pull', '--ff-only', '--no-rebase'], repoRootPath)
      message = `Pulled latest changes into '${branchName}'.`
    } else if (action === 'push') {
      if (!branchName) {
        throw new Error('Cannot push from detached HEAD. Checkout a branch first.')
      }

      const upstreamBranch = await readCurrentUpstreamBranch(repoRootPath)
      if (upstreamBranch) {
        await runGit(['push'], repoRootPath)
      } else if (await hasOriginRemote(repoRootPath)) {
        await runGit(['push', '-u', 'origin', branchName], repoRootPath)
      } else {
        throw new Error("Remote 'origin' is not configured for this repository.")
      }

      message = `Pushed '${branchName}' to remote.`
    } else {
      throw new Error(`Unsupported sync action: ${String(action)}`)
    }
  } catch (error) {
    if (isGitUnavailable(error)) {
      throw new Error('Git is not available in the current environment.')
    }

    if (action === 'pull' && isFastForwardOnlyPullFailure(error)) {
      throw new Error('Pull failed because the branch cannot be fast-forwarded. Rebase or merge first.')
    }

    if (action === 'pull' && isWorkingTreeConflictFailure(error)) {
      throw new Error(
        'Pull failed because local changes would be overwritten. Commit, stash, or discard changes first.',
      )
    }

    throw new Error(`Failed to ${action}: ${getErrorMessage(error)}`)
  }

  branchName = await readSymbolicHeadBranchName(repoRootPath)
  return {
    action,
    branchName,
    message,
    success: true,
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

interface GitHubRepositoryRef {
  owner: string
  repo: string
}

function parseGitHubRepositoryRef(remoteUrl: string): GitHubRepositoryRef | null {
  const sshMatch = /^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/u.exec(remoteUrl)
  if (sshMatch) {
    return {
      owner: sshMatch[1],
      repo: sshMatch[2],
    }
  }

  const httpsMatch = /^https?:\/\/github\.com\/([^/]+)\/(.+?)(?:\.git)?$/u.exec(remoteUrl)
  if (httpsMatch) {
    return {
      owner: httpsMatch[1],
      repo: httpsMatch[2],
    }
  }

  const sshProtocolMatch = /^ssh:\/\/git@github\.com\/([^/]+)\/(.+?)(?:\.git)?$/u.exec(remoteUrl)
  if (sshProtocolMatch) {
    return {
      owner: sshProtocolMatch[1],
      repo: sshProtocolMatch[2],
    }
  }

  return null
}

function getCommitMessageSubject(commitMessage: string) {
  const firstLine = commitMessage
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => line.length > 0)

  return firstLine ?? 'chore: update repository changes'
}

function getCommitMessageBody(commitMessage: string) {
  const lines = commitMessage.split(/\r?\n/u)
  const firstNonEmptyLineIndex = lines.findIndex((line) => line.trim().length > 0)
  if (firstNonEmptyLineIndex < 0) {
    return 'Automated PR created by EchoSphere.'
  }

  const body = lines
    .slice(firstNonEmptyLineIndex + 1)
    .join('\n')
    .trim()

  return body.length > 0 ? body : 'Automated PR created by EchoSphere.'
}

function extractGitHubPullRequestUrl(text: string) {
  const match = /(https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+)/u.exec(text)
  return match ? match[1] : null
}

function isGhUnavailable(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const commandError = error as GitCommandError
  const message = getErrorMessage(commandError).toLowerCase()
  return commandError.code === 'ENOENT' || message.includes("'gh' is not recognized") || message.includes('command not found')
}

function isGhAuthError(error: unknown) {
  const message = getErrorMessage(error).toLowerCase()
  return message.includes('authentication') || message.includes('gh auth login') || message.includes('not logged into')
}

async function createOrGetGitHubPullRequest(input: {
  baseBranchName: string
  commitMessage: string
  currentBranchName: string
  repoRootPath: string
  repositoryRef: GitHubRepositoryRef
}) {
  const repositorySlug = `${input.repositoryRef.owner}/${input.repositoryRef.repo}`
  try {
    const { stdout: existingPrStdout } = await runGh(
      [
        'pr',
        'list',
        '--state',
        'open',
        '--head',
        input.currentBranchName,
        '--base',
        input.baseBranchName,
        '--json',
        'url',
        '--limit',
        '1',
        '--repo',
        repositorySlug,
      ],
      input.repoRootPath,
    )

    const parsedExistingPr = JSON.parse(existingPrStdout) as Array<{ url?: string }>
    const existingUrl = parsedExistingPr[0]?.url?.trim()
    if (existingUrl && existingUrl.length > 0) {
      return existingUrl
    }
  } catch (error) {
    if (isGhUnavailable(error)) {
      throw new Error('GitHub CLI (`gh`) is required to auto-create PRs. Install `gh` and authenticate with `gh auth login`.')
    }

    if (isGhAuthError(error)) {
      throw new Error('GitHub CLI is not authenticated. Run `gh auth login` to enable automatic PR creation.')
    }

    throw new Error(`Failed to check existing pull requests: ${getErrorMessage(error)}`)
  }

  try {
    const { stdout: createPrStdout } = await runGh(
      [
        'pr',
        'create',
        '--base',
        input.baseBranchName,
        '--head',
        input.currentBranchName,
        '--title',
        getCommitMessageSubject(input.commitMessage),
        '--body',
        getCommitMessageBody(input.commitMessage),
        '--repo',
        repositorySlug,
      ],
      input.repoRootPath,
    )

    const createdPrUrl = extractGitHubPullRequestUrl(createPrStdout)
    if (createdPrUrl) {
      return createdPrUrl
    }
  } catch (error) {
    if (isGhUnavailable(error)) {
      throw new Error('GitHub CLI (`gh`) is required to auto-create PRs. Install `gh` and authenticate with `gh auth login`.')
    }

    if (isGhAuthError(error)) {
      throw new Error('GitHub CLI is not authenticated. Run `gh auth login` to enable automatic PR creation.')
    }

    throw new Error(`Failed to create pull request: ${getErrorMessage(error)}`)
  }

  try {
    const { stdout: fallbackListStdout } = await runGh(
      [
        'pr',
        'list',
        '--state',
        'open',
        '--head',
        input.currentBranchName,
        '--base',
        input.baseBranchName,
        '--json',
        'url',
        '--limit',
        '1',
        '--repo',
        repositorySlug,
      ],
      input.repoRootPath,
    )
    const parsedFallback = JSON.parse(fallbackListStdout) as Array<{ url?: string }>
    const fallbackUrl = parsedFallback[0]?.url?.trim()
    if (fallbackUrl && fallbackUrl.length > 0) {
      return fallbackUrl
    }
  } catch {
    // best effort fallback
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

async function readStagedDiffText(repoRootPath: string) {
  const { stdout } = await runGit(['diff', '--cached', '--no-color', '--unified=3', '--', '.'], repoRootPath)
  return stdout
}

async function readStagedNumstatText(repoRootPath: string) {
  const { stdout } = await runGit(['diff', '--cached', '--numstat', '--', '.'], repoRootPath)
  return stdout
}

const CONVENTIONAL_COMMIT_SUBJECT_PATTERN = /^(feat|fix|docs|style|refactor|test|build|ci|perf|chore)(?:\([^)]+\))?!?:\s*(.+)$/iu
const DEFAULT_AUTONOMOUS_BRANCH_TYPE = 'chore'
const AUTONOMOUS_BRANCH_MAX_LENGTH = 72
const AUTONOMOUS_BRANCH_SEGMENT_MAX_LENGTH = 52

function trimInvalidBranchTail(value: string) {
  return value.replace(/[./-]+$/gu, '')
}

function sanitizeBranchSegment(value: string, maxLength = AUTONOMOUS_BRANCH_SEGMENT_MAX_LENGTH) {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-+|-+$/gu, '')

  return trimInvalidBranchTail(normalized.slice(0, maxLength))
}

function parseTouchedFilesFromNumstat(numstatText: string) {
  const touchedFiles = new Set<string>()

  for (const line of numstatText.split(/\r?\n/u)) {
    const trimmedLine = line.trim()
    if (trimmedLine.length === 0) {
      continue
    }

    const parts = trimmedLine.split(/\t/u)
    if (parts.length < 3) {
      continue
    }

    const rawPath = parts.slice(2).join('\t').trim()
    if (rawPath.length === 0) {
      continue
    }

    // Handle rename notations like `old/path.ts => new/path.ts`.
    const renamedTargetPath = rawPath.includes('=>') ? rawPath.split('=>').at(-1)?.trim() ?? rawPath : rawPath
    const normalizedPath = normalizeGitFilePath(renamedTargetPath.replace(/[{}]/gu, '').replace(/^"+|"+$/gu, ''))
    if (normalizedPath.length > 0) {
      touchedFiles.add(normalizedPath)
    }
  }

  return Array.from(touchedFiles)
}

function deriveBranchSummaryFromTouchedFiles(touchedFiles: readonly string[]) {
  if (touchedFiles.length === 0) {
    return 'update-changes'
  }

  const firstFile = touchedFiles[0]
  const firstFileBaseName = path.posix.basename(firstFile).replace(/\.[^.]+$/u, '')
  const normalizedFirstName = sanitizeBranchSegment(firstFileBaseName, 24)

  if (touchedFiles.length === 1) {
    return normalizedFirstName.length > 0 ? `update-${normalizedFirstName}` : 'update-file'
  }

  if (normalizedFirstName.length > 0) {
    return `update-${normalizedFirstName}-and-${touchedFiles.length - 1}-more`
  }

  return `update-${touchedFiles.length}-files`
}

function buildAutonomousBranchBaseName(commitMessage: string, stagedNumstatText: string) {
  const commitSubject = extractCommitSubjectLine(commitMessage)
  const normalizedMessage = commitSubject.length > 0 ? commitSubject : commitMessage.trim()
  const conventionalMatch = CONVENTIONAL_COMMIT_SUBJECT_PATTERN.exec(normalizedMessage)
  const branchType = sanitizeBranchSegment(conventionalMatch?.[1] ?? DEFAULT_AUTONOMOUS_BRANCH_TYPE, 16)
  const summaryFromMessage = sanitizeBranchSegment(conventionalMatch?.[2] ?? normalizedMessage)
  const summary =
    summaryFromMessage.length > 0
      ? summaryFromMessage
      : deriveBranchSummaryFromTouchedFiles(parseTouchedFilesFromNumstat(stagedNumstatText))

  const normalizedType = branchType.length > 0 ? branchType : DEFAULT_AUTONOMOUS_BRANCH_TYPE
  const baseName = `${normalizedType}/${summary}`
  const boundedName = trimInvalidBranchTail(baseName.slice(0, AUTONOMOUS_BRANCH_MAX_LENGTH))

  return boundedName.length > 0 ? boundedName : `${DEFAULT_AUTONOMOUS_BRANCH_TYPE}/update-changes`
}

async function doesLocalBranchExist(repoRootPath: string, branchName: string) {
  try {
    await runGit(['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], repoRootPath)
    return true
  } catch {
    return false
  }
}

async function checkoutOrCreateBranch(repoRootPath: string, branchName: string) {
  await validateBranchName(branchName, repoRootPath)

  if (await doesLocalBranchExist(repoRootPath, branchName)) {
    await runGit(['checkout', '--quiet', branchName], repoRootPath)
    return branchName
  }

  await runGit(['checkout', '--quiet', '-b', branchName], repoRootPath)
  return branchName
}

async function resolveDefaultBranchName(repoRootPath: string) {
  const remoteDefaultBranch = await readDefaultBranch(repoRootPath)
  if (remoteDefaultBranch) {
    return remoteDefaultBranch
  }

  const localBranches = await readLocalBranches(repoRootPath).catch((): string[] => [])
  if (localBranches.includes('main')) {
    return 'main'
  }

  if (localBranches.includes('master')) {
    return 'master'
  }

  return null
}

function isDefaultBranchName(branchName: string, defaultBranch: string | null) {
  const normalizedBranchName = branchName.trim().toLowerCase()
  if (normalizedBranchName.length === 0) {
    return false
  }

  if (defaultBranch && normalizedBranchName === defaultBranch.trim().toLowerCase()) {
    return true
  }

  return normalizedBranchName === 'main' || normalizedBranchName === 'master'
}

async function checkPotentialConflictsWithDefaultBranch(
  repoRootPath: string,
  currentBranch: string,
  defaultBranch: string,
) {
  try {
    const { stdout: mergeBaseStdout } = await runGit(
      ['merge-base', currentBranch, `origin/${defaultBranch}`],
      repoRootPath,
    )
    const mergeBaseSha = mergeBaseStdout.trim()
    if (mergeBaseSha.length === 0) {
      return false
    }

    const { stdout: mergeTreeStdout } = await runGit(
      ['merge-tree', mergeBaseSha, currentBranch, `origin/${defaultBranch}`],
      repoRootPath,
    )

    return mergeTreeStdout.includes('<<<<<<<')
  } catch {
    // `merge-tree` availability and output can vary by git version; treat as non-blocking when unavailable.
    return false
  }
}

async function ensureBranchReadyForPullRequest(
  repoRootPath: string,
  currentBranch: string,
  defaultBranch: string | null,
) {
  if (!defaultBranch || isDefaultBranchName(currentBranch, defaultBranch)) {
    return
  }

  const hasRemote = await fetchOrigin(repoRootPath)
  if (!hasRemote || !(await hasRemoteTrackingBranch(repoRootPath, defaultBranch))) {
    return
  }

  try {
    await runGit(['merge-base', '--is-ancestor', `origin/${defaultBranch}`, currentBranch], repoRootPath)
  } catch {
    const hasPotentialConflicts = await checkPotentialConflictsWithDefaultBranch(
      repoRootPath,
      currentBranch,
      defaultBranch,
    )

    if (hasPotentialConflicts) {
      throw new Error(
        `Branch '${currentBranch}' likely conflicts with '${defaultBranch}'. Rebase or merge '${defaultBranch}' into '${currentBranch}' before creating a PR.`,
      )
    }

    throw new Error(
      `Branch '${currentBranch}' is not up to date with '${defaultBranch}'. Rebase or merge '${defaultBranch}' before creating a PR.`,
    )
  }
}

async function reserveUniqueLocalBranchName(repoRootPath: string, baseBranchName: string) {
  const normalizedBaseName = trimInvalidBranchTail(baseBranchName.trim())
  if (normalizedBaseName.length === 0) {
    throw new Error('Failed to derive an automatic branch name.')
  }

  await validateBranchName(normalizedBaseName, repoRootPath)
  if (!(await doesLocalBranchExist(repoRootPath, normalizedBaseName))) {
    return normalizedBaseName
  }

  for (let suffix = 2; suffix <= 99; suffix += 1) {
    const suffixText = `-${suffix}`
    const baseBudget = AUTONOMOUS_BRANCH_MAX_LENGTH - suffixText.length
    const truncatedBase = trimInvalidBranchTail(normalizedBaseName.slice(0, Math.max(1, baseBudget)))
    const candidate = trimInvalidBranchTail(`${truncatedBase}${suffixText}`)
    if (candidate.length === 0) {
      continue
    }

    try {
      await validateBranchName(candidate, repoRootPath)
      if (!(await doesLocalBranchExist(repoRootPath, candidate))) {
        return candidate
      }
    } catch {
      continue
    }
  }

  throw new Error('Failed to allocate a unique automatic branch name for this commit.')
}

async function createAutonomousFeatureBranch(
  repoRootPath: string,
  effectiveCommitMessage: string,
  stagedNumstatText: string,
) {
  const baseBranchName = buildAutonomousBranchBaseName(effectiveCommitMessage, stagedNumstatText)
  const uniqueBranchName = await reserveUniqueLocalBranchName(repoRootPath, baseBranchName)
  return checkoutOrCreateBranch(repoRootPath, uniqueBranchName)
}

async function readSymbolicHeadBranchName(repoRootPath: string) {
  try {
    const { stdout } = await runGit(['symbolic-ref', '--quiet', '--short', 'HEAD'], repoRootPath)
    const branchName = stdout.trim()
    return branchName.length > 0 ? branchName : null
  } catch {
    return null
  }
}

interface PostPullRequestCleanupResult {
  defaultBranchName: string | null
  postCommitWarning: string | null
  pulledLatestOnDefaultBranch: boolean
  switchedToDefaultBranch: boolean
}

async function runPostPullRequestCleanup(
  repoRootPath: string,
  pullRequestBranchName: string,
): Promise<PostPullRequestCleanupResult> {
  const defaultBranchName = await resolveDefaultBranchName(repoRootPath)
  if (!defaultBranchName) {
    return {
      defaultBranchName: null,
      postCommitWarning: 'Pull request was created, but no default branch could be resolved for post-PR cleanup.',
      pulledLatestOnDefaultBranch: false,
      switchedToDefaultBranch: false,
    }
  }

  if (isDefaultBranchName(pullRequestBranchName, defaultBranchName)) {
    return {
      defaultBranchName,
      postCommitWarning: null,
      pulledLatestOnDefaultBranch: false,
      switchedToDefaultBranch: false,
    }
  }

  try {
    await runGit(['checkout', '--quiet', defaultBranchName], repoRootPath)
  } catch (error) {
    return {
      defaultBranchName,
      postCommitWarning: `Pull request was created, but failed to switch back to '${defaultBranchName}': ${getErrorMessage(error)}`,
      pulledLatestOnDefaultBranch: false,
      switchedToDefaultBranch: false,
    }
  }

  try {
    await syncCheckedOutBranchWithRemote(repoRootPath, defaultBranchName)
    return {
      defaultBranchName,
      postCommitWarning: null,
      pulledLatestOnDefaultBranch: true,
      switchedToDefaultBranch: true,
    }
  } catch (error) {
    return {
      defaultBranchName,
      postCommitWarning: `Switched back to '${defaultBranchName}', but failed to pull the latest changes: ${getErrorMessage(error)}`,
      pulledLatestOnDefaultBranch: false,
      switchedToDefaultBranch: true,
    }
  }
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

  const stagedDiffText = await readStagedDiffText(repoRootPath)
  const stagedNumstatText = await readStagedNumstatText(repoRootPath)
  const trimmedMessage = input.message.trim()
  const generatedCommitMessage =
    trimmedMessage.length > 0
      ? null
      : await (async () => {
          const { generateCommitMessageFromDiff } = await import('./commitMessageGenerator')
          return generateCommitMessageFromDiff({
            diffText: stagedDiffText,
            numstatText: stagedNumstatText,
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
  const effectiveCommitMessage =
    trimmedMessage.length > 0
      ? trimmedMessage
      : normalizeGeneratedCommitMessageWithDescription(
          generatedCommitMessage ?? '',
          parseTouchedFilesFromNumstat(stagedNumstatText),
        )

  let activeBranchName = await readSymbolicHeadBranchName(repoRootPath)
  const preferredBranchName = input.preferredBranchName?.trim() ?? ''

  try {
    if (input.action === 'commit-and-create-pr') {
      const defaultBranchName = await resolveDefaultBranchName(repoRootPath)

      if (preferredBranchName.length > 0) {
        if (isDefaultBranchName(preferredBranchName, defaultBranchName)) {
          activeBranchName = await createAutonomousFeatureBranch(repoRootPath, effectiveCommitMessage, stagedNumstatText)
        } else {
          activeBranchName = await checkoutOrCreateBranch(repoRootPath, preferredBranchName)
        }
      } else {
        const currentBranchState = await readCurrentBranch(repoRootPath)
        const shouldAutoCreateFeatureBranch =
          currentBranchState.isDetachedHead ||
          currentBranchState.currentBranch === null ||
          (currentBranchState.currentBranch !== null &&
            isDefaultBranchName(currentBranchState.currentBranch, defaultBranchName))

        if (shouldAutoCreateFeatureBranch) {
          activeBranchName = await createAutonomousFeatureBranch(repoRootPath, effectiveCommitMessage, stagedNumstatText)
        } else {
          activeBranchName = currentBranchState.currentBranch
        }
      }
    } else if (preferredBranchName.length > 0) {
      activeBranchName = await checkoutOrCreateBranch(repoRootPath, preferredBranchName)
    }
  } catch (error) {
    if (isGitUnavailable(error)) {
      throw new Error('Git is not available in the current environment.')
    }

    throw new Error(`Failed to prepare branch for commit: ${getErrorMessage(error)}`)
  }

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
  let prUrl: string | null = null
  let defaultBranchName: string | null = null
  let switchedToDefaultBranch = false
  let pulledLatestOnDefaultBranch = false
  let postCommitWarning: string | null = null
  if (input.action === 'commit-and-push' || input.action === 'commit-and-create-pr') {
    try {
      const currentBranch = await readSymbolicHeadBranchName(repoRootPath)
      if (!currentBranch) {
        throw new Error('Cannot push from detached HEAD. Checkout a branch first.')
      }

      activeBranchName = currentBranch

      if (input.action === 'commit-and-create-pr') {
        await ensureBranchReadyForPullRequest(
          repoRootPath,
          currentBranch,
          await resolveDefaultBranchName(repoRootPath),
        )
      }

      await runGit(['push', '-u', 'origin', currentBranch], repoRootPath)

      // Create PR if requested
      if (input.action === 'commit-and-create-pr') {
        const remoteUrl = await getRemoteUrl(repoRootPath)
        if (remoteUrl) {
          const defaultBranchName = await resolveDefaultBranchName(repoRootPath)
          const effectiveDefaultBranch = defaultBranchName ?? 'main'
          const githubRepositoryRef = parseGitHubRepositoryRef(remoteUrl)

          if (githubRepositoryRef) {
            prUrl = await createOrGetGitHubPullRequest({
              baseBranchName: effectiveDefaultBranch,
              commitMessage: effectiveCommitMessage,
              currentBranchName: currentBranch,
              repoRootPath,
              repositoryRef: githubRepositoryRef,
            })
          } else {
            const httpsBase = remoteUrlToHttpsBase(remoteUrl)
            if (httpsBase) {
              const compareRef =
                effectiveDefaultBranch !== currentBranch
                  ? `${encodeURIComponent(effectiveDefaultBranch)}...${encodeURIComponent(currentBranch)}`
                  : encodeURIComponent(currentBranch)
              prUrl = `${httpsBase}/compare/${compareRef}?expand=1`
            }
          }
        }

        const postPullRequestCleanupResult = await runPostPullRequestCleanup(repoRootPath, currentBranch)
        defaultBranchName = postPullRequestCleanupResult.defaultBranchName
        switchedToDefaultBranch = postPullRequestCleanupResult.switchedToDefaultBranch
        pulledLatestOnDefaultBranch = postPullRequestCleanupResult.pulledLatestOnDefaultBranch
        postCommitWarning = postPullRequestCleanupResult.postCommitWarning
      }
    } catch (error) {
      if (isGitUnavailable(error)) {
        throw new Error('Git is not available in the current environment.')
      }

      throw new Error(`Committed successfully but failed to push: ${getErrorMessage(error)}`)
    }
  }

  return {
    branchName: activeBranchName,
    commitHash,
    defaultBranchName,
    message: effectiveCommitMessage,
    postCommitWarning,
    prUrl,
    pulledLatestOnDefaultBranch,
    success: true,
    switchedToDefaultBranch,
  }
}
