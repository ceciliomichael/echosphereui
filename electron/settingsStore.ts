import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { AppSettings } from '../src/types/chat'
import { DEFAULT_SIDEBAR_WIDTH } from '../src/lib/sidebarSizing'

const CONFIG_ROOT_SEGMENTS = ['.echosphere', 'config'] as const
const SETTINGS_FILE_NAME = 'settings.json'
const DEFAULT_SETTINGS: AppSettings = {
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
}

function getConfigDirectoryPath() {
  return path.join(app.getPath('home'), ...CONFIG_ROOT_SEGMENTS)
}

function getSettingsFilePath() {
  return path.join(getConfigDirectoryPath(), SETTINGS_FILE_NAME)
}

async function ensureConfigDirectory() {
  await fs.mkdir(getConfigDirectoryPath(), { recursive: true })
}

async function writeSettingsFile(settings: AppSettings) {
  await ensureConfigDirectory()
  await fs.writeFile(getSettingsFilePath(), JSON.stringify(settings, null, 2), 'utf8')
}

function sanitizeSettings(input: Partial<AppSettings> | null | undefined): AppSettings {
  const sidebarWidth =
    typeof input?.sidebarWidth === 'number' && Number.isFinite(input.sidebarWidth)
      ? Math.max(DEFAULT_SETTINGS.sidebarWidth, input.sidebarWidth)
      : DEFAULT_SETTINGS.sidebarWidth

  return {
    sidebarWidth,
  }
}

export async function getStoredSettings() {
  try {
    await ensureConfigDirectory()
    const raw = await fs.readFile(getSettingsFilePath(), 'utf8')
    return sanitizeSettings(JSON.parse(raw) as Partial<AppSettings>)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      await writeSettingsFile(DEFAULT_SETTINGS)
      return DEFAULT_SETTINGS
    }

    console.error('Failed to load app settings', error)
    throw error
  }
}

export async function updateStoredSettings(input: Partial<AppSettings>) {
  const currentSettings = await getStoredSettings().catch(() => DEFAULT_SETTINGS)
  const nextSettings = sanitizeSettings({
    ...currentSettings,
    ...input,
  })

  await writeSettingsFile(nextSettings)
  return nextSettings
}
