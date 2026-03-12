import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { CreateWorkspaceCheckpointInput, UserMessageRunCheckpoint } from '../../src/types/chat'

interface WorkspaceCheckpointEntry {
  existed: boolean
  relativePath: string
  snapshotFileName?: string
}

interface WorkspaceCheckpointDocument {
  createdAt: number
  entries: WorkspaceCheckpointEntry[]
  id: string
  workspaceRootPath: string
}

interface WorkspaceCheckpointStore {
  captureFileState: (checkpointId: string, absolutePath: string) => Promise<void>
  createCheckpoint: (input: CreateWorkspaceCheckpointInput) => Promise<UserMessageRunCheckpoint>
  restoreCheckpoint: (checkpointId: string) => Promise<void>
}

const CHECKPOINTS_DIRECTORY_NAME = 'workspace-checkpoints'
const MANIFEST_FILE_NAME = 'manifest.json'
const SNAPSHOTS_DIRECTORY_NAME = 'snapshots'

function normalizePath(value: string) {
  return path.resolve(value.trim())
}

function normalizeRelativePath(value: string) {
  const normalizedPath = value.replace(/\\/g, '/')
  return process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath
}

function assertInsideWorkspace(workspaceRootPath: string, absolutePath: string) {
  const relativePath = path.relative(workspaceRootPath, absolutePath)
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Path is outside the workspace checkpoint root: ${absolutePath}`)
  }

  return relativePath
}

async function ensureDirectory(directoryPath: string) {
  await fs.mkdir(directoryPath, { recursive: true })
}

export function createWorkspaceCheckpointStore(storageRootPath: string): WorkspaceCheckpointStore {
  const checkpointLocks = new Map<string, Promise<void>>()

  function getCheckpointsDirectoryPath() {
    return path.join(storageRootPath, CHECKPOINTS_DIRECTORY_NAME)
  }

  function getCheckpointDirectoryPath(checkpointId: string) {
    return path.join(getCheckpointsDirectoryPath(), checkpointId)
  }

  function getCheckpointManifestPath(checkpointId: string) {
    return path.join(getCheckpointDirectoryPath(checkpointId), MANIFEST_FILE_NAME)
  }

  function getCheckpointSnapshotsDirectoryPath(checkpointId: string) {
    return path.join(getCheckpointDirectoryPath(checkpointId), SNAPSHOTS_DIRECTORY_NAME)
  }

  async function writeManifest(document: WorkspaceCheckpointDocument) {
    await ensureDirectory(getCheckpointDirectoryPath(document.id))
    await fs.writeFile(getCheckpointManifestPath(document.id), JSON.stringify(document, null, 2), 'utf8')
  }

  async function readManifest(checkpointId: string) {
    const manifestPath = getCheckpointManifestPath(checkpointId)
    const raw = await fs.readFile(manifestPath, 'utf8')
    return JSON.parse(raw) as WorkspaceCheckpointDocument
  }

  async function withCheckpointLock<T>(checkpointId: string, operation: () => Promise<T>) {
    const previousOperation = checkpointLocks.get(checkpointId) ?? Promise.resolve()
    const nextOperation = previousOperation.catch(() => undefined).then(operation)
    checkpointLocks.set(checkpointId, nextOperation.then(() => undefined, () => undefined))

    try {
      return await nextOperation
    } finally {
      const activeOperation = checkpointLocks.get(checkpointId)
      if (activeOperation === checkpointLocks.get(checkpointId)) {
        activeOperation?.finally(() => {
          if (checkpointLocks.get(checkpointId) === activeOperation) {
            checkpointLocks.delete(checkpointId)
          }
        }).catch(() => {
          // Lock cleanup should never surface as an unhandled rejection.
        })
      }
    }
  }

  return {
    async createCheckpoint(input: CreateWorkspaceCheckpointInput) {
      const workspaceRootPath = normalizePath(input.workspaceRootPath)
      const workspaceStats = await fs.stat(workspaceRootPath).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new Error(`Workspace path does not exist: ${workspaceRootPath}`)
        }

        throw error
      })

      if (!workspaceStats.isDirectory()) {
        throw new Error(`Workspace checkpoint root must be a directory: ${workspaceRootPath}`)
      }

      await ensureDirectory(getCheckpointsDirectoryPath())

      const checkpoint: UserMessageRunCheckpoint = {
        createdAt: Date.now(),
        id: randomUUID(),
      }

      await writeManifest({
        createdAt: checkpoint.createdAt,
        entries: [],
        id: checkpoint.id,
        workspaceRootPath,
      })

      return checkpoint
    },

    async captureFileState(checkpointId: string, absolutePath: string) {
      await withCheckpointLock(checkpointId, async () => {
        const manifest = await readManifest(checkpointId)
        const normalizedTargetPath = normalizePath(absolutePath)
        const relativePath = assertInsideWorkspace(manifest.workspaceRootPath, normalizedTargetPath)
        const normalizedRelativePath = normalizeRelativePath(relativePath)
        if (manifest.entries.some((entry) => normalizeRelativePath(entry.relativePath) === normalizedRelativePath)) {
          return
        }

        try {
          const targetStats = await fs.stat(normalizedTargetPath)
          if (!targetStats.isFile()) {
            throw new Error(`Checkpoint capture only supports files: ${normalizedTargetPath}`)
          }

          const snapshotFileName = `${manifest.entries.length}.txt`
          await ensureDirectory(getCheckpointSnapshotsDirectoryPath(checkpointId))
          await fs.writeFile(
            path.join(getCheckpointSnapshotsDirectoryPath(checkpointId), snapshotFileName),
            await fs.readFile(normalizedTargetPath, 'utf8'),
            'utf8',
          )
          manifest.entries.push({
            existed: true,
            relativePath,
            snapshotFileName,
          })
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error
          }

          manifest.entries.push({
            existed: false,
            relativePath,
          })
        }

        await writeManifest(manifest)
      })
    },

    async restoreCheckpoint(checkpointId: string) {
      await withCheckpointLock(checkpointId, async () => {
        const manifest = await readManifest(checkpointId)
        const restoreEntries = [...manifest.entries].reverse()

        for (const entry of restoreEntries) {
          const absolutePath = path.join(manifest.workspaceRootPath, entry.relativePath)

          if (!entry.existed) {
            await fs.rm(absolutePath, { force: true, recursive: true }).catch((error: unknown) => {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error
              }
            })
            continue
          }

          if (!entry.snapshotFileName) {
            throw new Error(`Checkpoint snapshot is missing for ${entry.relativePath}`)
          }

          const snapshotPath = path.join(getCheckpointSnapshotsDirectoryPath(checkpointId), entry.snapshotFileName)
          const snapshotContent = await fs.readFile(snapshotPath, 'utf8')
          const existingStats = await fs.stat(absolutePath).catch((error: unknown) => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
              return null
            }

            throw error
          })

          if (existingStats?.isDirectory()) {
            await fs.rm(absolutePath, { force: true, recursive: true })
          }

          await ensureDirectory(path.dirname(absolutePath))
          await fs.writeFile(absolutePath, snapshotContent, 'utf8')
        }
      })
    },
  }
}

let defaultWorkspaceCheckpointStorePromise: Promise<WorkspaceCheckpointStore> | null = null

async function getDefaultWorkspaceCheckpointStore() {
  if (!defaultWorkspaceCheckpointStorePromise) {
    defaultWorkspaceCheckpointStorePromise = import('../history/paths').then(({ getHistoryDirectoryPath }) =>
      createWorkspaceCheckpointStore(getHistoryDirectoryPath()),
    )
  }

  return defaultWorkspaceCheckpointStorePromise
}

export async function createWorkspaceCheckpoint(input: CreateWorkspaceCheckpointInput) {
  return (await getDefaultWorkspaceCheckpointStore()).createCheckpoint(input)
}

export async function captureWorkspaceCheckpointFileState(checkpointId: string, absolutePath: string) {
  return (await getDefaultWorkspaceCheckpointStore()).captureFileState(checkpointId, absolutePath)
}

export async function restoreWorkspaceCheckpoint(checkpointId: string) {
  const workspaceCheckpointStore = await getDefaultWorkspaceCheckpointStore()
  return workspaceCheckpointStore.restoreCheckpoint(checkpointId)
}
