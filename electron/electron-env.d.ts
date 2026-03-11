/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * The built directory structure
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// Used in Renderer process, expose in `preload.ts`
interface Window {
  ipcRenderer: import('electron').IpcRenderer
  echosphereChat: import('../src/types/chat').EchosphereChatApi
  echosphereHistory: import('../src/types/chat').EchosphereHistoryApi
  echosphereModels: import('../src/types/chat').EchosphereModelsApi
  echosphereProviders: import('../src/types/chat').EchosphereProvidersApi
  echosphereSettings: import('../src/types/chat').EchosphereSettingsApi
}
