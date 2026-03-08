import { app, BrowserWindow, dialog, ipcMain, screen, shell, type BrowserWindowConstructorOptions, type OpenDialogOptions } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type {
  AppendConversationMessagesInput,
  AppSettings,
  CreateConversationFolderInput,
  CreateConversationInput,
  ReplaceConversationMessagesInput,
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
} from './historyStore'
import { getStoredSettings, updateStoredSettings } from './settingsStore'
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
const WINDOW_BACKGROUND_COLOR = '#EEF4EE'
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

function createWindow() {
  const initialBounds = getInitialWindowBounds()
  const windowOptions: BrowserWindowConstructorOptions = {
    autoHideMenuBar: true,
    backgroundColor: WINDOW_BACKGROUND_COLOR,
    height: initialBounds.height,
    minHeight: MIN_WINDOW_HEIGHT,
    minWidth: MIN_WINDOW_WIDTH,
    show: false,
    title: 'EchoSphere',
    width: initialBounds.width,
    x: initialBounds.x,
    y: initialBounds.y,
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
  }

  if (process.platform === 'win32' || process.platform === 'linux') {
    windowOptions.titleBarStyle = 'hidden'
    windowOptions.titleBarOverlay = {
      color: WINDOW_BACKGROUND_COLOR,
      symbolColor: '#101011',
      height: 36,
    }
  }

  win = new BrowserWindow(windowOptions)

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

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
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
  ipcMain.handle('settings:update', async (_event, input: Partial<AppSettings>) =>
    updateStoredSettings(input),
  )
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
  createWindow()
})
