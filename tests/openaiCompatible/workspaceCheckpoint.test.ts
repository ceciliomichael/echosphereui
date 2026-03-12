import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createWorkspaceCheckpointStore } from '../../electron/workspace/checkpoints'

async function withTemporaryDirectories<T>(callback: (input: { historyPath: string; workspacePath: string }) => Promise<T>) {
  const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'echosphere-workspace-checkpoint-test-'))
  const historyPath = path.join(rootPath, 'history')
  const workspacePath = path.join(rootPath, 'workspace')
  await fs.mkdir(historyPath, { recursive: true })
  await fs.mkdir(workspacePath, { recursive: true })

  try {
    return await callback({
      historyPath,
      workspacePath,
    })
  } finally {
    await fs.rm(rootPath, { force: true, recursive: true })
  }
}

test('workspace checkpoints restore an edited file to its original content even after later edits', async () => {
  await withTemporaryDirectories(async ({ historyPath, workspacePath }) => {
    const checkpointStore = createWorkspaceCheckpointStore(historyPath)
    const targetFilePath = path.join(workspacePath, 'src', 'feature.ts')
    await fs.mkdir(path.dirname(targetFilePath), { recursive: true })
    await fs.writeFile(targetFilePath, 'before', 'utf8')

    const checkpoint = await checkpointStore.createCheckpoint({
      workspaceRootPath: workspacePath,
    })

    await checkpointStore.captureFileState(checkpoint.id, targetFilePath)
    await fs.writeFile(targetFilePath, 'after', 'utf8')
    await checkpointStore.captureFileState(checkpoint.id, targetFilePath)
    await fs.writeFile(targetFilePath, 'after user edit', 'utf8')

    await checkpointStore.restoreCheckpoint(checkpoint.id)

    assert.equal(await fs.readFile(targetFilePath, 'utf8'), 'before')
  })
})

test('workspace checkpoints delete files that did not exist when the run started', async () => {
  await withTemporaryDirectories(async ({ historyPath, workspacePath }) => {
    const checkpointStore = createWorkspaceCheckpointStore(historyPath)
    const createdFilePath = path.join(workspacePath, 'new-file.ts')
    const checkpoint = await checkpointStore.createCheckpoint({
      workspaceRootPath: workspacePath,
    })

    await checkpointStore.captureFileState(checkpoint.id, createdFilePath)
    await fs.writeFile(createdFilePath, 'generated', 'utf8')

    await checkpointStore.restoreCheckpoint(checkpoint.id)

    await assert.rejects(() => fs.stat(createdFilePath), (error: unknown) => {
      return (error as NodeJS.ErrnoException).code === 'ENOENT'
    })
  })
})

test('workspace checkpoints delete directories that did not exist when the run started', async () => {
  await withTemporaryDirectories(async ({ historyPath, workspacePath }) => {
    const checkpointStore = createWorkspaceCheckpointStore(historyPath)
    const createdFilePath = path.join(workspacePath, 'generated', 'nested', 'new-file.ts')
    const createdTopDirectory = path.join(workspacePath, 'generated')

    const checkpoint = await checkpointStore.createCheckpoint({
      workspaceRootPath: workspacePath,
    })

    await checkpointStore.captureFileState(checkpoint.id, createdFilePath)
    await fs.mkdir(path.dirname(createdFilePath), { recursive: true })
    await fs.writeFile(createdFilePath, 'generated', 'utf8')

    await checkpointStore.restoreCheckpoint(checkpoint.id)

    await assert.rejects(() => fs.stat(createdFilePath), (error: unknown) => {
      return (error as NodeJS.ErrnoException).code === 'ENOENT'
    })

    await assert.rejects(() => fs.stat(createdTopDirectory), (error: unknown) => {
      return (error as NodeJS.ErrnoException).code === 'ENOENT'
    })
  })
})
