import type { AppSettings } from '../types/chat'
import { DEFAULT_APP_APPEARANCE, DEFAULT_APP_LANGUAGE } from './appSettings'
import { DEFAULT_DIFF_PANEL_WIDTH } from './diffPanelSizing'
import { DEFAULT_SIDEBAR_WIDTH } from './sidebarSizing'

export const DEFAULT_APP_SETTINGS: AppSettings = {
  appearance: DEFAULT_APP_APPEARANCE,
  chatModelId: '',
  chatReasoningEffort: 'medium',
  diffPanelWidth: DEFAULT_DIFF_PANEL_WIDTH,
  language: DEFAULT_APP_LANGUAGE,
  lastActiveConversationId: null,
  revertEditSessionsByConversation: {},
  sendMessageOnEnter: true,
  sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
  sourceControlSectionOrder: ['commit', 'changes', 'history'],
  sourceControlSectionOpen: {
    changes: true,
    commit: true,
    history: true,
    staged: true,
    unstaged: true,
  },
  sourceControlSectionSizes: {
    changes: 1,
    commit: 1,
    history: 1,
  },
  terminalOpenByWorkspace: {},
  terminalPanelHeightsByWorkspace: {},
  terminalExecutionMode: 'sandbox',
}
