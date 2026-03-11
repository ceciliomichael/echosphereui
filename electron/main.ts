import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  screen,
  shell,
  type BrowserWindowConstructorOptions,
  type OpenDialogOptions,
} from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type {
  ApiKeyProviderId,
  AppendConversationMessagesInput,
  AppSettings,
  SaveCustomModelInput,
  StartChatStreamInput,
  CreateConversationFolderInput,
  CreateConversationInput,
  ReplaceConversationMessagesInput,
  SaveApiKeyProviderInput,
} from '../src/types/chat'
import {
  appendStoredMessages,
  createStoredFolder,
  createStoredConversation,
  deleteStoredConversation,
  getStoredConversation,
  listStoredConversations,
  listStoredFolders,
  replaceStoredMessages,
} from './history/store'
import { getStoredSettings, updateStoredSettings } from './settings/store'
import { serializeInitialSettingsArg } from './settings/bootstrap'
import { applyWindowTheme, getTitleBarOverlay, getWindowBackgroundColor, syncNativeThemeSource } from './window/theme'
import {
  connectCodexWithOAuth,
  disconnectCodex,
  getProvidersState,
  removeApiKeyProvider,
  saveApiKeyProvider,
} from './providers/service'
import { cancelChatStream, startChatStream } from './chat/service'
import { listCustomModels, removeCustomModel, saveCustomModel } from './models/service'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

app.commandLine.appendSwitch(
  'disable-features',
  'OverlayScrollbar,OverlayScrollbars,FluentOverlayScrollbar,FluentScrollbars',
)

let win: BrowserWindow | null
const MIN_WINDOW_WIDTH = 960
const MIN_WINDOW_HEIGHT = 680

function getInitialWindowBounds() {
  const { workArea } = screen.getPrimaryDisplay()

  return {
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
  }
}

async function createWindow() {
  const initialBounds = getInitialWindowBounds()
  const initialSettings = await getStoredSettings().catch(() => null)
  const initialAppearance = initialSettings?.appearance ?? 'system'
  syncNativeThemeSource(initialAppearance)
  const windowOptions: BrowserWindowConstructorOptions = {
    autoHideMenuBar: true,
    backgroundColor: getWindowBackgroundColor(initialAppearance),
    height: initialBounds.height,
    minHeight: MIN_WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    show: false,
    title: 'EchoSphere',
    width: initialBounds.width,
    x: initialBounds.x,
    y: initialBounds.y,
    webPreferences: {
      additionalArguments: initialSettings ? [serializeInitialSettingsArg(initialSettings)] : [],
      preload: path.join(__dirname, 'preload.mjs'),
    },
  }

  if (process.platform === 'win32' || process.platform === 'linux') {
    windowOptions.titleBarStyle = 'hidden'
    windowOptions.titleBarOverlay = getTitleBarOverlay(initialAppearance)
  }

  win = new BrowserWindow(windowOptions)
  applyWindowTheme(win, initialAppearance)

  win.setMenuBarVisibility(false)
  win.once('ready-to-show', () => {
    if (!win) {
      return
    }

    if (!win.isMaximized()) {
      win.maximize()
    }

    win.show()
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function registerHistoryHandlers() {
  ipcMain.handle('history:list', async () => listStoredConversations())
  ipcMain.handle('history:listFolders', async () => listStoredFolders())
  ipcMain.handle('history:get', async (_event, conversationId: string) => getStoredConversation(conversationId))
  ipcMain.handle('history:create', async (_event, input?: CreateConversationInput) => createStoredConversation(input))
  ipcMain.handle('history:createFolder', async (_event, input: CreateConversationFolderInput) =>
    createStoredFolder(input),
  )
  ipcMain.handle('history:pickFolder', async () => {
    const dialogOptions: OpenDialogOptions = {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select folder',
    }
    const result = win
      ? await dialog.showOpenDialog(win, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions)

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    const selectedPath = result.filePaths[0]
    return createStoredFolder({
      name: path.basename(selectedPath),
      path: selectedPath,
    })
  })
  ipcMain.handle('history:openFolderPath', async (_event, folderPath: string) => {
    await shell.openPath(folderPath)
  })
  ipcMain.handle('history:appendMessages', async (_event, input: AppendConversationMessagesInput) =>
    appendStoredMessages(input),
  )
  ipcMain.handle('history:replaceMessages', async (_event, input: ReplaceConversationMessagesInput) =>
    replaceStoredMessages(input),
  )
  ipcMain.handle('history:delete', async (_event, conversationId: string) =>
    deleteStoredConversation(conversationId),
  )
  ipcMain.handle('settings:get', async () => getStoredSettings())
  ipcMain.handle('settings:update', async (_event, input: Partial<AppSettings>) => {
    const nextSettings = await updateStoredSettings(input)

    if (win) {
      applyWindowTheme(win, nextSettings.appearance)
    }

    return nextSettings
  })
  ipcMain.handle('providers:state', async () => getProvidersState())
  ipcMain.handle('providers:codex:connectOauth', async () => connectCodexWithOAuth(shell.openExternal))
  ipcMain.handle('providers:codex:disconnect', async () => disconnectCodex())
  ipcMain.handle('providers:apikey:save', async (_event, input: SaveApiKeyProviderInput) => saveApiKeyProvider(input))
  ipcMain.handle('providers:apikey:remove', async (_event, providerId: ApiKeyProviderId) =>
    removeApiKeyProvider(providerId),
  )
  ipcMain.handle('models:custom:list', async () => listCustomModels())
  ipcMain.handle('models:custom:save', async (_event, input: SaveCustomModelInput) => saveCustomModel(input))
  ipcMain.handle('models:custom:remove', async (_event, modelId: string) => removeCustomModel(modelId))
  ipcMain.handle('chat:stream:start', async (event, input: StartChatStreamInput) =>
    startChatStream(event.sender, input),
  )
  ipcMain.handle('chat:stream:cancel', async (event, streamId: string) => cancelChatStream(event.sender, streamId))
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  registerHistoryHandlers()
  void createWindow()

  nativeTheme.on('updated', () => {
    const currentWindow = win

    if (!currentWindow) {
      return
    }

    void getStoredSettings()
      .then((settings) => {
        if (settings.appearance === 'system') {
          applyWindowTheme(currentWindow, settings.appearance)
        }
      })
      .catch((error) => {
        console.error('Failed to sync native theme', error)
      })
  })
})
