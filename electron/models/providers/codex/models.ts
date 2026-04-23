import codexModelDefinitions from './models.json'
import type { ProviderModelConfig } from '../../../../src/types/chat'
import type { ProviderModelDefinition } from '../types'
import { normalizeProviderModelDefinitions } from '../shared'

export function listCodexModels(): ProviderModelConfig[] {
  return normalizeProviderModelDefinitions('codex', codexModelDefinitions as readonly ProviderModelDefinition[])
}
