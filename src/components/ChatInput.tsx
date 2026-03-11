import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { ArrowUp } from 'lucide-react'
import { chatInputSurfaceClassName } from '../lib/chatStyles'
import { Tooltip } from './Tooltip'
import { ModelSelectorField, type ModelSelectorOption } from './chat/ModelSelectorField'
import { ReasoningEffortBlock } from './chat/ReasoningEffortBlock'
import type { ReasoningEffort } from '../types/chat'

interface ChatInputProps {
  disabled?: boolean
  focusSignal?: number
  isEditing?: boolean
  modelOptions?: readonly ModelSelectorOption[]
  onCancelEdit?: () => void
  onModelChange?: (modelId: string) => void
  onReasoningEffortChange?: (effort: ReasoningEffort) => void
  onSend: () => void
  reasoningEffort?: ReasoningEffort
  selectedModelId?: string
  showReasoningEffortSelector?: boolean
  value: string
  onValueChange: (value: string) => void
  sendOnEnter?: boolean
  variant?: 'composer' | 'inline'
}

export function ChatInput({
  value,
  onValueChange,
  onSend,
  onCancelEdit,
  modelOptions = [],
  onModelChange,
  onReasoningEffortChange,
  isEditing = false,
  reasoningEffort = 'medium',
  selectedModelId = '',
  showReasoningEffortSelector = false,
  sendOnEnter = true,
  variant = 'composer',
  focusSignal,
  disabled = false,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const isInline = variant === 'inline'
  const showRuntimeControls = modelOptions.length > 0 && typeof onModelChange === 'function'

  const canSend = value.trim().length > 0 && !disabled

  function handleSend() {
    if (!canSend) return
    onSend()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (sendOnEnter && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }

    if (!sendOnEnter && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSend()
    }

    if (e.key === 'Escape' && isEditing && onCancelEdit) {
      e.preventDefault()
      onCancelEdit()
    }
  }

  function handleInput() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  useEffect(() => {
    handleInput()
  }, [value])

  useEffect(() => {
    if (focusSignal === undefined) {
      return
    }

    const textarea = textareaRef.current
    if (!textarea) {
      return
    }

    textarea.focus()
    const contentLength = textarea.value.length
    textarea.setSelectionRange(contentLength, contentLength)
  }, [focusSignal])

  useEffect(() => {
    const cancelEditing = onCancelEdit
    if (!isInline || !isEditing || !cancelEditing) {
      return
    }

    function handlePointerDown(event: PointerEvent) {
      const container = containerRef.current
      if (!container) {
        return
      }

      if (event.target instanceof Node && !container.contains(event.target)) {
        if (event.target instanceof Element && event.target.closest('[data-floating-menu-root="true"]')) {
          return
        }

        cancelEditing?.()
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [isInline, isEditing, onCancelEdit])

  return (
    <div ref={containerRef} className="w-full">
      <div className={`${chatInputSurfaceClassName} ${isInline ? 'px-4 py-3' : 'p-4'}`}>
        {isEditing && !isInline ? (
          <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-action/25 bg-action/10 px-3 py-2 text-xs text-foreground">
            <span>Editing message</span>
          </div>
        ) : null}

        <div>
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder={isEditing ? 'Edit your message...' : 'Type a message...'}
            disabled={disabled}
            rows={1}
            className="min-h-[28px] max-h-[150px] w-full resize-none border-none bg-transparent text-[15px] leading-6 text-foreground outline-none placeholder:text-subtle-foreground focus:outline-none focus:ring-0"
            style={{ fieldSizing: 'content' } as CSSProperties}
          />
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          {showRuntimeControls ? (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 md:flex-nowrap">
              <ModelSelectorField
                value={selectedModelId}
                onChange={onModelChange ?? (() => undefined)}
                options={modelOptions}
                disabled={disabled}
              />

              {showReasoningEffortSelector && onReasoningEffortChange ? (
                <ReasoningEffortBlock
                  value={reasoningEffort}
                  onChange={onReasoningEffortChange}
                  disabled={disabled}
                />
              ) : null}
            </div>
          ) : null}

          <div className="flex shrink-0 justify-end self-end">
            <Tooltip content={isEditing ? 'Send edited message' : 'Send message'}>
              <button
                type="button"
                onClick={handleSend}
                disabled={!canSend}
                aria-label={isEditing ? 'Send edited message' : 'Send message'}
                className={[
                  'flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150',
                  canSend
                    ? 'chat-send-button-enabled cursor-pointer hover:scale-[1.03] active:scale-95'
                    : 'chat-send-button-disabled cursor-not-allowed',
                ].join(' ')}
              >
                <ArrowUp size={16} strokeWidth={2.5} />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
    </div>
  )
}
