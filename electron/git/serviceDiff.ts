import type { GitDiffSnapshot, GitFileDiff } from '../../src/types/chat'
import { readHeadFile, readWorkingTreeFile, resolveRepositoryRoot, runGit } from './repositoryContext'
import { normalizeGitFilePath, splitNullDelimitedOutput } from './serviceHelpers'

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

