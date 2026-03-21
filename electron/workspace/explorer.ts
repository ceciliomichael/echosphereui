import { promises as fs } from 'node:fs'
import path from 'node:path'
import type {
  WorkspaceExplorerEntry,
  WorkspaceExplorerListDirectoryInput,
  WorkspaceExplorerReadFileInput,
  WorkspaceExplorerReadFileResult,
  WorkspaceExplorerWriteFileInput,
  WorkspaceExplorerWriteFileResult,
} from '../../src/types/chat'

const DEFAULT_RELATIVE_PATH = '.'
const IGNORED_DIRECTORY_NAMES = new Set(['.git', 'node_modules', '.next'])
const IGNORED_FILE_NAMES = new Set(['.DS_Store', 'Thumbs.db'])
const MAX_TEXT_FILE_BYTES = 256 * 1024

function normalizeWorkspacePath(workspaceRootPath: string) {
  return path.resolve(workspaceRootPath.trim())
}

function normalizeRelativePath(relativePath: string | undefined) {
  const normalized = (relativePath ?? DEFAULT_RELATIVE_PATH).trim()
  return normalized.length === 0 ? DEFAULT_RELATIVE_PATH : normalized
}

function getSafeTargetPath(workspaceRootPath: string, relativePath: string | undefined) {
  const normalizedRelativePath = normalizeRelativePath(relativePath)
  const absolutePath = path.resolve(workspaceRootPath, normalizedRelativePath)
  const workspaceRelativePath = path.relative(workspaceRootPath, absolutePath)
  if (workspaceRelativePath.startsWith('..') || path.isAbsolute(workspaceRelativePath)) {
    throw new Error(`Path is outside the workspace root: ${relativePath ?? DEFAULT_RELATIVE_PATH}`)
  }
  return {
    absolutePath,
    relativePath: workspaceRelativePath === '' ? DEFAULT_RELATIVE_PATH : workspaceRelativePath,
  }
}

async function assertWorkspaceDirectory(workspaceRootPath: string) {
  const stats = await fs.stat(workspaceRootPath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Workspace path does not exist: ${workspaceRootPath}`)
    }
    throw error
  })
  if (!stats.isDirectory()) {
    throw new Error(`Workspace root must be a directory: ${workspaceRootPath}`)
  }
}

function shouldIncludeEntry(entryName: string, isDirectory: boolean) {
  if (isDirectory) {
    return !IGNORED_DIRECTORY_NAMES.has(entryName)
  }
  return !IGNORED_FILE_NAMES.has(entryName)
}

function sortWorkspaceEntries(entries: WorkspaceExplorerEntry[]) {
  return entries.sort((left, right) => {
    if (left.isDirectory && !right.isDirectory) {
      return -1
    }
    if (!left.isDirectory && right.isDirectory) {
      return 1
    }
    return left.name.localeCompare(right.name)
  })
}

function hasBinaryContent(buffer: Buffer) {
  const probeLength = Math.min(buffer.length, 1024)
  for (let index = 0; index < probeLength; index += 1) {
    if (buffer[index] === 0) {
      return true
    }
  }
  return false
}

export async function listWorkspaceDirectory(input: WorkspaceExplorerListDirectoryInput) {
  const workspaceRootPath = normalizeWorkspacePath(input.workspaceRootPath)
  await assertWorkspaceDirectory(workspaceRootPath)
  const target = getSafeTargetPath(workspaceRootPath, input.relativePath)
  const targetStats = await fs.stat(target.absolutePath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Directory does not exist: ${target.relativePath}`)
    }
    throw error
  })
  if (!targetStats.isDirectory()) {
    throw new Error(`Expected a directory: ${target.relativePath}`)
  }

  const directoryEntries = await fs.readdir(target.absolutePath, { withFileTypes: true })
  const explorerEntries: WorkspaceExplorerEntry[] = []
  for (const directoryEntry of directoryEntries) {
    if (directoryEntry.isSymbolicLink()) {
      continue
    }
    const isDirectory = directoryEntry.isDirectory()
    if (!isDirectory && !directoryEntry.isFile()) {
      continue
    }
    if (!shouldIncludeEntry(directoryEntry.name, isDirectory)) {
      continue
    }
    const entryRelativePath =
      target.relativePath === DEFAULT_RELATIVE_PATH
        ? directoryEntry.name
        : path.join(target.relativePath, directoryEntry.name)

    explorerEntries.push({
      isDirectory,
      name: directoryEntry.name,
      relativePath: entryRelativePath,
    })
  }

  return sortWorkspaceEntries(explorerEntries)
}

export async function readWorkspaceFile(input: WorkspaceExplorerReadFileInput): Promise<WorkspaceExplorerReadFileResult> {
  const workspaceRootPath = normalizeWorkspacePath(input.workspaceRootPath)
  await assertWorkspaceDirectory(workspaceRootPath)
  const target = getSafeTargetPath(workspaceRootPath, input.relativePath)
  const targetStats = await fs.stat(target.absolutePath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`File does not exist: ${target.relativePath}`)
    }
    throw error
  })
  if (!targetStats.isFile()) {
    throw new Error(`Expected a file: ${target.relativePath}`)
  }

  const binaryProbe = Buffer.alloc(Math.min(targetStats.size, 1024))
  if (binaryProbe.length > 0) {
    const fileHandle = await fs.open(target.absolutePath, 'r')
    try {
      await fileHandle.read(binaryProbe, 0, binaryProbe.length, 0)
    } finally {
      await fileHandle.close()
    }
  }
  if (hasBinaryContent(binaryProbe)) {
    return {
      content: '',
      isBinary: true,
      isTruncated: false,
      relativePath: target.relativePath,
      sizeBytes: targetStats.size,
    }
  }

  const isTruncated = targetStats.size > MAX_TEXT_FILE_BYTES
  const bytesToRead = isTruncated ? MAX_TEXT_FILE_BYTES : targetStats.size
  const fileBuffer = Buffer.alloc(bytesToRead)
  if (bytesToRead > 0) {
    const fileHandle = await fs.open(target.absolutePath, 'r')
    try {
      await fileHandle.read(fileBuffer, 0, bytesToRead, 0)
    } finally {
      await fileHandle.close()
    }
  }
  const content = fileBuffer.toString('utf8')

  return {
    content,
    isBinary: false,
    isTruncated,
    relativePath: target.relativePath,
    sizeBytes: targetStats.size,
  }
}

export async function writeWorkspaceFile(input: WorkspaceExplorerWriteFileInput): Promise<WorkspaceExplorerWriteFileResult> {
  const workspaceRootPath = normalizeWorkspacePath(input.workspaceRootPath)
  await assertWorkspaceDirectory(workspaceRootPath)
  const target = getSafeTargetPath(workspaceRootPath, input.relativePath)
  await fs.mkdir(path.dirname(target.absolutePath), { recursive: true })
  await fs.writeFile(target.absolutePath, input.content, 'utf8')
  const writtenStats = await fs.stat(target.absolutePath)

  return {
    relativePath: target.relativePath,
    sizeBytes: writtenStats.size,
  }
}
