import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

const CONFIG_ROOT_SEGMENTS = ['.echosphere', 'mcp'] as const
const STATE_FILENAME = 'state.json'

interface StoredServerState {
  autoConnect: boolean
}

interface StoredStateFile {
  servers: Record<string, StoredServerState>
}

const DEFAULT_STATE_FILE: StoredStateFile = {
  servers: {},
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getRootPath() {
  return path.join(app.getPath('home'), ...CONFIG_ROOT_SEGMENTS)
}

function getGlobalStatePath() {
  return path.join(getRootPath(), STATE_FILENAME)
}

function getProjectStatePath(workspacePath: string) {
  return path.join(path.resolve(workspacePath), ...CONFIG_ROOT_SEGMENTS, STATE_FILENAME)
}

function normalizeWorkspacePath(workspacePath?: string | null) {
  const trimmed = workspacePath?.trim() ?? ''
  return trimmed.length > 0 ? path.resolve(trimmed) : null
}

async function ensureDirectory(targetPath: string) {
  await fs.mkdir(path.dirname(targetPath), { recursive: true })
}

async function writeStateFile(targetPath: string, state: StoredStateFile) {
  await ensureDirectory(targetPath)
  await fs.writeFile(targetPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
}

function sanitizeStateFile(input: unknown): StoredStateFile {
  if (!isPlainObject(input) || !isPlainObject(input.servers)) {
    return { ...DEFAULT_STATE_FILE }
  }

  const sanitized: StoredStateFile = { servers: {} }
  for (const [serverName, candidateState] of Object.entries(input.servers)) {
    if (!isPlainObject(candidateState) || typeof candidateState.autoConnect !== 'boolean') {
      continue
    }

    const normalizedName = serverName.trim()
    if (normalizedName.length === 0) {
      continue
    }

    sanitized.servers[normalizedName] = {
      autoConnect: candidateState.autoConnect,
    }
  }

  return sanitized
}

async function readStateFile(targetPath: string) {
  try {
    const raw = await fs.readFile(targetPath, 'utf8')
    return sanitizeStateFile(JSON.parse(raw) as unknown)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...DEFAULT_STATE_FILE }
    }

    throw error
  }
}

async function ensureStateFileExists(targetPath: string) {
  try {
    await fs.access(targetPath)
  } catch {
    await writeStateFile(targetPath, { ...DEFAULT_STATE_FILE })
  }
}

export class McpStateStore {
  private globalStatePath = getGlobalStatePath()

  async ensureStateExists(workspacePath?: string | null) {
    await ensureStateFileExists(this.globalStatePath)
    const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath)
    if (normalizedWorkspacePath) {
      await ensureStateFileExists(getProjectStatePath(normalizedWorkspacePath))
    }
  }

  async readAutoConnectMap(workspacePath?: string | null) {
    const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath)
    const globalState = await readStateFile(this.globalStatePath)
    const projectState = normalizedWorkspacePath ? await readStateFile(getProjectStatePath(normalizedWorkspacePath)) : null

    return {
      ...globalState.servers,
      ...(projectState?.servers ?? {}),
    }
  }

  async getAutoConnect(serverName: string, workspacePath?: string | null) {
    const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath)
    if (normalizedWorkspacePath) {
      const projectState = await readStateFile(getProjectStatePath(normalizedWorkspacePath))
      if (projectState.servers[serverName]) {
        return projectState.servers[serverName].autoConnect
      }
    }

    const globalState = await readStateFile(this.globalStatePath)
    return globalState.servers[serverName]?.autoConnect
  }

  async setAutoConnect(serverName: string, autoConnect: boolean, workspacePath?: string | null) {
    const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath)
    if (normalizedWorkspacePath) {
      const projectStatePath = getProjectStatePath(normalizedWorkspacePath)
      const projectState = await readStateFile(projectStatePath)
      projectState.servers[serverName] = { autoConnect }
      await writeStateFile(projectStatePath, projectState)
      return
    }

    const globalState = await readStateFile(this.globalStatePath)
    globalState.servers[serverName] = { autoConnect }
    await writeStateFile(this.globalStatePath, globalState)
  }

  async removeServer(serverName: string, workspacePath?: string | null) {
    const normalizedWorkspacePath = normalizeWorkspacePath(workspacePath)
    if (normalizedWorkspacePath) {
      const projectStatePath = getProjectStatePath(normalizedWorkspacePath)
      const projectState = await readStateFile(projectStatePath)
      if (projectState.servers[serverName]) {
        delete projectState.servers[serverName]
        await writeStateFile(projectStatePath, projectState)
      }
    }

    const globalState = await readStateFile(this.globalStatePath)
    if (globalState.servers[serverName]) {
      delete globalState.servers[serverName]
      await writeStateFile(this.globalStatePath, globalState)
    }
  }
}

let stateStoreInstance: McpStateStore | null = null

export function getMcpStateStore() {
  if (!stateStoreInstance) {
    stateStoreInstance = new McpStateStore()
  }

  return stateStoreInstance
}

