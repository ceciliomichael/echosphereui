import { ipcRenderer, contextBridge } from 'electron'
import { parseInitialSettingsArg } from './settings/bootstrap'
import type {
  AppendConversationMessagesInput,
  ApiKeyProviderId,
  AppSettings,
  ChatStreamEvent,
  EstimateContextUsageInput,
  EchosphereChatApi,
  EchosphereGitApi,
  EchosphereModelsApi,
  EchosphereProvidersApi,
  EchosphereTerminalApi,
  GitCommitInput,
  GitHistoryCommitDetailsInput,
  GitHistoryPageInput,
  SaveApiKeyProviderInput,
  SaveCustomModelInput,
  RenameConversationFolderInput,
  CreateConversationFolderInput,
  CreateConversationInput,
  CreateWorkspaceCheckpointInput,
  EchosphereHistoryApi,
  EchosphereSettingsApi,
  EchosphereWorkspaceApi,
  GitFileStageInput,
  GitSyncInput,
  ReplaceConversationMessagesInput,
  CloseTerminalSessionInput,
  CreateTerminalSessionInput,
  OpenExternalTerminalLinkInput,
  ResizeTerminalSessionInput,
  SubmitToolDecisionInput,
  StartChatStreamInput,
  WriteTerminalSessionInput,
} from '../src/types/chat'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APTs you need here.
  // ...
})

const historyApi: EchosphereHistoryApi = {
  listConversations: () => ipcRenderer.invoke('history:list'),
  listFolders: () => ipcRenderer.invoke('history:listFolders'),
  getConversation: (conversationId: string) => ipcRenderer.invoke('history:get', conversationId),
  createConversation: (input?: CreateConversationInput) => ipcRenderer.invoke('history:create', input),
  createFolder: (input: CreateConversationFolderInput) => ipcRenderer.invoke('history:createFolder', input),
  renameFolder: (input: RenameConversationFolderInput) => ipcRenderer.invoke('history:renameFolder', input),
  deleteFolder: (folderId: string) => ipcRenderer.invoke('history:deleteFolder', folderId),
  pickFolder: () => ipcRenderer.invoke('history:pickFolder'),
  openFolderPath: (folderPath: string) => ipcRenderer.invoke('history:openFolderPath', folderPath),
  appendMessages: (input: AppendConversationMessagesInput) => ipcRenderer.invoke('history:appendMessages', input),
  replaceMessages: (input: ReplaceConversationMessagesInput) =>
    ipcRenderer.invoke('history:replaceMessages', input),
  updateConversationTitle: (conversationId: string, title: string) =>
    ipcRenderer.invoke('history:updateTitle', conversationId, title),
  deleteConversation: (conversationId: string) => ipcRenderer.invoke('history:delete', conversationId),
}

const settingsApi: EchosphereSettingsApi = {
  getInitialSettings: () => parseInitialSettingsArg(process.argv),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (input: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', input),
}

const providersApi: EchosphereProvidersApi = {
  getProvidersState: () => ipcRenderer.invoke('providers:state'),
  addCodexAccountWithOAuth: () => ipcRenderer.invoke('providers:codex:addAccountOauth'),
  connectCodexWithOAuth: () => ipcRenderer.invoke('providers:codex:connectOauth'),
  disconnectCodex: () => ipcRenderer.invoke('providers:codex:disconnect'),
  saveApiKeyProvider: (input: SaveApiKeyProviderInput) => ipcRenderer.invoke('providers:apikey:save', input),
  removeApiKeyProvider: (providerId: ApiKeyProviderId) =>
    ipcRenderer.invoke('providers:apikey:remove', providerId),
  switchCodexAccount: (accountId: string) => ipcRenderer.invoke('providers:codex:switchAccount', accountId),
}

const modelsApi: EchosphereModelsApi = {
  listCustomModels: () => ipcRenderer.invoke('models:custom:list'),
  listProviderModels: (providerId: ApiKeyProviderId) => ipcRenderer.invoke('models:provider:list', providerId),
  saveCustomModel: (input: SaveCustomModelInput) => ipcRenderer.invoke('models:custom:save', input),
  removeCustomModel: (modelId: string) => ipcRenderer.invoke('models:custom:remove', modelId),
}

const chatApi: EchosphereChatApi = {
  cancelStream: (streamId: string) => ipcRenderer.invoke('chat:stream:cancel', streamId),
  estimateContextUsage: (input: EstimateContextUsageInput) => ipcRenderer.invoke('chat:context-usage:estimate', input),
  onStreamEvent: (listener: (event: ChatStreamEvent) => void) => {
    const wrappedListener = (_event: unknown, payload: ChatStreamEvent) => listener(payload)
    ipcRenderer.on('chat:stream:event', wrappedListener)
    return () => {
      ipcRenderer.off('chat:stream:event', wrappedListener)
    }
  },
  submitToolDecision: (input: SubmitToolDecisionInput) => ipcRenderer.invoke('chat:stream:submitToolDecision', input),
  startStream: (input: StartChatStreamInput) => ipcRenderer.invoke('chat:stream:start', input),
}

const gitApi: EchosphereGitApi = {
  checkoutBranch: (input) => ipcRenderer.invoke('git:checkoutBranch', input),
  commit: (input: GitCommitInput) => ipcRenderer.invoke('git:commit', input),
  createAndCheckoutBranch: (input) => ipcRenderer.invoke('git:createAndCheckoutBranch', input),
  discardFileChanges: (input: GitFileStageInput) => ipcRenderer.invoke('git:discardFileChanges', input),
  getBranches: (workspacePath: string) => ipcRenderer.invoke('git:getBranches', workspacePath),
  getHistoryCommitDetails: (input: GitHistoryCommitDetailsInput) => ipcRenderer.invoke('git:getHistoryCommitDetails', input),
  getDiffs: (workspacePath: string) => ipcRenderer.invoke('git:getDiffs', workspacePath),
  getHistoryPage: (input: GitHistoryPageInput) => ipcRenderer.invoke('git:getHistoryPage', input),
  getStatus: (workspacePath: string) => ipcRenderer.invoke('git:getStatus', workspacePath),
  sync: (input: GitSyncInput) => ipcRenderer.invoke('git:sync', input),
  stageFile: (input: GitFileStageInput) => ipcRenderer.invoke('git:stageFile', input),
  unstageFile: (input: GitFileStageInput) => ipcRenderer.invoke('git:unstageFile', input),
}

const workspaceApi: EchosphereWorkspaceApi = {
  createCheckpoint: (input: CreateWorkspaceCheckpointInput) => ipcRenderer.invoke('workspace:checkpoint:create', input),
  createRedoCheckpointFromSource: (sourceCheckpointId: string) =>
    ipcRenderer.invoke('workspace:checkpoint:createRedoFromSource', sourceCheckpointId),
  createEntry: (input) => ipcRenderer.invoke('workspace:explorer:createEntry', input),
  deleteEntry: (input) => ipcRenderer.invoke('workspace:explorer:deleteEntry', input),
  listDirectory: (input) => ipcRenderer.invoke('workspace:explorer:listDirectory', input),
  readFile: (input) => ipcRenderer.invoke('workspace:explorer:readFile', input),
  renameEntry: (input) => ipcRenderer.invoke('workspace:explorer:renameEntry', input),
  transferEntry: (input) => ipcRenderer.invoke('workspace:explorer:transferEntry', input),
  writeFile: (input) => ipcRenderer.invoke('workspace:explorer:writeFile', input),
  restoreCheckpoint: (checkpointId: string) => ipcRenderer.invoke('workspace:checkpoint:restore', checkpointId),
}

const terminalApi: EchosphereTerminalApi = {
  closeSession: (input: CloseTerminalSessionInput) => ipcRenderer.invoke('terminal:closeSession', input),
  createSession: (input: CreateTerminalSessionInput) => ipcRenderer.invoke('terminal:createSession', input),
  openExternalLink: (input: OpenExternalTerminalLinkInput) => ipcRenderer.invoke('terminal:openExternalLink', input),
  onData: (listener) => {
    const wrappedListener = (_event: unknown, payload: Parameters<typeof listener>[0]) => listener(payload)
    ipcRenderer.on('terminal:session:data', wrappedListener)
    return () => {
      ipcRenderer.off('terminal:session:data', wrappedListener)
    }
  },
  onExit: (listener) => {
    const wrappedListener = (_event: unknown, payload: Parameters<typeof listener>[0]) => listener(payload)
    ipcRenderer.on('terminal:session:exit', wrappedListener)
    return () => {
      ipcRenderer.off('terminal:session:exit', wrappedListener)
    }
  },
  resizeSession: (input: ResizeTerminalSessionInput) => ipcRenderer.invoke('terminal:resizeSession', input),
  writeToSession: (input: WriteTerminalSessionInput) => ipcRenderer.invoke('terminal:writeToSession', input),
}

contextBridge.exposeInMainWorld('echosphereHistory', historyApi)
contextBridge.exposeInMainWorld('echosphereModels', modelsApi)
contextBridge.exposeInMainWorld('echosphereSettings', settingsApi)
contextBridge.exposeInMainWorld('echosphereProviders', providersApi)
contextBridge.exposeInMainWorld('echosphereChat', chatApi)
contextBridge.exposeInMainWorld('echosphereGit', gitApi)
contextBridge.exposeInMainWorld('echosphereWorkspace', workspaceApi)
contextBridge.exposeInMainWorld('echosphereTerminal', terminalApi)
