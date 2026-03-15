import type { GitSyncAction, GitSyncInput, GitSyncResult } from '../../src/types/chat'
import {
  getErrorMessage,
  hasOriginRemote,
  hasRemoteTrackingBranch,
  isFastForwardOnlyPullFailure,
  isGitUnavailable,
  isWorkingTreeConflictFailure,
  readCurrentUpstreamBranch,
  readSymbolicHeadBranchName,
  resolveRepositoryRoot,
  runGit,
} from './repositoryContext'

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

