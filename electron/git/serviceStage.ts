import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { GitFileStageInput, GitFileStageResult } from '../../src/types/chat'
import {
  getErrorMessage,
  isGitUnavailable,
  resolveAndValidateGitFilePath,
  resolveRepositoryRoot,
  runGit,
} from './repositoryContext'

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

