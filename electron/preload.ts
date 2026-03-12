import { ipcRenderer, contextBridge } from 'electron'
import { parseInitialSettingsArg } from './settings/bootstrap'
import type {
  AppendConversationMessagesInput,
  ApiKeyProviderId,
  AppSettings,
  ChatStreamEvent,
  EstimateContextUsageInput,
  EchosphereChatApi,
  EchosphereModelsApi,
  EchosphereProvidersApi,
  SaveApiKeyProviderInput,
  SaveCustomModelInput,
  CreateConversationFolderInput,
  CreateConversationInput,
  EchosphereHistoryApi,
  EchosphereSettingsApi,
  ReplaceConversationMessagesInput,
  StartChatStreamInput,
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
  pickFolder: () => ipcRenderer.invoke('history:pickFolder'),
  openFolderPath: (folderPath: string) => ipcRenderer.invoke('history:openFolderPath', folderPath),
  appendMessages: (input: AppendConversationMessagesInput) => ipcRenderer.invoke('history:appendMessages', input),
  replaceMessages: (input: ReplaceConversationMessagesInput) =>
    ipcRenderer.invoke('history:replaceMessages', input),
  deleteConversation: (conversationId: string) => ipcRenderer.invoke('history:delete', conversationId),
}

const settingsApi: EchosphereSettingsApi = {
  getInitialSettings: () => parseInitialSettingsArg(process.argv),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (input: Partial<AppSettings>) => ipcRenderer.invoke('settings:update', input),
}

const providersApi: EchosphereProvidersApi = {
  getProvidersState: () => ipcRenderer.invoke('providers:state'),
  connectCodexWithOAuth: () => ipcRenderer.invoke('providers:codex:connectOauth'),
  disconnectCodex: () => ipcRenderer.invoke('providers:codex:disconnect'),
  saveApiKeyProvider: (input: SaveApiKeyProviderInput) => ipcRenderer.invoke('providers:apikey:save', input),
  removeApiKeyProvider: (providerId: ApiKeyProviderId) =>
    ipcRenderer.invoke('providers:apikey:remove', providerId),
}

const modelsApi: EchosphereModelsApi = {
  listCustomModels: () => ipcRenderer.invoke('models:custom:list'),
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
  startStream: (input: StartChatStreamInput) => ipcRenderer.invoke('chat:stream:start', input),
}

contextBridge.exposeInMainWorld('echosphereHistory', historyApi)
contextBridge.exposeInMainWorld('echosphereModels', modelsApi)
contextBridge.exposeInMainWorld('echosphereSettings', settingsApi)
contextBridge.exposeInMainWorld('echosphereProviders', providersApi)
contextBridge.exposeInMainWorld('echosphereChat', chatApi)
