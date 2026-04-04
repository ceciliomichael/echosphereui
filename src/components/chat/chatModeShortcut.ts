import type { ChatMode } from '../../types/chat'

export interface ChatModeShortcutOption {
  value: ChatMode
}

export interface ChatModeShortcutKeyEvent {
  altKey: boolean
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

export function isChatModeToggleShortcut(event: ChatModeShortcutKeyEvent) {
  return event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey && event.code === 'Period'
}

export function getNextChatMode(
  selectedChatMode: ChatMode,
  options: readonly ChatModeShortcutOption[],
): ChatMode | null {
  if (options.length === 0) {
    return null
  }

  const selectedIndex = options.findIndex((option) => option.value === selectedChatMode)
  if (selectedIndex < 0) {
    return options[0]?.value ?? null
  }

  for (let offset = 1; offset <= options.length; offset += 1) {
    const nextOption = options[(selectedIndex + offset) % options.length]
    if (nextOption.value !== selectedChatMode) {
      return nextOption.value
    }
  }

  return null
}
