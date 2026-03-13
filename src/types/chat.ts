import type { AppAppearance, AppLanguage } from '../lib/appSettings'

export type MessageRole = 'user' | 'assistant' | 'tool'
export type ChatMode = 'agent'
export type UserMessageKind = 'human' | 'tool_result'
export type ToolInvocationState = 'running' | 'completed' | 'failed'
export type AssistantWaitingIndicatorVariant = 'thinking' | 'splash'
export type ChatAttachmentKind = 'image' | 'text'

export interface FileDiffToolResultPresentation {
  addedLineCount?: number
  contextLines?: number
  endLineNumber?: number
  fileName: string
  kind: 'file_diff'
  newContent: string
  oldContent: string | null
  removedLineCount?: number
  startLineNumber?: number
}

export type ToolInvocationResultPresentation = FileDiffToolResultPresentation

interface ChatAttachmentBase {
  fileName: string
  id: string
  kind: ChatAttachmentKind
  mimeType: string
  sizeBytes: number
}

export interface ChatImageAttachment extends ChatAttachmentBase {
  dataUrl: string
  kind: 'image'
}

export interface ChatTextAttachment extends ChatAttachmentBase {
  kind: 'text'
  textContent: string
}

export type ChatAttachment = ChatImageAttachment | ChatTextAttachment

export interface ToolInvocationTrace {
  argumentsText: string
  completedAt?: number
  id: string
  resultContent?: string
  resultPresentation?: ToolInvocationResultPresentation
  startedAt: number
  state: ToolInvocationState
  toolName: string
}

export interface Message {
  attachments?: ChatAttachment[]
  id: string
  role: MessageRole
  content: string
  modelId?: string
  providerId?: ChatProviderId
  reasoningContent?: string
  reasoningCompletedAt?: number
  reasoningEffort?: ReasoningEffort
  runCheckpoint?: UserMessageRunCheckpoint
  timestamp: number
  toolCallId?: string
  toolInvocations?: ToolInvocationTrace[]
  userMessageKind?: UserMessageKind
}

export interface UserMessageRunCheckpoint {
  createdAt: number
  id: string
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
  hasRunningTask?: boolean
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
  diffPanelWidth: number
  language: AppLanguage
  lastActiveConversationId: string | null
  sendMessageOnEnter: boolean
  sidebarWidth: number
}

export interface CodexProviderConnectionStatus {
  accountId: string | null
  authFilePath: string
  email: string | null
  accounts: CodexAccountSummary[]
  isAuthenticated: boolean
  lastRefreshAt: string | null
  tokenExpiresAt: string | null
}

export interface CodexUsageWindow {
  usedPercent: number
  limitWindowSeconds: number
  resetAfterSeconds: number
  resetAt: number
}

export interface CodexUsageSnapshot {
  fetchedAt: string
  primary: CodexUsageWindow | null
  secondary: CodexUsageWindow | null
}

export interface CodexAccountSummary {
  accountId: string
  email: string | null
  isActive: boolean
  label: string
  lastRefreshAt: string | null
  tokenExpiresAt: string | null
  usage: CodexUsageSnapshot | null
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

export interface EstimateContextUsageInput {
  agentContextRootPath: string | null
  chatMode: ChatMode
  messages: Message[]
  providerId: ChatProviderId
}

export interface CreateWorkspaceCheckpointInput {
  workspaceRootPath: string
}

export interface ContextUsageEstimate {
  historyTokens: number
  maxTokens: number
  systemPromptTokens: number
  toolResultsTokens: number
  totalTokens: number
}

export interface GitBranchState {
  branches: string[]
  currentBranch: string | null
  hasRepository: boolean
  isDetachedHead: boolean
  repoRootPath: string | null
}

export interface CheckoutGitBranchInput {
  branchName: string
  workspacePath: string
}

export interface CreateGitBranchInput {
  branchName: string
  workspacePath: string
}

export interface GitFileDiff {
  addedLineCount?: number
  fileName: string
  newContent: string
  oldContent: string | null
  removedLineCount?: number
}

export interface GitDiffSnapshot {
  fileDiffs: GitFileDiff[]
  hasRepository: boolean
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
      invocationId: string
      streamId: string
      toolName: string
      type: 'tool_invocation_delta'
    }
  | {
      argumentsText: string
      completedAt: number
      invocationId: string
      resultContent: string
      resultPresentation?: ToolInvocationResultPresentation
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
      resultPresentation?: ToolInvocationResultPresentation
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
  updateConversationTitle: (conversationId: string, title: string) => Promise<ConversationRecord>
  deleteConversation: (conversationId: string) => Promise<void>
}

export interface EchosphereSettingsApi {
  getInitialSettings: () => AppSettings
  getSettings: () => Promise<AppSettings>
  updateSettings: (input: Partial<AppSettings>) => Promise<AppSettings>
}

export interface EchosphereProvidersApi {
  getProvidersState: () => Promise<ProvidersState>
  addCodexAccountWithOAuth: () => Promise<ProvidersState>
  connectCodexWithOAuth: () => Promise<ProvidersState>
  disconnectCodex: () => Promise<ProvidersState>
  removeApiKeyProvider: (providerId: ApiKeyProviderId) => Promise<ProvidersState>
  saveApiKeyProvider: (input: SaveApiKeyProviderInput) => Promise<ProvidersState>
  switchCodexAccount: (accountId: string) => Promise<ProvidersState>
}

export interface EchosphereModelsApi {
  listCustomModels: () => Promise<CustomModelConfig[]>
  removeCustomModel: (modelId: string) => Promise<CustomModelConfig[]>
  saveCustomModel: (input: SaveCustomModelInput) => Promise<CustomModelConfig[]>
}

export interface EchosphereChatApi {
  cancelStream: (streamId: string) => Promise<void>
  estimateContextUsage: (input: EstimateContextUsageInput) => Promise<ContextUsageEstimate>
  onStreamEvent: (listener: (event: ChatStreamEvent) => void) => () => void
  startStream: (input: StartChatStreamInput) => Promise<StartChatStreamResult>
}

export interface EchosphereWorkspaceApi {
  createCheckpoint: (input: CreateWorkspaceCheckpointInput) => Promise<UserMessageRunCheckpoint>
  restoreCheckpoint: (checkpointId: string) => Promise<void>
}

export interface EchosphereGitApi {
  checkoutBranch: (input: CheckoutGitBranchInput) => Promise<GitBranchState>
  createAndCheckoutBranch: (input: CreateGitBranchInput) => Promise<GitBranchState>
  getDiffs: (workspacePath: string) => Promise<GitDiffSnapshot>
  getBranches: (workspacePath: string) => Promise<GitBranchState>
}
