import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { AppSettings } from '../../src/types/chat'
import { DEFAULT_APP_SETTINGS } from '../../src/lib/defaultAppSettings'
import { isAppAppearance, isAppLanguage } from '../../src/lib/appSettings'
import { isReasoningEffort } from '../../src/lib/reasoningEffort'

const CONFIG_ROOT_SEGMENTS = ['.echosphere', 'config'] as const
const SETTINGS_FILE_NAME = 'settings.json'
let settingsUpdateQueue: Promise<void> = Promise.resolve()

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
      ? Math.max(DEFAULT_APP_SETTINGS.sidebarWidth, input.sidebarWidth)
      : DEFAULT_APP_SETTINGS.sidebarWidth
  const appearance = isAppAppearance(input?.appearance) ? input.appearance : DEFAULT_APP_SETTINGS.appearance
  const chatModelId = typeof input?.chatModelId === 'string' ? input.chatModelId.trim() : DEFAULT_APP_SETTINGS.chatModelId
  const chatReasoningEffort = isReasoningEffort(input?.chatReasoningEffort)
    ? input.chatReasoningEffort
    : DEFAULT_APP_SETTINGS.chatReasoningEffort
  const language = isAppLanguage(input?.language) ? input.language : DEFAULT_APP_SETTINGS.language
  const sendMessageOnEnter =
    typeof input?.sendMessageOnEnter === 'boolean'
      ? input.sendMessageOnEnter
      : DEFAULT_APP_SETTINGS.sendMessageOnEnter

  return {
    appearance,
    chatModelId,
    chatReasoningEffort,
    language,
    sendMessageOnEnter,
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
      await writeSettingsFile(DEFAULT_APP_SETTINGS)
      return DEFAULT_APP_SETTINGS
    }

    console.error('Failed to load app settings', error)
    throw error
  }
}

export async function updateStoredSettings(input: Partial<AppSettings>) {
  let nextSettings = DEFAULT_APP_SETTINGS

  settingsUpdateQueue = settingsUpdateQueue
    .catch(() => undefined)
    .then(async () => {
      const currentSettings = await getStoredSettings().catch(() => DEFAULT_APP_SETTINGS)
      nextSettings = sanitizeSettings({
        ...currentSettings,
        ...input,
      })

      await writeSettingsFile(nextSettings)
    })

  await settingsUpdateQueue
  return nextSettings
}
