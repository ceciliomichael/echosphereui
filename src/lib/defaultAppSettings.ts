import type { AppSettings } from '../types/chat'
import { DEFAULT_APP_APPEARANCE, DEFAULT_APP_LANGUAGE } from './appSettings'
import { DEFAULT_SIDEBAR_WIDTH } from './sidebarSizing'

export const DEFAULT_APP_SETTINGS: AppSettings = {
  appearance: DEFAULT_APP_APPEARANCE,
  language: DEFAULT_APP_LANGUAGE,
  sendMessageOnEnter: true,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
}
