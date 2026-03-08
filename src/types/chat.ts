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
}

export interface ConversationPreview {
  id: string
  title: string
  preview: string
  updatedAtLabel: string
  isActive?: boolean
}

export interface ConversationRecord {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: Message[]
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
  getConversation: (conversationId: string) => Promise<ConversationRecord | null>
  createConversation: () => Promise<ConversationRecord>
  appendMessages: (input: AppendConversationMessagesInput) => Promise<ConversationRecord>
  replaceMessages: (input: ReplaceConversationMessagesInput) => Promise<ConversationRecord>
  deleteConversation: (conversationId: string) => Promise<void>
}

export interface EchosphereSettingsApi {
  getSettings: () => Promise<AppSettings>
  updateSettings: (input: Partial<AppSettings>) => Promise<AppSettings>
}
