export type MessageRole = 'user' | 'assistant'

export interface Message {
  id: string
  role: MessageRole
  content: string
  timestamp: number
}

export interface ConversationSummary {
  id: string
  title: string
  preview: string
  updatedAt: number
  messageCount: number
  folderId: string | null
}

export interface ConversationPreview {
  id: string
  title: string
  preview: string
  updatedAtLabel: string
  folderId: string | null
  isActive?: boolean
}

export interface ConversationRecord {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  folderId: string | null
  messages: Message[]
}

export interface ConversationFolderRecord {
  id: string
  name: string
  path: string
  createdAt: number
  updatedAt: number
}

export interface ConversationFolderSummary {
  id: string
  name: string
  path: string
  createdAt: number
  updatedAt: number
}

export interface ConversationFolderPreview {
  id: string | null
  name: string
  path: string | null
  conversationCount: number
  isSelected?: boolean
}

export interface ConversationGroupPreview {
  folder: ConversationFolderPreview
  conversations: ConversationPreview[]
}

export interface CreateConversationInput {
  folderId?: string | null
}

export interface CreateConversationFolderInput {
  name: string
  path: string
}

export interface AppendConversationMessagesInput {
  conversationId: string
  messages: Message[]
  title?: string
}

export interface ReplaceConversationMessagesInput {
  conversationId: string
  messages: Message[]
  title?: string
}

export interface AppSettings {
  sidebarWidth: number
}

export interface EchosphereHistoryApi {
  listConversations: () => Promise<ConversationSummary[]>
  listFolders: () => Promise<ConversationFolderSummary[]>
  getConversation: (conversationId: string) => Promise<ConversationRecord | null>
  createConversation: (input?: CreateConversationInput) => Promise<ConversationRecord>
  createFolder: (input: CreateConversationFolderInput) => Promise<ConversationFolderRecord>
  pickFolder: () => Promise<ConversationFolderRecord | null>
  openFolderPath: (folderPath: string) => Promise<void>
  appendMessages: (input: AppendConversationMessagesInput) => Promise<ConversationRecord>
  replaceMessages: (input: ReplaceConversationMessagesInput) => Promise<ConversationRecord>
  deleteConversation: (conversationId: string) => Promise<void>
}

export interface EchosphereSettingsApi {
  getSettings: () => Promise<AppSettings>
  updateSettings: (input: Partial<AppSettings>) => Promise<AppSettings>
}
