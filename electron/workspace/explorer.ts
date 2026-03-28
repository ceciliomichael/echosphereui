import { promises as fs } from 'node:fs'
import path from 'node:path'
import {
  isGitignored,
  loadGitignoreMatchers,
  shouldAlwaysShowEntry,
  shouldIgnoreWorkspaceEntry,
} from '../chat/openaiCompatible/tools/gitignoreMatcher'
import type {
  WorkspaceExplorerCreateEntryInput,
  WorkspaceExplorerCreateEntryResult,
  WorkspaceExplorerDeleteEntryInput,
  WorkspaceExplorerDeleteEntryResult,
  WorkspaceExplorerEntry,
  WorkspaceExplorerListDirectoryInput,
  WorkspaceExplorerReadFileInput,
  WorkspaceExplorerReadFileResult,
  WorkspaceExplorerRenameEntryInput,
  WorkspaceExplorerRenameEntryResult,
  WorkspaceExplorerTransferEntryInput,
  WorkspaceExplorerTransferEntryResult,
  WorkspaceExplorerWriteFileInput,
  WorkspaceExplorerWriteFileResult,
} from '../../src/types/chat'

const DEFAULT_RELATIVE_PATH = '.'
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

async function statIfExists(targetPath: string) {
  return fs.stat(targetPath).catch((error: unknown) => {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return null
    }
    throw error
  })
}

function isNestedWithinDirectory(parentAbsolutePath: string, targetAbsolutePath: string) {
  const relativePath = path.relative(parentAbsolutePath, targetAbsolutePath)
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath))
}

function withNameSuffix(entryName: string, suffix: string, isDirectory: boolean) {
  if (isDirectory) {
    return `${entryName}${suffix}`
  }

  const parsedPath = path.parse(entryName)
  return `${parsedPath.name}${suffix}${parsedPath.ext}`
}

async function resolveTransferDestinationPath(
  destinationDirectoryAbsolutePath: string,
  destinationDirectoryRelativePath: string,
  sourceEntryName: string,
  isDirectory: boolean,
  mode: 'copy' | 'move',
) {
  for (let attempt = 0; ; attempt += 1) {
    let candidateName = sourceEntryName
    if (attempt > 0) {
      candidateName =
        mode === 'copy'
          ? withNameSuffix(sourceEntryName, attempt === 1 ? ' copy' : ` copy ${attempt}`, isDirectory)
          : withNameSuffix(sourceEntryName, ` ${attempt + 1}`, isDirectory)
    }

    const candidateAbsolutePath = path.join(destinationDirectoryAbsolutePath, candidateName)
    const candidateRelativePath =
      destinationDirectoryRelativePath === DEFAULT_RELATIVE_PATH
        ? candidateName
        : path.join(destinationDirectoryRelativePath, candidateName)

    const existingStats = await statIfExists(candidateAbsolutePath)
    if (!existingStats) {
      return {
        absolutePath: candidateAbsolutePath,
        relativePath: candidateRelativePath,
      }
    }
  }
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
  const gitignoreMatchers = await loadGitignoreMatchers(workspaceRootPath, target.absolutePath)
  const explorerEntries: WorkspaceExplorerEntry[] = []
  for (const directoryEntry of directoryEntries) {
    if (directoryEntry.isSymbolicLink()) {
      continue
    }
    const isDirectory = directoryEntry.isDirectory()
    if (!isDirectory && !directoryEntry.isFile()) {
      continue
    }
    if (shouldIgnoreWorkspaceEntry(directoryEntry.name)) {
      continue
    }
    if (
      !shouldAlwaysShowEntry(directoryEntry.name) &&
      isGitignored(path.join(target.absolutePath, directoryEntry.name), isDirectory, gitignoreMatchers)
    ) {
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

export async function createWorkspaceEntry(
  input: WorkspaceExplorerCreateEntryInput,
): Promise<WorkspaceExplorerCreateEntryResult> {
  const workspaceRootPath = normalizeWorkspacePath(input.workspaceRootPath)
  await assertWorkspaceDirectory(workspaceRootPath)
  const target = getSafeTargetPath(workspaceRootPath, input.relativePath)
  if (target.relativePath === DEFAULT_RELATIVE_PATH) {
    throw new Error('Cannot create workspace root.')
  }

  const existingStats = await fs.stat(target.absolutePath).catch((error: unknown) => {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return null
    }
    throw error
  })
  if (existingStats) {
    throw new Error(`Entry already exists: ${target.relativePath}`)
  }

  await fs.mkdir(path.dirname(target.absolutePath), { recursive: true })
  if (input.isDirectory) {
    await fs.mkdir(target.absolutePath)
  } else {
    await fs.writeFile(target.absolutePath, '', { encoding: 'utf8', flag: 'wx' })
  }

  return {
    isDirectory: input.isDirectory,
    relativePath: target.relativePath,
  }
}

export async function renameWorkspaceEntry(
  input: WorkspaceExplorerRenameEntryInput,
): Promise<WorkspaceExplorerRenameEntryResult> {
  const workspaceRootPath = normalizeWorkspacePath(input.workspaceRootPath)
  await assertWorkspaceDirectory(workspaceRootPath)
  const sourceTarget = getSafeTargetPath(workspaceRootPath, input.relativePath)
  const destinationTarget = getSafeTargetPath(workspaceRootPath, input.nextRelativePath)
  if (sourceTarget.relativePath === DEFAULT_RELATIVE_PATH || destinationTarget.relativePath === DEFAULT_RELATIVE_PATH) {
    throw new Error('Cannot rename workspace root.')
  }
  if (sourceTarget.relativePath === destinationTarget.relativePath) {
    return {
      nextRelativePath: destinationTarget.relativePath,
      relativePath: sourceTarget.relativePath,
    }
  }

  const sourceStats = await fs.stat(sourceTarget.absolutePath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Entry does not exist: ${sourceTarget.relativePath}`)
    }
    throw error
  })
  if (!sourceStats.isDirectory() && !sourceStats.isFile()) {
    throw new Error(`Unsupported entry type: ${sourceTarget.relativePath}`)
  }

  const destinationStats = await fs.stat(destinationTarget.absolutePath).catch((error: unknown) => {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return null
    }
    throw error
  })
  if (destinationStats) {
    throw new Error(`Entry already exists: ${destinationTarget.relativePath}`)
  }

  await fs.mkdir(path.dirname(destinationTarget.absolutePath), { recursive: true })
  await fs.rename(sourceTarget.absolutePath, destinationTarget.absolutePath)

  return {
    nextRelativePath: destinationTarget.relativePath,
    relativePath: sourceTarget.relativePath,
  }
}

export async function deleteWorkspaceEntry(
  input: WorkspaceExplorerDeleteEntryInput,
): Promise<WorkspaceExplorerDeleteEntryResult> {
  const workspaceRootPath = normalizeWorkspacePath(input.workspaceRootPath)
  await assertWorkspaceDirectory(workspaceRootPath)
  const target = getSafeTargetPath(workspaceRootPath, input.relativePath)
  if (target.relativePath === DEFAULT_RELATIVE_PATH) {
    throw new Error('Cannot delete workspace root.')
  }

  const targetStats = await fs.stat(target.absolutePath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Entry does not exist: ${target.relativePath}`)
    }
    throw error
  })
  if (!targetStats.isDirectory() && !targetStats.isFile()) {
    throw new Error(`Unsupported entry type: ${target.relativePath}`)
  }

  await fs.rm(target.absolutePath, { force: false, recursive: true })
  return {
    relativePath: target.relativePath,
  }
}

export async function transferWorkspaceEntry(
  input: WorkspaceExplorerTransferEntryInput,
): Promise<WorkspaceExplorerTransferEntryResult> {
  const workspaceRootPath = normalizeWorkspacePath(input.workspaceRootPath)
  await assertWorkspaceDirectory(workspaceRootPath)
  const sourceTarget = getSafeTargetPath(workspaceRootPath, input.relativePath)
  const destinationDirectoryTarget = getSafeTargetPath(workspaceRootPath, input.targetDirectoryRelativePath)

  if (sourceTarget.relativePath === DEFAULT_RELATIVE_PATH) {
    throw new Error('Cannot transfer workspace root.')
  }

  const sourceStats = await fs.stat(sourceTarget.absolutePath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Entry does not exist: ${sourceTarget.relativePath}`)
    }
    throw error
  })
  if (!sourceStats.isDirectory() && !sourceStats.isFile()) {
    throw new Error(`Unsupported entry type: ${sourceTarget.relativePath}`)
  }

  const destinationDirectoryStats = await fs.stat(destinationDirectoryTarget.absolutePath).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Directory does not exist: ${destinationDirectoryTarget.relativePath}`)
    }
    throw error
  })
  if (!destinationDirectoryStats.isDirectory()) {
    throw new Error(`Expected a directory: ${destinationDirectoryTarget.relativePath}`)
  }

  if (
    sourceStats.isDirectory() &&
    isNestedWithinDirectory(sourceTarget.absolutePath, destinationDirectoryTarget.absolutePath)
  ) {
    throw new Error('Cannot place a folder inside itself.')
  }

  const sourceParentRelativePath = getSafeTargetPath(workspaceRootPath, path.dirname(sourceTarget.relativePath)).relativePath
  const sourceEntryName = path.basename(sourceTarget.relativePath)
  if (
    input.mode === 'move' &&
    destinationDirectoryTarget.relativePath === sourceParentRelativePath
  ) {
    return {
      mode: input.mode,
      relativePath: sourceTarget.relativePath,
      targetRelativePath: sourceTarget.relativePath,
    }
  }

  const destinationTarget = await resolveTransferDestinationPath(
    destinationDirectoryTarget.absolutePath,
    destinationDirectoryTarget.relativePath,
    sourceEntryName,
    sourceStats.isDirectory(),
    input.mode,
  )

  if (input.mode === 'copy') {
    if (sourceStats.isDirectory()) {
      await fs.cp(sourceTarget.absolutePath, destinationTarget.absolutePath, {
        errorOnExist: true,
        force: false,
        recursive: true,
      })
    } else {
      await fs.copyFile(sourceTarget.absolutePath, destinationTarget.absolutePath)
    }
  } else {
    await fs.rename(sourceTarget.absolutePath, destinationTarget.absolutePath)
  }

  return {
    mode: input.mode,
    relativePath: sourceTarget.relativePath,
    targetRelativePath: destinationTarget.relativePath,
  }
}
