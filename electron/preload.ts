import { ipcRenderer, contextBridge } from 'electron'
import { parseInitialSettingsArg } from './settingsBootstrap'
import type {
  AppendConversationMessagesInput,
  AppSettings,
  CreateConversationFolderInput,
  CreateConversationInput,
  EchosphereHistoryApi,
  EchosphereSettingsApi,
  ReplaceConversationMessagesInput,
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

contextBridge.exposeInMainWorld('echosphereHistory', historyApi)
contextBridge.exposeInMainWorld('echosphereSettings', settingsApi)
