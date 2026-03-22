export type OpenAICompatibleTransportMode = 'chat-completions' | 'responses'

let knownOpenAICompatibleTransportMode: OpenAICompatibleTransportMode | null = null

export function getKnownOpenAICompatibleTransportMode() {
  return knownOpenAICompatibleTransportMode
}

export function getPreferredOpenAICompatibleTransportMode(): OpenAICompatibleTransportMode {
  return knownOpenAICompatibleTransportMode ?? 'responses'
}

export function setKnownOpenAICompatibleTransportMode(mode: OpenAICompatibleTransportMode) {
  knownOpenAICompatibleTransportMode = mode
}

export function resetKnownOpenAICompatibleTransportMode() {
  knownOpenAICompatibleTransportMode = null
}
