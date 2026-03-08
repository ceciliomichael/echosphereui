import type {
  ConversationFolderSummary,
  ConversationGroupPreview,
  ConversationPreview,
  ConversationRecord,
  ConversationSummary,
} from '../types/chat'

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
const shortDateFormatter = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' })

export const UNFILED_FOLDER_NAME = 'Unfiled'

export function getSelectedFolderName(
  folderSummaries: ConversationFolderSummary[],
  selectedFolderId: string | null,
) {
  if (selectedFolderId === null) {
    return UNFILED_FOLDER_NAME
  }

  return folderSummaries.find((folder) => folder.id === selectedFolderId)?.name ?? UNFILED_FOLDER_NAME
}

function formatUpdatedAtLabel(timestamp: number) {
  const differenceMs = timestamp - Date.now()
  const differenceMinutes = Math.round(differenceMs / 60000)

  if (Math.abs(differenceMinutes) < 1) {
    return 'Now'
  }

  if (Math.abs(differenceMinutes) < 60) {
    return relativeTimeFormatter.format(differenceMinutes, 'minute')
  }

  const differenceHours = Math.round(differenceMinutes / 60)
  if (Math.abs(differenceHours) < 24) {
    return relativeTimeFormatter.format(differenceHours, 'hour')
  }

  const differenceDays = Math.round(differenceHours / 24)
  if (Math.abs(differenceDays) < 7) {
    return relativeTimeFormatter.format(differenceDays, 'day')
  }

  return shortDateFormatter.format(timestamp)
}

export function getConversationTitle(seed: string) {
  const normalized = seed.trim().replace(/\s+/g, ' ')
  const conciseTitle = normalized.split(' ').slice(0, 7).join(' ')
  return conciseTitle.length > 48 ? `${conciseTitle.slice(0, 45)}...` : conciseTitle
}

function mapConversationPreview(summary: ConversationSummary, activeConversationId: string | null): ConversationPreview {
  return {
    id: summary.id,
    title: summary.title,
    preview: summary.preview,
    updatedAtLabel: formatUpdatedAtLabel(summary.updatedAt),
    folderId: summary.folderId,
    isActive: summary.id === activeConversationId,
  }
}

export function buildConversationGroups(
  folderSummaries: ConversationFolderSummary[],
  conversationSummaries: ConversationSummary[],
  activeConversationId: string | null,
  selectedFolderId: string | null,
): ConversationGroupPreview[] {
  const groupedConversations = new Map<string | null, ConversationPreview[]>()
  groupedConversations.set(null, [])

  for (const folder of folderSummaries) {
    groupedConversations.set(folder.id, [])
  }

  for (const conversation of conversationSummaries) {
    const preview = mapConversationPreview(conversation, activeConversationId)
    const targetFolderId =
      conversation.folderId !== null && groupedConversations.has(conversation.folderId) ? conversation.folderId : null

    groupedConversations.get(targetFolderId)?.push(preview)
  }

  return [
    {
      folder: {
        id: null,
        name: UNFILED_FOLDER_NAME,
        path: null,
        conversationCount: groupedConversations.get(null)?.length ?? 0,
        isSelected: selectedFolderId === null,
      },
      conversations: groupedConversations.get(null) ?? [],
    },
    ...folderSummaries.map((folder) => ({
      folder: {
        id: folder.id,
        name: folder.name,
        path: folder.path,
        conversationCount: groupedConversations.get(folder.id)?.length ?? 0,
        isSelected: selectedFolderId === folder.id,
      },
      conversations: groupedConversations.get(folder.id) ?? [],
    })),
  ]
}

export function buildConversationSummary(conversation: ConversationRecord): ConversationSummary {
  const latestMessage = conversation.messages.at(-1)

  return {
    id: conversation.id,
    title: conversation.title,
    preview: latestMessage?.content ?? 'No messages yet',
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messages.length,
    folderId: conversation.folderId,
  }
}

export function upsertConversationSummary(
  conversationSummaries: ConversationSummary[],
  conversation: ConversationRecord,
) {
  const nextSummary = buildConversationSummary(conversation)

  return [nextSummary, ...conversationSummaries.filter((summary) => summary.id !== conversation.id)].sort(
    (left, right) => right.updatedAt - left.updatedAt,
  )
}

export function removeConversationSummary(
  conversationSummaries: ConversationSummary[],
  conversationId: string,
) {
  return conversationSummaries.filter((summary) => summary.id !== conversationId)
}

export function insertFolderSummary(
  folderSummaries: ConversationFolderSummary[],
  nextFolder: ConversationFolderSummary,
) {
  return [...folderSummaries, nextFolder].sort((left, right) => left.createdAt - right.createdAt)
}
