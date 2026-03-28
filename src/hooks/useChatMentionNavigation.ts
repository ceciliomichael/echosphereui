import { useCallback, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react'
import {
  getChatMentionAtPosition,
  getChatMentionBeforePosition,
  findChatMentionMatches,
} from '../lib/chatMentions'

interface UseChatMentionNavigationInput {
  onMentionBoundaryJump?: () => void
  mentionPathMap?: ReadonlyMap<string, string>
  onValueChange: (value: string) => void
  textareaRef: RefObject<HTMLTextAreaElement | null>
  value: string
}

function setTextareaCursor(textarea: HTMLTextAreaElement, cursorPosition: number) {
  window.requestAnimationFrame(() => {
    textarea.focus()
    textarea.setSelectionRange(cursorPosition, cursorPosition)
  })
}

export function useChatMentionNavigation({
  onMentionBoundaryJump,
  mentionPathMap,
  onValueChange,
  textareaRef,
  value,
}: UseChatMentionNavigationInput) {
  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
      const textarea = textareaRef.current
      if (!textarea) {
        return false
      }

      const cursorPosition = textarea.selectionStart ?? 0
      const selectionEnd = textarea.selectionEnd ?? cursorPosition
      const hasSelection = cursorPosition !== selectionEnd
      const validationMap = mentionPathMap && mentionPathMap.size > 0 ? mentionPathMap : undefined

      if (event.key === 'Backspace' && !hasSelection) {
        const mentionBefore = getChatMentionBeforePosition(value, cursorPosition, validationMap)
        if (mentionBefore) {
          event.preventDefault()
          onValueChange(`${value.slice(0, mentionBefore.start)}${value.slice(mentionBefore.end)}`)
          setTextareaCursor(textarea, mentionBefore.start)
          return true
        }

        const mentionAt = getChatMentionAtPosition(value, cursorPosition, validationMap)
        if (mentionAt) {
          event.preventDefault()
          onValueChange(`${value.slice(0, mentionAt.start)}${value.slice(mentionAt.end)}`)
          setTextareaCursor(textarea, mentionAt.start)
          return true
        }
      }

      if (event.key === 'Delete' && !hasSelection) {
        const mentionAt = findChatMentionMatches(value, validationMap).find((match) => match.start === cursorPosition)
        if (mentionAt) {
          event.preventDefault()
          onValueChange(`${value.slice(0, mentionAt.start)}${value.slice(mentionAt.end)}`)
          setTextareaCursor(textarea, mentionAt.start)
          return true
        }
      }

      if (event.key === 'ArrowLeft' && !hasSelection && !event.shiftKey) {
        const mentionBefore = getChatMentionBeforePosition(value, cursorPosition, validationMap)
        if (mentionBefore) {
          event.preventDefault()
          onMentionBoundaryJump?.()
          textarea.setSelectionRange(mentionBefore.start, mentionBefore.start)
          return true
        }

        const mentionAt = getChatMentionAtPosition(value, cursorPosition, validationMap)
        if (mentionAt) {
          event.preventDefault()
          onMentionBoundaryJump?.()
          textarea.setSelectionRange(mentionAt.start, mentionAt.start)
          return true
        }
      }

      if (event.key === 'ArrowRight' && !hasSelection && !event.shiftKey) {
        const mentionAt = getChatMentionAtPosition(value, cursorPosition, validationMap)
        if (mentionAt && cursorPosition >= mentionAt.start && cursorPosition < mentionAt.end) {
          event.preventDefault()
          onMentionBoundaryJump?.()
          textarea.setSelectionRange(mentionAt.end, mentionAt.end)
          return true
        }
      }

      return false
    },
    [mentionPathMap, onMentionBoundaryJump, onValueChange, textareaRef, value],
  )

  const handleClick = useCallback(() => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    if (textarea.selectionStart !== textarea.selectionEnd) {
      return
    }

    const cursorPosition = textarea.selectionStart ?? 0
    const validationMap = mentionPathMap && mentionPathMap.size > 0 ? mentionPathMap : undefined
    const mention = findChatMentionMatches(value, validationMap).find(
      (match) => cursorPosition >= match.start && cursorPosition <= match.end,
    )
    if (!mention) {
      return
    }

    if (cursorPosition >= mention.start && cursorPosition <= mention.end) {
      onMentionBoundaryJump?.()
      textarea.setSelectionRange(mention.end, mention.end)
    }
  },
    [mentionPathMap, onMentionBoundaryJump, textareaRef, value],
  )

  return {
    handleClick,
    handleKeyDown,
  }
}
