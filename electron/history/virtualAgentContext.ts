const VIRTUAL_AGENT_CONTEXT_DIRECTORY_PREFIX = 'VIRT'
const VIRTUAL_AGENT_CONTEXT_DIRECTORY_ID_LENGTH = 12

export function getVirtualAgentContextDirectoryName(conversationId: string) {
  const normalizedConversationId = conversationId.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  if (normalizedConversationId.length === 0) {
    return `${VIRTUAL_AGENT_CONTEXT_DIRECTORY_PREFIX}_thread`
  }

  return `${VIRTUAL_AGENT_CONTEXT_DIRECTORY_PREFIX}_${normalizedConversationId.slice(
    0,
    VIRTUAL_AGENT_CONTEXT_DIRECTORY_ID_LENGTH,
  )}`
}
