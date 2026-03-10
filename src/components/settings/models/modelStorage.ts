import { MODEL_CATALOG } from './modelCatalog'
import type { ModelToggleState } from './modelTypes'

const MODEL_TOGGLES_STORAGE_KEY = 'echosphere:model-toggles'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

function buildDefaultModelToggleState(): ModelToggleState {
  return MODEL_CATALOG.reduce<ModelToggleState>((result, model) => {
    result[model.id] = model.enabledByDefault
    return result
  }, {})
}

export function sanitizeModelToggleState(input: unknown): ModelToggleState {
  const defaults = buildDefaultModelToggleState()

  if (!isRecord(input)) {
    return defaults
  }

  for (const model of MODEL_CATALOG) {
    const rawValue = input[model.id]
    if (isBoolean(rawValue)) {
      defaults[model.id] = rawValue
    }
  }

  return defaults
}

export function readStoredModelToggleState(): ModelToggleState {
  if (typeof window === 'undefined') {
    return buildDefaultModelToggleState()
  }

  try {
    const raw = window.localStorage.getItem(MODEL_TOGGLES_STORAGE_KEY)
    if (!raw) {
      return buildDefaultModelToggleState()
    }

    return sanitizeModelToggleState(JSON.parse(raw) as unknown)
  } catch {
    return buildDefaultModelToggleState()
  }
}

export function writeStoredModelToggleState(state: ModelToggleState) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.localStorage.setItem(MODEL_TOGGLES_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore local storage write failures.
  }
}
