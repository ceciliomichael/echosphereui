import type { AppAppearance, AppLanguage } from '../lib/appSettings'

export type MessageRole = 'user' | 'assistant'
export type ChatMode = 'agent'
export type UserMessageKind = 'human' | 'tool_result'
export type ToolInvocationState = 'running' | 'completed' | 'failed'

export interface ToolInvocationTrace {
  argumentsText: string
  completedAt?: number
  id: string
  resultContent?: string
  startedAt: number
  state: ToolInvocationState
  toolName: string
}

export interface Message {
  id: string
  role: MessageRole
  content: string
  modelId?: string
  providerId?: ChatProviderId
  reasoningContent?: string
  reasoningCompletedAt?: number
  reasoningEffort?: ReasoningEffort
  timestamp: number
  toolInvocations?: ToolInvocationTrace[]
  userMessageKind?: UserMessageKind
}

export interface ConversationSummary {
  agentContextRootPath: string
  chatMode: ChatMode
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
  agentContextRootPath: string
  chatMode: ChatMode
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
  chatMode?: ChatMode
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
  appearance: AppAppearance
  chatModelId: string
  chatReasoningEffort: ReasoningEffort
  language: AppLanguage
  sendMessageOnEnter: boolean
  sidebarWidth: number
}

export interface CodexProviderConnectionStatus {
  accountId: string | null
  authFilePath: string
  email: string | null
  isAuthenticated: boolean
  lastRefreshAt: string | null
  tokenExpiresAt: string | null
}

export type ApiKeyProviderId = 'anthropic' | 'google' | 'openai' | 'openai-compatible'
export type ChatProviderId = 'codex' | ApiKeyProviderId
export type CustomModelProviderId = 'openai' | 'openai-compatible'
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'

export interface ApiKeyProviderStatus {
  baseUrl: string | null
  configured: boolean
  hasApiKey: boolean
  id: ApiKeyProviderId
  label: string
}

export interface ProvidersState {
  apiKeyProviders: ApiKeyProviderStatus[]
  codex: CodexProviderConnectionStatus
}

export interface SaveApiKeyProviderInput {
  apiKey: string
  baseUrl?: string
  providerId: ApiKeyProviderId
}

export interface CustomModelConfig {
  apiModelId: string
  createdAt: string
  id: string
  label: string
  providerId: CustomModelProviderId
  reasoningCapable: boolean
  updatedAt: string
}

export interface SaveCustomModelInput {
  apiModelId: string
  label?: string
  providerId: CustomModelProviderId
  reasoningCapable: boolean
}

export interface StartChatStreamInput {
  agentContextRootPath: string
  chatMode: ChatMode
  messages: Message[]
  modelId: string
  providerId: ChatProviderId
  reasoningEffort: ReasoningEffort
}

export interface StartChatStreamResult {
  streamId: string
}

export type ChatStreamEvent =
  | {
      streamId: string
      type: 'started'
    }
  | {
      delta: string
      streamId: string
      type: 'content_delta'
    }
  | {
      delta: string
      streamId: string
      type: 'reasoning_delta'
    }
  | {
      argumentsText: string
      invocationId: string
      startedAt: number
      streamId: string
      toolName: string
      type: 'tool_invocation_started'
    }
  | {
      argumentsText: string
      completedAt: number
      invocationId: string
      resultContent: string
      streamId: string
      syntheticMessage: Message
      toolName: string
      type: 'tool_invocation_completed'
    }
  | {
      argumentsText: string
      completedAt: number
      errorMessage: string
      invocationId: string
      resultContent: string
      streamId: string
      syntheticMessage: Message
      toolName: string
      type: 'tool_invocation_failed'
    }
  | {
      streamId: string
      type: 'completed'
    }
  | {
      streamId: string
      type: 'aborted'
    }
  | {
      errorMessage: string
      streamId: string
      type: 'error'
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
  getInitialSettings: () => AppSettings
  getSettings: () => Promise<AppSettings>
  updateSettings: (input: Partial<AppSettings>) => Promise<AppSettings>
}

export interface EchosphereProvidersApi {
  getProvidersState: () => Promise<ProvidersState>
  connectCodexWithOAuth: () => Promise<ProvidersState>
  disconnectCodex: () => Promise<ProvidersState>
  removeApiKeyProvider: (providerId: ApiKeyProviderId) => Promise<ProvidersState>
  saveApiKeyProvider: (input: SaveApiKeyProviderInput) => Promise<ProvidersState>
}

export interface EchosphereModelsApi {
  listCustomModels: () => Promise<CustomModelConfig[]>
  removeCustomModel: (modelId: string) => Promise<CustomModelConfig[]>
  saveCustomModel: (input: SaveCustomModelInput) => Promise<CustomModelConfig[]>
}

export interface EchosphereChatApi {
  cancelStream: (streamId: string) => Promise<void>
  onStreamEvent: (listener: (event: ChatStreamEvent) => void) => () => void
  startStream: (input: StartChatStreamInput) => Promise<StartChatStreamResult>
}
