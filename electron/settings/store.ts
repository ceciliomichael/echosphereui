import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { AppSettings } from '../../src/types/chat'
import { DEFAULT_APP_SETTINGS } from '../../src/lib/defaultAppSettings'
import { isAppAppearance, isAppLanguage } from '../../src/lib/appSettings'
import { clampStoredDiffPanelWidth } from '../../src/lib/diffPanelSizing'
import { isReasoningEffort } from '../../src/lib/reasoningEffort'
import type { SourceControlSectionId } from '../../src/types/chat'

const CONFIG_ROOT_SEGMENTS = ['.echosphere', 'config'] as const
const SETTINGS_FILE_NAME = 'settings.json'
let settingsUpdateQueue: Promise<void> = Promise.resolve()
const SOURCE_CONTROL_SECTION_IDS: readonly SourceControlSectionId[] = ['commit', 'changes', 'history']

function isSourceControlSectionId(value: string): value is SourceControlSectionId {
  return SOURCE_CONTROL_SECTION_IDS.includes(value as SourceControlSectionId)
}

function sanitizeSourceControlSectionOrder(value: unknown): SourceControlSectionId[] {
  if (!Array.isArray(value)) {
    return DEFAULT_APP_SETTINGS.sourceControlSectionOrder
  }

  const filtered = value
    .map((item) => (typeof item === 'string' ? item : ''))
    .filter((item): item is SourceControlSectionId => isSourceControlSectionId(item))

  const unique = Array.from(new Set(filtered))
  for (const sectionId of SOURCE_CONTROL_SECTION_IDS) {
    if (!unique.includes(sectionId)) {
      unique.push(sectionId)
    }
  }

  return unique
}

function sanitizeSourceControlSectionSizes(value: unknown): Record<SourceControlSectionId, number> {
  const candidate = value as Partial<Record<SourceControlSectionId, number>> | null | undefined
  return {
    changes:
      typeof candidate?.changes === 'number' && Number.isFinite(candidate.changes) && candidate.changes > 0
        ? candidate.changes
        : DEFAULT_APP_SETTINGS.sourceControlSectionSizes.changes,
    commit:
      typeof candidate?.commit === 'number' && Number.isFinite(candidate.commit) && candidate.commit > 0
        ? candidate.commit
        : DEFAULT_APP_SETTINGS.sourceControlSectionSizes.commit,
    history:
      typeof candidate?.history === 'number' && Number.isFinite(candidate.history) && candidate.history > 0
        ? candidate.history
        : DEFAULT_APP_SETTINGS.sourceControlSectionSizes.history,
  }
}

function sanitizeSourceControlSectionOpen(value: unknown) {
  const candidate = value as Partial<Record<'commit' | 'changes' | 'history' | 'staged' | 'unstaged', boolean>> | null | undefined
  return {
    changes:
      typeof candidate?.changes === 'boolean'
        ? candidate.changes
        : DEFAULT_APP_SETTINGS.sourceControlSectionOpen.changes,
    commit:
      typeof candidate?.commit === 'boolean'
        ? candidate.commit
        : DEFAULT_APP_SETTINGS.sourceControlSectionOpen.commit,
    history:
      typeof candidate?.history === 'boolean'
        ? candidate.history
        : DEFAULT_APP_SETTINGS.sourceControlSectionOpen.history,
    staged:
      typeof candidate?.staged === 'boolean'
        ? candidate.staged
        : DEFAULT_APP_SETTINGS.sourceControlSectionOpen.staged,
    unstaged:
      typeof candidate?.unstaged === 'boolean'
        ? candidate.unstaged
        : DEFAULT_APP_SETTINGS.sourceControlSectionOpen.unstaged,
  }
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
      ? Math.max(DEFAULT_APP_SETTINGS.sidebarWidth, input.sidebarWidth)
      : DEFAULT_APP_SETTINGS.sidebarWidth
  const appearance = isAppAppearance(input?.appearance) ? input.appearance : DEFAULT_APP_SETTINGS.appearance
  const chatModelId = typeof input?.chatModelId === 'string' ? input.chatModelId.trim() : DEFAULT_APP_SETTINGS.chatModelId
  const chatReasoningEffort = isReasoningEffort(input?.chatReasoningEffort)
    ? input.chatReasoningEffort
    : DEFAULT_APP_SETTINGS.chatReasoningEffort
  const diffPanelWidth =
    typeof input?.diffPanelWidth === 'number' && Number.isFinite(input.diffPanelWidth)
      ? clampStoredDiffPanelWidth(input.diffPanelWidth)
      : DEFAULT_APP_SETTINGS.diffPanelWidth
  const language = isAppLanguage(input?.language) ? input.language : DEFAULT_APP_SETTINGS.language
  const lastActiveConversationId =
    typeof input?.lastActiveConversationId === 'string' && input.lastActiveConversationId.trim().length > 0
      ? input.lastActiveConversationId.trim()
      : DEFAULT_APP_SETTINGS.lastActiveConversationId
  const sendMessageOnEnter =
    typeof input?.sendMessageOnEnter === 'boolean'
      ? input.sendMessageOnEnter
      : DEFAULT_APP_SETTINGS.sendMessageOnEnter
  const sourceControlSectionOrder = sanitizeSourceControlSectionOrder(input?.sourceControlSectionOrder)
  const sourceControlSectionOpen = sanitizeSourceControlSectionOpen(input?.sourceControlSectionOpen)
  const sourceControlSectionSizes = sanitizeSourceControlSectionSizes(input?.sourceControlSectionSizes)

  return {
    appearance,
    chatModelId,
    chatReasoningEffort,
    diffPanelWidth,
    language,
    lastActiveConversationId,
    sendMessageOnEnter,
    sidebarWidth,
    sourceControlSectionOrder,
    sourceControlSectionOpen,
    sourceControlSectionSizes,
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

export async function flushStoredSettingsUpdates() {
  await settingsUpdateQueue.catch(() => undefined)
}
